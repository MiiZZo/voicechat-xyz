import { useState } from 'react';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';
import { usePollRooms } from '../hooks/usePollRooms.js';
import { postJoin, type JoinError } from '../lib/api.js';
import { RoomCard } from '../components/RoomCard.js';
import { ToastTray } from '../components/Toast.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { Settings } from 'lucide-react';

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
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="text-lg font-semibold">VoiceChat</div>
        <button onClick={() => setSettingsOpen(true)} className="rounded p-2 hover:bg-zinc-800" aria-label="Settings">
          <Settings size={18} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <label className="mb-6 block">
          <span className="mb-2 block text-sm text-zinc-400">Ваш ник</span>
          <input
            type="text"
            value={prefs.displayName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={32}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-600"
            placeholder="Введите ник"
          />
        </label>

        <div className="mb-3 text-sm font-medium text-zinc-400">Доступные комнаты</div>
        {roomsLoading && <div className="text-sm text-zinc-500">Загрузка…</div>}
        {roomsError && (
          <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            Не удаётся подключиться к серверу
          </div>
        )}
        <div className="space-y-2">
          {rooms.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              disabled={joining !== null}
              onJoin={() => onJoin(r.id, r.displayName)}
            />
          ))}
        </div>
      </main>

      <ToastTray />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
