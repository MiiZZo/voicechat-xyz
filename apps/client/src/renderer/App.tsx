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

  if (!prefs) return <div className="grid h-screen place-items-center text-fg-subtle">…</div>;
  return (
    <TooltipProvider delayDuration={200}>
      {view === 'lobby' ? <LobbyView /> : <RoomView />}
      <UpdateBanner />
    </TooltipProvider>
  );
}
