import { useEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { ArrowUp, Copy, ClipboardCopy, Paperclip, Download, Loader2, AlertCircle, X, File as FileIcon, Upload } from 'lucide-react';
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
import { notifyChatMessage } from '../lib/notifications.js';

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
          // Системное уведомление — само решит, показывать ли (только если
          // окно вне фокуса) и спросит permission при первом вызове.
          void notifyChatMessage({ fromName, body: msg.text });
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
          void notifyChatMessage({ fromName, body: `📎 ${msg.name}` });
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
      className="vo-chat-bg vo-chat-rim relative flex w-80 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="relative flex items-baseline justify-center gap-2 px-4 py-3.5 after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent after:content-['']">
        <span className="text-sm font-semibold tracking-tight text-fg">Чат</span>
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

      <form
        onSubmit={sendText}
        className="vo-msg-halo relative p-3"
      >
        {/* Hairline divider between chat list and form (Tailwind ::after instead
            of the previous ::before — ::before is now claimed by vo-msg-halo). */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
        />
        <div className="relative z-10 flex items-center">
          <button
            type="button"
            aria-label="Прикрепить файл"
            onClick={() => fileInputRef.current?.click()}
            // z-10 явный: WRY webview hit-testing на полностью прозрачных
            // absolute элементах (no bg, no border) иногда пропускает их в
            // пользу нижележащего static Input — клик уходит на Input и тот
            // получает focus. Explicit z-index ставит button точно сверху.
            className="absolute left-1 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
          >
            <Paperclip size={14} strokeWidth={2.25} />
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
            className="absolute right-1 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[linear-gradient(180deg,hsl(240_6%_98%),hsl(240_6%_82%))] text-bg shadow-[0_2px_8px_-2px_hsla(240,12%,80%,0.18)] transition-colors hover:bg-[linear-gradient(180deg,hsl(240_6%_100%),hsl(240_6%_86%))] focus:outline-none focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsla(240,10%,80%,0.18)] disabled:bg-bg-muted disabled:bg-none disabled:text-fg-subtle disabled:shadow-none"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
          {/* sr-only вместо className="hidden": display:none инпуты в некоторых
              WebView engines (Tauri/WRY на macOS особенно) игнорируют
              программный .click() — нативный file picker не открывается.
              sr-only визуально прячет но оставляет элемент в layout, и
              click работает на всех платформах. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void onFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </form>

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex animate-in fade-in-0 items-center justify-center bg-bg/40 p-4 backdrop-blur-md duration-200">
          <div className="vo-lift-tile w-full animate-in fade-in-0 zoom-in-95 rounded-lg border-[1.5px] border-dashed border-white/40 bg-bg-elevated/70 px-5 py-6 text-center backdrop-blur-2xl backdrop-saturate-150 duration-300">
            <div className="mx-auto mb-3.5 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,hsla(0,0%,100%,0.35),transparent_50%),radial-gradient(circle_at_50%_50%,hsl(240_8%_32%)_0%,hsl(240_10%_12%)_80%)] text-fg shadow-[0_0_24px_hsla(240,12%,80%,0.20),inset_0_-3px_8px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.08)]">
              <Upload size={18} />
            </div>
            <div className="text-sm font-medium text-fg">Отпустите, чтобы отправить</div>
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">До 50 МБ · drag &amp; drop</div>
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
            <span className="px-0.5 text-[11.5px] font-medium tracking-[-0.005em] text-fg-muted">
              {isLocal ? 'ты' : message.fromName}
            </span>
            {message.kind === 'text' ? (
              <div
                className={cn(
                  'relative max-w-full rounded-2xl px-3.5 py-2 text-[13px] leading-[1.5] [overflow-wrap:anywhere]',
                  isLocal
                    ? 'vo-lift-bubble-pearl border border-transparent bg-[linear-gradient(180deg,hsl(240_6%_96%)_0%,hsl(240_6%_80%)_100%)] text-bg rounded-tr-sm'
                    : 'vo-lift-bubble border border-white/[0.08] bg-white/[0.06] text-fg backdrop-blur-xl backdrop-saturate-150 rounded-tl-sm',
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
            'vo-lift-bubble max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] backdrop-blur-xl backdrop-saturate-150',
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
                className="block max-h-[150px] w-full object-cover"
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
        'flex max-w-full items-center gap-3 rounded-2xl px-3 py-2',
        isLocal
          ? 'vo-lift-bubble-pearl border border-transparent bg-[linear-gradient(180deg,hsl(240_6%_96%)_0%,hsl(240_6%_80%)_100%)] text-bg rounded-tr-sm'
          : 'vo-lift-bubble border border-white/[0.08] bg-white/[0.06] text-fg backdrop-blur-xl backdrop-saturate-150 rounded-tl-sm',
      )}
    >
      <div className="flex shrink-0 items-center justify-center">
        {errored ? <AlertCircle size={18} className={isLocal ? 'text-bg/60' : 'text-fg-muted'} /> : <FileExtIcon name={message.name} isLocal={isLocal} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn('truncate text-[13px] font-medium [overflow-wrap:anywhere]', isLocal ? 'text-bg' : 'text-fg')}
          title={message.name}
        >
          {message.name}
        </span>
        <span className={cn('font-mono text-[11px] tracking-[0.02em]', isLocal ? 'text-bg/55' : 'text-fg-subtle')}>
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
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
            isLocal
              ? 'border-black/15 bg-black/10 text-bg/70 hover:bg-black/20 hover:text-bg'
              : 'border-white/[0.08] bg-white/[0.06] text-fg-muted hover:bg-white/[0.1] hover:text-fg',
          )}
        >
          <Download size={13} />
        </button>
      )}
      {uploading && (
        <Loader2 size={16} className={cn('shrink-0 animate-spin', isLocal ? 'text-bg/60' : 'text-fg-muted')} />
      )}
    </div>
  );
}

function extOf(name: string): string {
  const m = /\.([^./\\]+)$/.exec(name);
  if (!m) return 'FILE';
  return m[1].slice(0, 4).toUpperCase();
}

/** Velvet Onyx file glyph: small glass plaque with a clipped top-right corner +
 *  generic file outline + monospace extension chip below. No format-specific
 *  bright colors — keeps the chat reading as a single calm surface. */
function FileExtIcon({ name, isLocal }: { name: string; isLocal: boolean }) {
  const ext = extOf(name);
  return (
    <div
      className={cn(
        'relative flex h-[46px] w-[38px] flex-col items-center justify-center gap-1 rounded-sm border',
        isLocal
          ? 'border-black/15 bg-gradient-to-br from-black/15 to-black/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.08)]'
          : 'border-white/[0.08] bg-gradient-to-br from-white/[0.10] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)]',
      )}
      aria-hidden="true"
    >
      <FileIcon className={cn('h-3.5 w-3.5', isLocal ? 'text-bg/70' : 'text-fg-muted')} />
      <span className={cn(
        'font-mono text-[8px] font-medium uppercase tracking-[0.12em]',
        isLocal ? 'text-bg/55' : 'text-fg-subtle',
      )}>{ext}</span>
      {/* Folded-corner cue at the top-right */}
      <div
        className={cn(
          'absolute right-0 top-0 h-2 w-2',
          isLocal ? 'bg-black/20' : 'bg-zinc-900/80',
        )}
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
      />
    </div>
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
