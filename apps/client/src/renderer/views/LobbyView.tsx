import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';
import { usePollRooms } from '../hooks/usePollRooms.js';
import { postJoin, type JoinError } from '../lib/api.js';
import { LOBBY_URL } from '../lib/env.js';
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

  const name = prefs.displayName.trim();
  const activeRoomsCount = rooms.filter((r) => r.participants.length > 0).length;

  return (
    // relative z-[1] поднимает контент над body::before halo (z 0) — тот же
    // трюк, что в RoomView. text-fg без bg-bg — фон даёт body + halo'ы.
    <div className="relative z-[1] flex h-screen flex-col text-fg">
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 overflow-y-auto px-8 py-12">
        {/* === Welcome / hero section ===
            Instrument Serif (без italic — правило палитры) для крупного
            акцента, моноспейс tagline под ним. Если ника ещё нет — показываем
            заголовок «VoiceChat» с инструкцией; как только заполнили — он
            превращается в персональное приветствие. Это даёт момент «о, меня
            запомнили» при первом возврате в приложение. */}
        <section className="flex flex-col gap-1.5">
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tight text-fg">
            {name ? `Здравствуйте, ${name}` : 'VoiceChat'}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {name
              ? activeRoomsCount > 0
                ? `сейчас в звонке: ${activeRoomsCount}`
                : 'все свободны · можно входить'
              : 'введите ник, чтобы начать'}
          </p>
        </section>

        {/* === Ник ===
            Input уже Velvet Onyx (glass + pearl focus). Label сейчас uppercase
            tracking-wider — это и есть mset-row стиль из SettingsModal. */}
        <section className="flex flex-col gap-2">
          <Label htmlFor="nick">Ваш ник</Label>
          <Input
            id="nick"
            value={prefs.displayName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={32}
            placeholder="Как тебя представить"
            // Pill-shape + увеличенный horizontal padding — точно как chat input
            // (ChatPanel.tsx: h-10 rounded-full pl-10 pr-11). Base Input class —
            // rounded-md (правильно для SettingsModal), но canonical "Velvet
            // Onyx input look" — pill. text-base для крупного hero-input'а.
            className="rounded-full px-5 text-base"
          />
        </section>

        {/* === Комнаты === */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Label>Комнаты</Label>
            {!roomsLoading && !roomsError && (
              <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                {activeRoomsCount} активн / {rooms.length}
              </span>
            )}
          </div>

          {roomsLoading && (
            <div className="relative overflow-hidden rounded-full vo-tile-bg vo-lift-tile border border-[hsla(240,8%,90%,0.06)] px-5 py-7 text-center">
              <div className="flex items-center justify-center gap-3 text-sm text-fg-subtle">
                {/* Pearl pulsing dot — переиспользует vo-toast-dot keyframe'ы
                    нельзя (он зелёный), пишем компактно inline через animate-pulse. */}
                <span className="h-1.5 w-1.5 rounded-full bg-[radial-gradient(circle,hsl(240,8%,94%),hsl(240,6%,62%))] shadow-[0_0_8px_hsla(240,14%,88%,0.5)] animate-pulse" />
                <span className="font-mono text-xs uppercase tracking-[0.14em]">загрузка</span>
              </div>
            </div>
          )}

          {roomsError && (
            <div className="relative overflow-hidden rounded-full vo-tile-bg vo-lift-tile border border-[hsla(0,72%,55%,0.22)] px-5 py-4">
              {/* Crimson tint: тёмно-винный rim + чуть кровавая опечатка
                  внутри. Без destructive/10 фуксии — она ломала холодную
                  palette Velvet Onyx. */}
              <div className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(0,68%,52%)] shadow-[0_0_8px_hsla(0,68%,52%,0.6)]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="text-sm text-fg">Не удаётся подключиться к серверу</div>
                  <div className="break-all font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                    {LOBBY_URL}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!roomsLoading && !roomsError && rooms.length === 0 && (
            <div className="relative overflow-hidden rounded-full vo-tile-bg vo-lift-tile border border-[hsla(240,8%,90%,0.06)] px-5 py-7 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">
                комнат пока нет
              </p>
            </div>
          )}

          {!roomsLoading && !roomsError && rooms.length > 0 && (
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
          )}
        </section>
      </main>

      <ToastTray />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
