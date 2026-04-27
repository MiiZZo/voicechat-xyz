import { useEffect } from 'react';
import { useStore } from './state/store.js';
import { LobbyView } from './views/LobbyView.js';
import { RoomView } from './views/RoomView.js';
import { UpdateBanner } from './components/UpdateBanner.js';

export function App() {
  const { view, prefs, setPrefs } = useStore();

  useEffect(() => {
    window.api.getPrefs().then(setPrefs);
  }, [setPrefs]);

  if (!prefs) return <div className="grid h-screen place-items-center text-zinc-400">…</div>;
  return (
    <>
      {view === 'lobby' ? <LobbyView /> : <RoomView />}
      <UpdateBanner />
    </>
  );
}
