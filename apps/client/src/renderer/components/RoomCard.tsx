import { cn } from '../lib/cn.js';
import type { RoomSummary } from '../lib/api.js';

type Props = { room: RoomSummary; disabled?: boolean; onJoin: () => void };

export function RoomCard({ room, disabled, onJoin }: Props) {
  const full = room.participants.length >= room.maxParticipants;
  const active = room.participants.length > 0;
  return (
    <button
      type="button"
      disabled={disabled || full}
      onClick={onJoin}
      className={cn(
        'flex w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-left transition',
        'hover:border-zinc-700 hover:bg-zinc-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-500' : 'bg-zinc-600')} />
          <span className="font-medium">{room.displayName}</span>
        </div>
        <span className="text-sm text-zinc-400">
          {room.participants.length}/{room.maxParticipants}
        </span>
      </div>
      {room.participants.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {room.participants.map((p) => (
            <span key={p.identity}>· {p.name}</span>
          ))}
        </div>
      )}
    </button>
  );
}
