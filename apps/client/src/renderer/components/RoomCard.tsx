import { cn } from '../lib/cn.js';
import type { RoomSummary } from '../lib/api.js';
import { Avatar, AvatarFallback, AvatarImage, avatarColor, customAvatar } from './ui/avatar.js';

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
      // Aria-label заменяет визуальный список ников, который раньше был
      // под названием — теперь имена доступны через hover/screen reader.
      aria-label={
        active
          ? `${room.displayName}, ${room.participants.length} из ${room.maxParticipants}, ${room.participants.map((p) => p.name).join(', ')}`
          : `${room.displayName}, пусто, ${room.maxParticipants} мест`
      }
      title={active ? room.participants.map((p) => p.name).join(', ') : undefined}
      className={cn(
        // Single-row pill: rounded-full точно как chat input, h-14 чтобы
        // аватары h-7 не упирались в края, vo-tile-bg + vo-lift-tile дают
        // глубину поверх halo-фона. min-w-0 на title-span внутри сделает
        // truncate работающим при длинных названиях комнат.
        'group relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-full px-5 text-left',
        'vo-tile-bg vo-lift-tile',
        'border border-[hsla(240,8%,90%,0.06)]',
        'transition-transform duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-12px_rgba(0,0,0,0.78),0_10px_22px_-4px_rgba(0,0,0,0.5),0_0_60px_-22px_hsla(240,14%,80%,0.18)]',
        active && 'shadow-[inset_0_0_0_1px_hsla(240,14%,90%,0.14),inset_0_1px_0_hsla(0,0%,100%,0.10),0_24px_48px_-10px_rgba(0,0,0,0.72),0_8px_18px_-4px_rgba(0,0,0,0.45),0_0_50px_-22px_hsla(240,14%,80%,0.18)]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
      )}
    >
      {/* Pearl status-dot. Активный — pearl gradient + glow, пустой — тусклый. */}
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full transition-all',
          active
            ? 'bg-[radial-gradient(circle_at_35%_30%,hsl(240,8%,94%),hsl(240,6%,62%))] shadow-[0_0_10px_hsla(240,14%,88%,0.45),0_0_0_1px_hsla(240,8%,98%,0.20)]'
            : 'bg-[hsla(240,6%,40%,0.5)]',
        )}
      />

      <span className="min-w-0 flex-1 truncate text-base font-medium tracking-tight text-fg">
        {room.displayName}
      </span>

      {/* Аватары inline справа от названия — компактная визуальная подсказка
          кто внутри. -space-x-2 даёт overlap, ring в цвет vo-tile-bg создаёт
          "вырезы" между ними. */}
      {active && (
        <div className="flex shrink-0 -space-x-2">
          {visible.map((p) => (
            <Avatar
              key={p.identity}
              className="h-7 w-7 ring-2 ring-[hsl(240,12%,4%)]"
            >
              {customAvatar(p.name) && (
                <AvatarImage src={customAvatar(p.name)!} alt={p.name} />
              )}
              <AvatarFallback className={cn('text-[10px] font-medium', avatarColor(p.name))}>
                {p.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflow > 0 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsla(240,8%,18%,0.8)] text-[10px] font-medium text-fg-muted ring-2 ring-[hsl(240,12%,4%)]">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {/* Glass-chip pill-counter — vo-chip + rounded-full уже в утилите. */}
      <span className="vo-chip shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] tabular-nums text-fg-muted">
        {room.participants.length}
        <span className="text-fg-subtle">/{room.maxParticipants}</span>
      </span>
    </button>
  );
}
