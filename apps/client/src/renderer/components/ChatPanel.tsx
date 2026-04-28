import { useEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { ArrowUp, Copy, ClipboardCopy, Paperclip, Download, Loader2, AlertCircle, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useStore, type ChatMessage, type FileMessage } from '../state/store.js';
import { Avatar, AvatarFallback, AvatarImage, avatarColor, customAvatar } from './ui/avatar.js';
import { Input } from './ui/input.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu.js';
import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';
import { uploadFile } from '../lib/upload.js';

const MAX_BYTES = 50 * 1024 * 1024;

type WirePayload =
  | { type: 'chat'; text: string; timestamp: number }
  | {
      type: 'file';
      id: string;
      url: string;
      name: string;
      size: number;
      mime: string;
      timestamp: number;
    };

const URL_RE = /(https?:\/\/[^\s]+)/g;

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function ChatPanel({ room }: { room: Room }) {
  const { chat, pushChat, patchChat, activeRoom } = useStore();
  const [text, setText] = useState('');
  const [isDragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { push: pushToast } = useToasts();

  useEffect(() => {
    const onData = (data: Uint8Array, participant?: RemoteParticipant) => {
      const decoded = new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(decoded) as WirePayload;
        const fromName =
          participant?.name ?? participant?.identity?.split('#')[0] ?? '?';
        const fromIdentity = participant?.identity ?? 'unknown';
        if (msg.type === 'chat') {
          pushChat({
            kind: 'text',
            id: `${fromIdentity}-${msg.timestamp}-${Math.random()}`,
            fromIdentity,
            fromName,
            text: msg.text,
            timestamp: msg.timestamp,
          });
        } else if (msg.type === 'file') {
          pushChat({
            kind: 'file',
            id: `${fromIdentity}-${msg.timestamp}-${msg.id}`,
            fromIdentity,
            fromName,
            timestamp: msg.timestamp,
            fileId: msg.id,
            url: msg.url,
            name: msg.name,
            size: msg.size,
            mime: msg.mime,
            status: 'done',
          });
        }
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
  }, [chat.length, chat]);

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload: WirePayload = { type: 'chat', text: trimmed, timestamp: Date.now() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(bytes, { reliable: true });
    pushChat({
      kind: 'text',
      id: `local-${payload.timestamp}-${Math.random()}`,
      fromIdentity: room.localParticipant.identity,
      fromName: room.localParticipant.name ?? 'Я',
      text: trimmed,
      timestamp: payload.timestamp,
    });
    setText('');
  };

  const sendFile = async (file: File) => {
    if (!activeRoom) return;
    if (file.size > MAX_BYTES) {
      pushToast('error', `Файл слишком большой (макс. 50 МБ)`);
      return;
    }
    if (file.size === 0) {
      pushToast('error', 'Пустой файл');
      return;
    }
    const timestamp = Date.now();
    const localId = `local-${timestamp}-${Math.random()}`;
    pushChat({
      kind: 'file',
      id: localId,
      fromIdentity: room.localParticipant.identity,
      fromName: room.localParticipant.name ?? 'Я',
      timestamp,
      fileId: '',
      url: '',
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      status: 'uploading',
      progress: 0,
    });

    try {
      const handle = uploadFile({
        roomId: activeRoom.roomId,
        token: activeRoom.join.token,
        file,
        onProgress: (frac) => patchChat(localId, { progress: frac }),
      });
      const resp = await handle.promise;
      patchChat(localId, {
        status: 'done',
        progress: 1,
        fileId: resp.id,
        url: resp.url,
        name: resp.name,
        mime: resp.mime,
        size: resp.size,
      });
      const payload: WirePayload = {
        type: 'file',
        id: resp.id,
        url: resp.url,
        name: resp.name,
        size: resp.size,
        mime: resp.mime,
        timestamp,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      await room.localParticipant.publishData(bytes, { reliable: true });
    } catch (err) {
      const message = (err as Error).message ?? 'Ошибка загрузки';
      patchChat(localId, { status: 'error', errorReason: message });
      pushToast('error', message);
    }
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await sendFile(file);
    }
  };

  const onDragEnter = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void onFilesPicked(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!e.clipboardData?.files?.length) return;
    e.preventDefault();
    void onFilesPicked(e.clipboardData.files);
  };

  return (
    <aside
      className="relative flex w-80 flex-col border-l border-border bg-bg-elevated/30"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
          return <MessageRow key={m.id} message={m} isLocal={isLocal} />;
        })}
      </div>

      <form onSubmit={sendText} className="border-t border-border p-3">
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label="Прикрепить файл"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-1 flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <Paperclip size={16} strokeWidth={2.25} />
          </button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            maxLength={500}
            placeholder="Сообщение…"
            className="h-10 rounded-full pl-10 pr-11"
          />
          <button
            type="submit"
            aria-label="Отправить"
            disabled={!text.trim()}
            className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors hover:bg-accent/90 disabled:bg-bg-muted disabled:text-fg-subtle"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </form>

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/15 backdrop-blur-sm">
          <div className="rounded-md border-2 border-dashed border-accent bg-bg-elevated/90 px-5 py-3 text-sm font-medium text-fg">
            Отпустите, чтобы отправить
          </div>
        </div>
      )}
    </aside>
  );
}

