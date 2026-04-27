import { useEffect, useRef, useState } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { Send } from 'lucide-react';
import { useStore } from '../state/store.js';

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
    <aside className="flex w-80 flex-col border-l border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 px-4 py-2 text-sm font-medium">Чат</div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {chat.map((m) => (
          <div key={m.id} className="rounded bg-zinc-900 p-2">
            <div className="text-xs text-zinc-500">{m.fromName}</div>
            <div className="whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-zinc-800 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Сообщение…"
          className="flex-1 rounded bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <button type="submit" className="rounded bg-zinc-100 p-2 text-zinc-900 hover:bg-white" aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
