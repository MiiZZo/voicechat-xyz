import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { Send, Copy, ClipboardCopy } from 'lucide-react';
import { useStore, type ChatMessage } from '../state/store.js';
import { Avatar, AvatarFallback, avatarColor } from './ui/avatar.js';
import { Input } from './ui/input.js';
import { Button } from './ui/button.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu.js';
import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';

type WirePayload = { type: 'chat'; text: string; timestamp: number };

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Split text into a sequence of strings and clickable <a> nodes for any URLs. */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[0];
    parts.push(
      <a
        key={`${m.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline decoration-fg-subtle decoration-1 underline-offset-2 transition hover:text-fg hover:decoration-fg"
      >
        {url}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

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
        <span className="text-sm font-semibold tracking-tight text-fg">Чат</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">
          live
        </span>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {chat.length === 0 && (
          <div className="my-auto text-center text-xs text-fg-subtle">
            Сообщений пока нет
          </div>
        )}
        {chat.map((m) => {
          const isLocal = m.fromIdentity === room.localParticipant.identity;
          return (
            <MessageRow key={m.id} message={m} isLocal={isLocal} />
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
        <Button type="submit" size="icon" aria-label="Отправить" disabled={!text.trim()}>
          <Send />
        </Button>
      </form>
    </aside>
  );
}

function MessageRow({ message, isLocal }: { message: ChatMessage; isLocal: boolean }) {
  const { push } = useToasts();

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      push('info', 'Сообщение скопировано');
    } catch {
      push('error', 'Не удалось скопировать');
    }
  };

  const copySelection = async () => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(sel);
      push('info', 'Скопировано');
    } catch {
      push('error', 'Не удалось скопировать');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('flex w-full min-w-0 gap-2.5', isLocal && 'flex-row-reverse')}>
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback
              className={cn('text-[10px] font-medium', avatarColor(message.fromName))}
            >
              {message.fromName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className={cn('flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col gap-0.5', isLocal && 'items-end')}>
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {isLocal ? 'ты' : message.fromName}
            </span>
            <div
              className={cn(
                'max-w-full rounded-2xl border border-border bg-bg-muted/60 px-3 py-2 text-sm text-fg [overflow-wrap:anywhere]',
                isLocal ? 'rounded-tr-sm' : 'rounded-tl-sm',
              )}
            >
              <span className="whitespace-pre-wrap">{linkify(message.text)}</span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void copyMessage();
          }}
          className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
        >
          <Copy />
          <span>Копировать сообщение</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void copySelection();
          }}
          className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
        >
          <ClipboardCopy />
          <span>Копировать выделенное</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