function MessageRow({ message, isLocal }: { message: ChatMessage; isLocal: boolean }) {
  const { push } = useToasts();

  const copyMessage = async () => {
    if (message.kind !== 'text') return;
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
            {customAvatar(message.fromName) && (
              <AvatarImage src={customAvatar(message.fromName)!} alt={message.fromName} />
            )}
            <AvatarFallback
              className={cn('text-[10px] font-medium', avatarColor(message.fromName))}
            >
              {message.fromName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              'flex min-w-0 max-w-[calc(100%-2.5rem)] flex-col gap-0.5',
              isLocal && 'items-end',
            )}
          >
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
              {isLocal ? 'ты' : message.fromName}
            </span>
            {message.kind === 'text' ? (
              <div
                className={cn(
                  'max-w-full rounded-2xl border border-border bg-bg-muted/60 px-3 py-2 text-sm text-fg [overflow-wrap:anywhere]',
                  isLocal ? 'rounded-tr-sm' : 'rounded-tl-sm',
                )}
              >
                <span className="whitespace-pre-wrap">{linkify(message.text)}</span>
              </div>
            ) : (
              <FileBubble message={message} isLocal={isLocal} />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {message.kind === 'text' && (
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
      )}
    </ContextMenu>
  );
}

function FileBubble({ message, isLocal }: { message: FileMessage; isLocal: boolean }) {
  const { push } = useToasts();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = message.mime.startsWith('image/');
  const uploading = message.status === 'uploading';
  const errored = message.status === 'error';

  const handleDownload = async () => {
    if (!message.url) return;
    try {
      const result = await window.api.downloadFile({
        url: message.url,
        suggestedName: message.name,
      });
      if (result.kind === 'saved') {
        push('success', `Сохранено: ${result.path}`);
      } else if (result.kind === 'error') {
        push('error', `Ошибка: ${result.message}`);
      }
    } catch (err) {
      push('error', (err as Error).message);
    }
  };

  if (isImage && !errored) {
    return (
      <>
        <div
          className={cn(
            'max-w-full overflow-hidden rounded-2xl border border-border bg-bg-muted/60',
            isLocal ? 'rounded-tr-sm' : 'rounded-tl-sm',
          )}
        >
          {uploading ? (
            <div className="flex h-32 w-44 items-center justify-center gap-2 px-3 text-xs text-fg-muted">
              <Loader2 size={14} className="animate-spin" />
              <span>{Math.round((message.progress ?? 0) * 100)}%</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => message.url && setLightboxOpen(true)}
              className="block w-full"
              title={message.name}
            >
              <img
                src={message.url}
                alt={message.name}
                className="block max-h-64 w-full object-cover"
                loading="lazy"
              />
            </button>
          )}
        </div>
        {message.url && (
          <ImageLightbox
            open={lightboxOpen}
            onOpenChange={setLightboxOpen}
            src={message.url}
            name={message.name}
            size={message.size}
            onDownload={handleDownload}
          />
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        'flex max-w-full items-center gap-3 rounded-2xl border border-border bg-bg-muted/60 px-3 py-2',
        isLocal ? 'rounded-tr-sm' : 'rounded-tl-sm',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center text-fg-muted">
        {errored ? <AlertCircle size={18} /> : <FileExtIcon name={message.name} mime={message.mime} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-sm font-medium text-fg [overflow-wrap:anywhere]"
          title={message.name}
        >
          {message.name}
        </span>
        <span className="text-[11px] text-fg-subtle">
          {errored
            ? message.errorReason ?? 'Ошибка'
            : uploading
              ? `Загрузка ${Math.round((message.progress ?? 0) * 100)}%`
              : formatBytes(message.size)}
        </span>
      </div>
      {!uploading && !errored && message.url && (
        <button
          type="button"
          aria-label="Скачать"
          onClick={() => void handleDownload()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-elevated hover:text-fg"
        >
          <Download size={16} />
        </button>
      )}
      {uploading && (
        <Loader2 size={16} className="shrink-0 animate-spin text-fg-muted" />
      )}
    </div>
  );
}

function extOf(name: string): string {
  const m = /\.([^./\\]+)$/.exec(name);
  if (!m) return 'FILE';
  return m[1].slice(0, 4).toUpperCase();
}

function colorForExt(ext: string, mime: string): string {
  const e = ext.toLowerCase();
  if (mime.startsWith('image/')) return '#a855f7';
  if (mime.startsWith('audio/')) return '#10b981';
  if (mime.startsWith('video/')) return '#f97316';
  if (['exe', 'msi', 'bat', 'cmd', 'sh', 'app', 'dmg'].includes(e)) return '#dc2626';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(e)) return '#9333ea';
  if (e === 'pdf') return '#ef4444';
  if (e === 'torrent') return '#0ea5e9';
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(e)) return '#2563eb';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(e)) return '#16a34a';
  if (['ppt', 'pptx', 'odp'].includes(e)) return '#ea580c';
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'rb', 'php'].includes(e)) return '#eab308';
  return '#64748b';
}

