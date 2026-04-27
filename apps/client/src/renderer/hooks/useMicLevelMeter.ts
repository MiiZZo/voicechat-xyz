import { useEffect, useRef, useState } from 'react';
import { isVadAnalyserActive, subscribeVad } from './useVoiceActivation.js';

type Options = {
  /** Selected input device id, null = system default. */
  deviceId: string | null;
  /** Audio processing constraints — should match the LiveKit capture defaults. */
  constraints: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  /** When false, the meter does not open getUserMedia and reports -Infinity. */
  enabled: boolean;
};

export type MicLevelReading = {
  /** Instantaneous RMS level in dBFS, floored at -100. */
  levelDb: number;
  /** Decaying peak hold marker (dBFS), so brief transients stay visible. */
  peakDb: number;
  /**
   * True when the VAD gate is currently open (including the release-hangover
   * window). Only meaningful when VAD is the active activation mode and the
   * room is connected; otherwise always false. Lets the meter reflect why
   * the mic is transmitting even if the level dipped below the threshold.
   */
  vadOpen: boolean;
  error: string | null;
};

const PEAK_DECAY_DB_PER_SEC = 24;
const FLOOR_DB = -100;

/**
 * Live microphone input level meter for the Settings modal.
 *
 * When `useVoiceActivation` is running (VAD mode in a connected room), this
 * hook subscribes to the VAD analyser's published readings — that way the
 * bar in Settings shows *exactly* the number VAD compares to the threshold,
 * with no second `getUserMedia` and no math drift between two graphs.
 *
 * Otherwise (no room, or PTT/always-on mode), it falls back to a dedicated
 * capture stream so the user can still calibrate the threshold pre-flight.
 *
 * Adds a decaying peak-hold marker so brief transients (a plosive that
 * triggers the gate) remain visible long enough for the user to see them.
 */
export function useMicLevelMeter(opts: Options): MicLevelReading {
  const { deviceId, constraints, enabled } = opts;
  const [reading, setReading] = useState<MicLevelReading>({
    levelDb: FLOOR_DB,
    peakDb: FLOOR_DB,
    vadOpen: false,
    error: null,
  });

  // Mutable state for the rAF loop / subscription so we don't re-render on
  // every tick. We only push to React state when the rounded value changes.
  const peakRef = useRef(FLOOR_DB);
  const peakAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      peakRef.current = FLOOR_DB;
      peakAtRef.current = 0;
      setReading({ levelDb: FLOOR_DB, peakDb: FLOOR_DB, vadOpen: false, error: null });
      return;
    }

    let cancelled = false;
    let lastPushedLevel = NaN;
    let lastPushedPeak = NaN;
    let lastPushedOpen = false;

    /** Update peak with linear decay since the previous sample. */
    const updatePeak = (db: number, now: number): number => {
      const dtSec = peakAtRef.current === 0 ? 0 : (now - peakAtRef.current) / 1000;
      const decayed = peakRef.current - PEAK_DECAY_DB_PER_SEC * dtSec;
      const next = Math.max(db, decayed, FLOOR_DB);
      peakRef.current = next;
      peakAtRef.current = now;
      return next;
    };

    /** Push a reading to React state, throttled to "interesting" changes. */
    const push = (levelDb: number, peakDb: number, vadOpen: boolean, error: string | null) => {
      // Round to 0.5 dB so we don't trigger a re-render on every microscopic
      // RMS jitter. The bar's pixel width can't resolve that anyway.
      const r = (n: number) => Math.round(n * 2) / 2;
      const rl = r(levelDb);
      const rp = r(peakDb);
      if (rl === lastPushedLevel && rp === lastPushedPeak && vadOpen === lastPushedOpen) {
        return;
      }
      lastPushedLevel = rl;
      lastPushedPeak = rp;
      lastPushedOpen = vadOpen;
      setReading({ levelDb: rl, peakDb: rp, vadOpen, error });
    };

    // ---- Path A: subscribe to the VAD analyser if it's already running.
    // We have to *re-check* on each tick because the user can switch modes
    // (e.g. always→vad) without remounting this hook; the unsubscribe + new
    // subscribe is cheap.
    let unsubscribe: (() => void) | null = null;
    let pollId: number | null = null;
    let cleanupStandalone: (() => void) | null = null;

    const startStandalone = () => {
      // Open our own getUserMedia + analyser. Same parameters as VAD's
      // analyser so the readings are directly comparable.
      let stream: MediaStream | null = null;
      let ctx: AudioContext | null = null;
      let source: MediaStreamAudioSourceNode | null = null;
      let analyser: AnalyserNode | null = null;
      let buffer: Float32Array<ArrayBuffer> | null = null;
      let rafId: number | null = null;
      let aborted = false;

      const tick = () => {
        if (aborted || !analyser || !buffer) return;
        analyser.getFloatTimeDomainData(buffer);
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = buffer[i] ?? 0;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : FLOOR_DB;
        const clamped = db < FLOOR_DB ? FLOOR_DB : db;
        const now = performance.now();
        const peak = updatePeak(clamped, now);
        push(clamped, peak, false, null);
        rafId = requestAnimationFrame(tick);
      };

      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ?? undefined,
              echoCancellation: constraints.echoCancellation,
              noiseSuppression: constraints.noiseSuppression,
              autoGainControl: constraints.autoGainControl,
            },
          });
          if (aborted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          ctx = new AudioContext();
          source = ctx.createMediaStreamSource(stream);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          // smoothingTimeConstant only affects frequency-domain getters; we
          // use the time-domain RMS so this is informational. We mirror the
          // VAD analyser's value for clarity.
          analyser.smoothingTimeConstant = 0;
          buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
          source.connect(analyser);
          rafId = requestAnimationFrame(tick);
        } catch (err) {
          if (!aborted) {
            push(FLOOR_DB, FLOOR_DB, false, (err as Error).message || 'Не удалось открыть микрофон');
          }
        }
      })();

      cleanupStandalone = () => {
        aborted = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
        try {
          source?.disconnect();
        } catch {
          /* ignore */
        }
        try {
          analyser?.disconnect();
        } catch {
          /* ignore */
        }
        ctx?.close().catch(() => undefined);
        stream?.getTracks().forEach((t) => t.stop());
      };
    };

    const stopStandalone = () => {
      cleanupStandalone?.();
      cleanupStandalone = null;
    };

    const startVadSubscription = () => {
      unsubscribe = subscribeVad(({ levelDb, open }) => {
        const now = performance.now();
        const peak = updatePeak(levelDb, now);
        push(levelDb, peak, open, null);
      });
    };

    const stopVadSubscription = () => {
      unsubscribe?.();
      unsubscribe = null;
    };

    /** Switch between the two paths based on whether VAD is currently active. */
    const reconcile = () => {
      if (cancelled) return;
      if (isVadAnalyserActive()) {
        if (cleanupStandalone) stopStandalone();
        if (!unsubscribe) startVadSubscription();
      } else {
        if (unsubscribe) stopVadSubscription();
        if (!cleanupStandalone) startStandalone();
      }
    };

    reconcile();
    // Poll for mode changes — the VAD bus is module-level and doesn't push a
    // "started/stopped" event on its own. 250ms is well below human response
    // time and keeps the meter visually consistent across mode toggles.
    pollId = window.setInterval(reconcile, 250);

    return () => {
      cancelled = true;
      if (pollId !== null) window.clearInterval(pollId);
      stopVadSubscription();
      stopStandalone();
    };
  }, [
    enabled,
    deviceId,
    constraints.echoCancellation,
    constraints.noiseSuppression,
    constraints.autoGainControl,
  ]);

  return reading;
}
