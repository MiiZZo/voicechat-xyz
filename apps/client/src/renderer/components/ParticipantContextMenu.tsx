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
        <ContextMenuLabel className="font-display text-sm italic normal-case tracking-normal text-fg">
          {participantName}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={(e) => { e.preventDefault(); toggleMute(); }}>
          {muted ? (
            <>
              <Volume2 size={14} />
              <span>Включить звук</span>
            </>
          ) : (
            <>
              <VolumeX size={14} />
              <span>Замьютить</span>
            </>
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <div className="px-2 py-2">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-muted">
            <span>Громкость</span>
            <span className="font-mono tabular-nums text-fg">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.05}
            disabled={muted}
            onValueChange={(v) => setVolume(v[0] ?? 1)}
          />
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
}
