import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';
import { usePollRooms } from '../hooks/usePollRooms.js';
import { postJoin, type JoinError } from '../lib/api.js';
import { RoomCard } from '../components/RoomCard.js';
import { ToastTray } from '../components/Toast.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { TitleBar, titleBarNoDrag } from '../components/TitleBar.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Button } from '../components/ui/button.js';

const ERROR_MAP: Record<JoinError['kind'], string> = {
  invalid_name: 'Введите корректный ник',
  not_found: 'Комната недоступна',
  full: 'Комната заполнена (8/8)',
  duplicate_name: 'Этот ник уже используется в комнате',
  network: 'Нет соединения с сервером',
  server: 'Ошибка сервера',
};

export function LobbyView() {
  const { rooms, roomsLoading, roomsError, prefs, setPrefs, enterRoom } = useStore();
  const { push } = useToasts();
  const [joining, setJoining] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  usePollRooms(true);

  if (!prefs) return null;

  const onNameChange = async (name: string) => {
    const next = await window.api.setPrefs({ displayName: name });
    setPrefs(next);
  };

  const onJoin = async (roomId: string, roomName: string) => {
    if (!prefs.displayName.trim()) {
      push('error', 'Сначала введите ник');
      return;
    }
    setJoining(roomId);
    const result = await postJoin(roomId, prefs.displayName.trim());
    setJoining(null);
    if ('kind' in result) {
      push('error', ERROR_MAP[result.kind]);
      return;
    }
    enterRoom({ roomId, roomName, join: result });
  };

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <TitleBar>
        <span className="text-sm font-semibold tracking-tight">VoiceChat</span>
        <span className="ml-auto" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          className="h-7 w-7"
          style={titleBarNoDrag}
        >
          <Settings />
        </Button>
      </TitleBar>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 overflow-y-auto px-8 py-10">
        <section className="flex flex-col gap-2">
          <Label htmlFor="nick">Ваш ник</Label>
          <Input
            id="nick"
            value={prefs.displayName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={32}
            placeholder="Как тебя представить"
            className="text-base"
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Label>Комнаты</Label>
            {!roomsLoading && (
              <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                {rooms.filter((r) => r.participants.length > 0).length} активн / {rooms.length}
              </span>
            )}
          </div>

          {roomsLoading && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-subtle">
              Загрузка…
            </div>
          )}
          {roomsError && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-rose-200">
              Не удаётся подключиться к серверу
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {rooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                disabled={joining !== null}
                onJoin={() => onJoin(r.id, r.displayName)}
              />
            ))}
          </div>
        </section>
      </main>

      <ToastTray />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
