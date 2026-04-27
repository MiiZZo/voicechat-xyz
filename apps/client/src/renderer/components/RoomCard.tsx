import { cn } from '../lib/cn.js';
import type { RoomSummary } from '../lib/api.js';
import { Avatar, AvatarFallback, avatarColor } from './ui/avatar.js';

type Props = { room: RoomSummary; disabled?: boolean; onJoin: () => void };

export function RoomCard({ room, disabled, onJoin }: Props) {
  const full = room.participants.length >= room.maxParticipants;
  const active = room.participants.length > 0;
  const visible = room.participants.slice(0, 4);
  const overflow = Math.max(0, room.participants.length - visible.length);

  return (
    <button
      type="button"
      disabled={disabled || full}
      onClick={onJoin}
      className={cn(
        'group relative flex w-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-bg-elevated/40 p-5 text-left transition-all',
        'hover:border-fg-subtle/40 hover:bg-bg-elevated hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-bg-elevated/40',
        active && 'border-accent/30',
      )}
    >
      <div className="flex w-full items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full transition-colors',
              active ? 'bg-accent shadow-[0_0_8px_hsl(43_96%_56%/0.6)]' : 'bg-fg-subtle/40',
            )}
          />
          <span className="truncate font-display text-2xl italic leading-none text-fg">
            {room.displayName}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-fg-muted">
          {room.participants.length}
          <span className="text-fg-subtle">/{room.maxParticipants}</span>
        </span>
      </div>

      {room.participants.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {visible.map((p) => (
              <Avatar
                key={p.identity}
                className="h-7 w-7 border-2 border-bg-elevated"
              >
                <AvatarFallback className={cn('text-[10px] font-medium', avatarColor(p.name))}>
                  {p.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {overflow > 0 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-elevated bg-bg-muted text-[10px] font-medium text-fg-muted">
                +{overflow}
              </span>
            )}
          </div>
          <span className="truncate text-xs text-fg-subtle">
            {room.participants.map((p) => p.name).join(', ')}
          </span>
        </div>
      ) : (
        <div className="text-xs text-fg-subtle">Пусто — будь первым</div>
      )}
    </button>
  );
}
