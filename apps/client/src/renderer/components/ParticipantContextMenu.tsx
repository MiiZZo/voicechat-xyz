import { Volume2, VolumeX } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu.js';
import { Slider } from './ui/slider.js';
import { useStore } from '../state/store.js';

type Props = {
  participantName: string;
  /** Показывать ли блок громкости/mute для screen-share audio.
   *  true — у этого участника есть publication Track.Source.ScreenShareAudio. */
  hasScreenShareAudio: boolean;
  children: React.ReactNode;
};

export function ParticipantContextMenu({ participantName, hasScreenShareAudio, children }: Props) {
  const { prefs, setPrefs } = useStore();

  if (!prefs) return <>{children}</>;

  const muted = !!prefs.participantMuted[participantName];
  const volume = prefs.participantVolumes[participantName] ?? 1;
  const screenMuted = !!prefs.participantScreenShareMuted[participantName];
  const screenVolume = prefs.participantScreenShareVolumes[participantName] ?? 1;

  const setVolume = async (v: number) => {
    const next = await window.api.setPrefs({
      participantVolumes: { ...prefs.participantVolumes, [participantName]: v },
    });
    setPrefs(next);
  };

  const toggleMute = async () => {
    const next = await window.api.setPrefs({
      participantMuted: { ...prefs.participantMuted, [participantName]: !muted },
    });
    setPrefs(next);
  };

  const setScreenVolume = async (v: number) => {
    const next = await window.api.setPrefs({
      participantScreenShareVolumes: { ...prefs.participantScreenShareVolumes, [participantName]: v },
    });
    setPrefs(next);
  };

  const toggleScreenMute = async () => {
    const next = await window.api.setPrefs({
      participantScreenShareMuted: { ...prefs.participantScreenShareMuted, [participantName]: !screenMuted },
    });
    setPrefs(next);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel className="text-xs font-semibold normal-case tracking-normal text-fg">
          {participantName}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {/* SubLabel-style категория (text-xs font-medium text-fg-muted) — тот
            же паттерн mini-header'а, что и Group title в SettingsModal. */}
        <ContextMenuLabel className="px-2 pt-1 pb-0 text-xs font-medium text-fg-muted">
          Голос
        </ContextMenuLabel>
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleMute();
          }}
          className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
        >
          {muted ? <VolumeX /> : <Volume2 />}
          <span>{muted ? 'Включить звук' : 'Отключить звук'}</span>
        </ContextMenuItem>
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="text-xs text-fg-muted">Громкость</span>
          <Slider
            className="flex-1"
            value={[volume]}
            min={0}
            max={2}
            step={0.05}
            disabled={muted}
            onValueChange={(v) => setVolume(v[0] ?? 1)}
          />
          <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg">
            {Math.round(volume * 100)}%
          </span>
        </div>

        {hasScreenShareAudio && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="px-2 pt-1 pb-0 text-xs font-medium text-fg-muted">
              Экран
            </ContextMenuLabel>
            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleScreenMute();
              }}
              className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
            >
              {screenMuted ? <VolumeX /> : <Volume2 />}
              <span>{screenMuted ? 'Включить звук' : 'Отключить звук'}</span>
            </ContextMenuItem>
            <div className="flex items-center gap-3 px-2 py-2">
              <span className="text-xs text-fg-muted">Громкость</span>
              <Slider
                className="flex-1"
                value={[screenVolume]}
                min={0}
                max={2}
                step={0.05}
                disabled={screenMuted}
                onValueChange={(v) => setScreenVolume(v[0] ?? 1)}
              />
              <span className="w-12 text-right font-mono text-[11px] tabular-nums text-fg">
                {Math.round(screenVolume * 100)}%
              </span>
            </div>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
