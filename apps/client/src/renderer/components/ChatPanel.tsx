import { useEffect, useRef, useState } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { Send } from 'lucide-react';
import { useStore } from '../state/store.js';
import { Avatar, AvatarFallback, avatarColor } from './ui/avatar.js';
import { Input } from './ui/input.js';
import { Button } from './ui/button.js';
import { cn } from '../lib/cn.js';

type WirePayload = { type: 'chat'; text: string; timestamp: number };

export function ChatPanel({ room }: { room: Room }) {
  const { chat, pushChat } = useStore();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onData = (data: Uint8Array, participant?: RemoteParticipant) => {
      const decoded = new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(decoded) as WirePayload;
        if (msg.type !== 'chat') return;
        pushChat({
          id: `${participant?.identity ?? 'remote'}-${msg.timestamp}-${Math.random()}`,
          fromIdentity: participant?.identity ?? 'unknown',
          fromName: participant?.name ?? participant?.identity?.split('#')[0] ?? '?',
          text: msg.text,
          timestamp: msg.timestamp,
        });
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, pushChat]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload: WirePayload = { type: 'chat', text: trimmed, timestamp: Date.now() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(bytes, { reliable: true });
    pushChat({
      id: `local-${payload.timestamp}-${Math.random()}`,
      fromIdentity: room.localParticipant.identity,
      fromName: room.localParticipant.name ?? 'Я',
      text: trimmed,
      timestamp: payload.timestamp,
    });
    setText('');
  };

  return (
    <aside className="flex w-80 flex-col border-l border-border bg-bg-elevated/30">
      <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
        <span className="font-display text-lg italic text-fg">Чат</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
          live
        </span>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {chat.length === 0 && (
          <div className="my-auto text-center text-xs text-fg-subtle">
            Сообщений пока нет.
            <br />
            Напишите первым.
          </div>
        )}
        {chat.map((m) => {
          const isLocal = m.fromIdentity === room.localParticipant.identity;
          return (
            <div key={m.id} className={cn('flex gap-2.5', isLocal && 'flex-row-reverse')}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback
                  className={cn('text-[10px] font-medium', avatarColor(m.fromName))}
                >
                  {m.fromName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={cn('flex max-w-[80%] flex-col gap-0.5', isLocal && 'items-end')}>
                <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
                  {isLocal ? 'ты' : m.fromName}
                </span>
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm',
                    isLocal
                      ? 'rounded-tr-md bg-accent text-accent-fg'
                      : 'rounded-tl-md bg-bg-muted text-fg',
                  )}
                >
                  <span className="whitespace-pre-wrap break-words">{m.text}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Сообщение…"
          className="h-9"
        />
        <Button
          type="submit"
          variant="accent"
          size="icon"
          aria-label="Отправить"
          disabled={!text.trim()}
        >
          <Send />
        </Button>
      </form>
    </aside>
  );
}
