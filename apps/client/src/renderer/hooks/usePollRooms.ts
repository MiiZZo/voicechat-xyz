import { useEffect, useRef } from 'react';
import { fetchRooms } from '../lib/api.js';
import { useStore } from '../state/store.js';

export function usePollRooms(active: boolean): void {
  const { setRooms, setRoomsError, setRoomsLoading } = useStore();
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        const rooms = await fetchRooms();
        if (!stoppedRef.current) setRooms(rooms);
      } catch (err) {
        if (!stoppedRef.current) setRoomsError((err as Error).message);
      } finally {
        if (!stoppedRef.current) timer = setTimeout(tick, 5000);
      }
    };

    setRoomsLoading(true);
    tick();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, setRooms, setRoomsError, setRoomsLoading]);
}
