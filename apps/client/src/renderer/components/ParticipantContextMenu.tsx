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
  children: React.ReactNode;
};

export function ParticipantContextMenu({ participantName, children }: Props) {
  const { prefs, setPrefs } = useStore();

  if (!prefs) return <>{children}</>;

  const muted = !!prefs.participantMuted[participantName];
  const volume = prefs.participantVolumes[participantName] ?? 1;

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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel className="text-xs font-semibold normal-case tracking-normal text-fg">
          {participantName}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleMute();
          }}
          className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
        >
          {muted ? <Volume2 /> : <VolumeX />}
          <span>{muted ? 'Включить звук' : 'Отключить звук'}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="text-xs text-fg-muted">Громкость</span>
          <Slider
            className="flex-1"
            value={[volume]}
            min={0}
            max={1}
            step={0.05}
            disabled={muted}
            onValueChange={(v) => setVolume(v[0] ?? 1)}
          />
          <span className="w-9 text-right font-mono text-[11px] tabular-nums text-fg">
            {Math.round(volume * 100)}
          </span>
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
}