function FileExtIcon({ name, mime }: { name: string; mime: string }) {
  const ext = extOf(name);
  const color = colorForExt(ext, mime);
  // Badge width grows with text length so 2-4 char extensions all look balanced.
  const badgeW = Math.min(30, Math.max(20, ext.length * 7 + 8));
  const badgeX = (32 - badgeW) / 2;
  return (
    <svg
      width="22"
      height="28"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 3a2 2 0 0 1 2-2h13l8 8v28a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3Z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <path
        d="M20 1v7a2 2 0 0 0 2 2h6"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x={badgeX} y={21} width={badgeW} height={15} rx={2.5} fill={color} />
      <text
        x={16}
        y={32}
        textAnchor="middle"
        fontSize="11"
        fontWeight={700}
        letterSpacing="0.3"
        fill="#ffffff"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {ext}
      </text>
    </svg>
  );
}

function ImageLightbox({
  open,
  onOpenChange,
  src,
  name,
  size,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  name: string;
  size: number;
  onDownload: () => void | Promise<void>;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/85 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          onClick={() => onOpenChange(false)}
          className={cn(
            'fixed inset-0 z-50 flex flex-col items-center justify-center p-6 outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <img
            src={src}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] cursor-default rounded-lg object-contain shadow-2xl"
            draggable={false}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-4 flex max-w-[92vw] items-center gap-3 rounded-full border border-border bg-bg-elevated/80 px-4 py-2 text-xs text-fg-muted backdrop-blur"
          >
            <span className="min-w-0 truncate text-fg" title={name}>
              {name}
            </span>
            <span className="shrink-0 text-fg-subtle">{formatBytes(size)}</span>
            <button
              type="button"
              onClick={() => void onDownload()}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-bg-muted px-3 py-1 text-fg transition-colors hover:bg-bg"
            >
              <Download size={13} />
              <span>Скачать</span>
            </button>
          </div>
          <DialogPrimitive.Close
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-bg-elevated/80 text-fg-muted backdrop-blur transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Закрыть"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
