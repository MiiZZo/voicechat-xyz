import { useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { useStore } from '../state/store.js';

/**
 * A singleton publisher that broadcasts the VAD analyser's most recent
 * readings (level in dBFS + gate-open state) to any subscriber. The Settings
 * modal's level meter consumes this so the bar it draws is the *exact same*
 * number that VAD compares against the threshold — no second analyser, no
 * second `getUserMedia`, no math drift. When VAD isn't running, the meter
 * falls back to its own dedicated capture stream.
 */
type VadSnapshot = { levelDb: number; open: boolean };
type VadListener = (s: VadSnapshot) => void;
const vadListeners = new Set<VadListener>();
let vadActive = false;
let lastSnapshot: VadSnapshot = { levelDb: -100, open: false };

function publishSnapshot(next: VadSnapshot) {
  lastSnapshot = next;
  vadListeners.forEach((fn) => fn(next));
}

export function isVadAnalyserActive(): boolean {
  return vadActive;
}

export function getLastVadSnapshot(): VadSnapshot {
  return lastSnapshot;
}

export function subscribeVad(listener: VadListener): () => void {
  vadListeners.add(listener);
  // Fire immediately so subscribers don't have to wait for the next analyser
  // tick to render a value.
  listener(lastSnapshot);
  return () => {
    vadListeners.delete(listener);
  };
}

/**
 * Voice activation (VAD) — opens the LiveKit microphone gate when input
 * level crosses {@link Prefs.voiceActivation.thresholdDb}, and closes it
 * after `releaseMs` of silence. Uses hysteresis (the open-gate threshold is
 * lowered by `hysteresisDb` while open) to prevent flapping on syllable
 * boundaries.
 *
 * Why a dedicated `getUserMedia` stream rather than the LiveKit track:
 * when LK toggles the published track via `setMicrophoneEnabled(false)` the
 * underlying MediaStreamTrack gets disabled and produces silent samples, so
 * we'd never detect speech to re-open. The dedicated capture stream is
 * always live while VAD is active. We use the same audio constraints as
 * LiveKit (matching `audioCaptureDefaults` in `useLiveKitRoom`) so the
 * threshold the user calibrates in Settings stays meaningful.
 *
 * Threshold/release/hysteresis are read through refs so slider changes in
 * Settings take effect immediately without tearing down the analyser.
 *
 * Returns the current "open" state so the UI can render a speaking indicator.
 */
export function useVoiceActivation(room: Room | null): boolean {
  const { prefs } = useStore();
  const [open, setOpen] = useState(false);

  const enabled = !!room && prefs?.micActivationMode === 'vad';
  const deviceId = prefs?.audioInputDeviceId ?? null;
  const ec = prefs?.audioConstraints.echoCancellation ?? true;
  const ns = prefs?.audioConstraints.noiseSuppression ?? true;
  const agc = prefs?.audioConstraints.autoGainControl ?? false;

  // Read live tunables through refs so slider changes apply without a remount
  // (which would otherwise drop the AudioContext and re-prompt the OS for the
  // mic — visible as a brief mute glitch).
  const thresholdRef = useRef(prefs?.voiceActivation.thresholdDb ?? -45);
  const releaseRef = useRef(prefs?.voiceActivation.releaseMs ?? 400);
  const hysteresisRef = useRef(prefs?.voiceActivation.hysteresisDb ?? 6);
  thresholdRef.current = prefs?.voiceActivation.thresholdDb ?? thresholdRef.current;
  releaseRef.current = prefs?.voiceActivation.releaseMs ?? releaseRef.current;
  hysteresisRef.current = prefs?.voiceActivation.hysteresisDb ?? hysteresisRef.current;

  useEffect(() => {
    if (!enabled || !room) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    // Explicit ArrayBuffer backing — Web Audio's getFloatTimeDomainData
    // signature rejects the wider ArrayBufferLike type.
    let buffer: Float32Array<ArrayBuffer> | null = null;
    let rafId: number | null = null;
    // Latest gate state, in a closure variable so the analyser loop can read
    // it without re-rendering and so the cleanup runs after a final mute.
    let gateOpen = false;
    // Timestamp of the last sample whose level was above the open threshold.
    // Drives the release (hangover) timeout independently of frame rate.
    let lastAboveAt = 0;

    // Initial mute — the gate starts closed. We don't await this so the
    // analyser starts measuring immediately.
    room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);

    const setGate = (next: boolean) => {
      if (next === gateOpen) return;
      gateOpen = next;
      setOpen(next);
      room.localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
    };

    const tick = () => {
      if (cancelled || !analyser || !buffer) return;
      analyser.getFloatTimeDomainData(buffer);
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] ?? 0;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const clampedDb = db < -100 ? -100 : db;

      // Hysteresis: once the gate is open we use a lower threshold so a
      // syllable trough doesn't slam it shut. `hysteresisDb` is positive,
      // so the close threshold sits below the open threshold.
      const openTh = thresholdRef.current;
      const closeTh = openTh - hysteresisRef.current;
      const now = performance.now();

      if (clampedDb >= openTh) {
        lastAboveAt = now;
        if (!gateOpen) setGate(true);
      } else if (gateOpen) {
        if (clampedDb >= closeTh) {
          // Still in the hysteresis band — keep gate open and refresh hangover.
          lastAboveAt = now;
        } else if (now - lastAboveAt >= releaseRef.current) {
          setGate(false);
        }
      }

      // Publish *the same number* the gate just compared to the threshold,
      // along with the current open state (which includes the release tail).
      // The Settings meter subscribes to this so the bar and tick line up.
      publishSnapshot({ levelDb: clampedDb, open: gateOpen });

      rafId = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ?? undefined,
            echoCancellation: ec,
            noiseSuppression: ns,
            autoGainControl: agc,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        // smoothingTimeConstant only affects the *frequency-domain* getters;
        // we use getFloatTimeDomainData, so this is informational.
        analyser.smoothingTimeConstant = 0;
        buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        source.connect(analyser);
        vadActive = true;
        rafId = requestAnimationFrame(tick);
      } catch {
        // No permission / no device — leave the mic muted. Surfacing this as
        // a toast is the LiveKitRoom hook's responsibility on initial connect.
      }
    })();

    return () => {
      cancelled = true;
      vadActive = false;
      // One last snapshot so any subscriber rendering "open" goes back to
      // closed/silent immediately rather than freezing on the last value.
      publishSnapshot({ levelDb: -100, open: false });
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
      // Restore mic to "on" if VAD was disabled (mode change). We can't tell
      // here whether the user wants it on or off after the change — the
      // useLiveKitRoom mic-enable flow runs on connect, and PTT/always-on
      // hooks own the steady state going forward.
      setOpen(false);
    };
  }, [enabled, room, deviceId, ec, ns, agc]);

  return open;
}
