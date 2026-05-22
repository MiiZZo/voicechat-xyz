import { useEffect } from 'react';
import { useStore } from './state/store.js';
import { LobbyView } from './views/LobbyView.js';
import { RoomView } from './views/RoomView.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { TooltipProvider } from './components/ui/tooltip.js';

export function App() {
  const { view, prefs, setPrefs } = useStore();

  useEffect(() => {
    window.api.getPrefs().then(setPrefs);
  }, [setPrefs]);

  // Применяем глобальные хоткеи на старте и при каждом изменении префов.
  // setGlobalShortcuts отсутствует в Electron-preload — optional chain
  // молча скипает (в Electron этой фичи нет, плагин Tauri-only).
  useEffect(() => {
    if (!prefs) return;
    const api = window.api as {
      setGlobalShortcuts?: (opts: {
        globalShortcutToggleMute: string;
        globalShortcutLeaveRoom: string;
      }) => Promise<void>;
    };
    void api.setGlobalShortcuts?.({
      globalShortcutToggleMute: prefs.globalShortcutToggleMute,
      globalShortcutLeaveRoom: prefs.globalShortcutLeaveRoom,
    });
  }, [prefs?.globalShortcutToggleMute, prefs?.globalShortcutLeaveRoom]);

  // Tray-иконка отражает состояние мута. Меняем только когда юзер реально в
  // комнате — в лобби микрофон не активен, специальная иконка ничего не значит.
  // Параллельно синкаем состояние в кастомное tray-menu окно — оно по этому
  // флагу решает, показывать ли пункты "выкл. микрофон" / "покинуть комнату".
  const activeRoom = useStore((s) => s.activeRoom);
  const micMutedByUser = useStore((s) => s.micMutedByUser);
  useEffect(() => {
    const api = window.api as {
      setTrayMicMuted?: (muted: boolean) => Promise<void>;
      setTaskbarOverlayMuted?: (muted: boolean) => Promise<void>;
      syncTrayMenu?: (state: { inRoom: boolean; muted: boolean }) => Promise<void>;
    };
    const inRoom = activeRoom !== null;
    const showMuted = inRoom && micMutedByUser;
    void api.setTrayMicMuted?.(showMuted);
    void api.setTaskbarOverlayMuted?.(showMuted);
    void api.syncTrayMenu?.({ inRoom, muted: micMutedByUser });
  }, [activeRoom, micMutedByUser]);

  if (!prefs) return <div className="grid h-screen place-items-center text-fg-subtle">…</div>;
  return (
    <TooltipProvider delayDuration={200}>
      {view === 'lobby' ? <LobbyView /> : <RoomView />}
      <UpdateBanner />
    </TooltipProvider>
  );
}
