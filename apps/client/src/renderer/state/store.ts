import { create } from 'zustand';
import type { Prefs } from '../../shared/types.js';
import type { JoinResponse, RoomSummary } from '../lib/api.js';

export type View = 'lobby' | 'room';

export type ChatMessage = {
  id: string;
  fromIdentity: string;
  fromName: string;
  text: string;
  timestamp: number;
};

type Store = {
  view: View;
  prefs: Prefs | null;
  rooms: RoomSummary[];
  roomsLoading: boolean;
  roomsError: string | null;
  activeRoom: { roomId: string; roomName: string; join: JoinResponse } | null;
  chat: ChatMessage[];

  setPrefs(prefs: Prefs): void;
  setRooms(rooms: RoomSummary[]): void;
  setRoomsLoading(v: boolean): void;
  setRoomsError(err: string | null): void;
  enterRoom(payload: { roomId: string; roomName: string; join: JoinResponse }): void;
  leaveRoom(): void;
  pushChat(m: ChatMessage): void;
};

export const useStore = create<Store>((set) => ({
  view: 'lobby',
  prefs: null,
  rooms: [],
  roomsLoading: true,
  roomsError: null,
  activeRoom: null,
  chat: [],
  setPrefs: (prefs) => set({ prefs }),
  setRooms: (rooms) => set({ rooms, roomsLoading: false, roomsError: null }),
  setRoomsLoading: (v) => set({ roomsLoading: v }),
  setRoomsError: (err) => set({ roomsError: err, roomsLoading: false }),
  enterRoom: (payload) => set({ view: 'room', activeRoom: payload, chat: [] }),
  leaveRoom: () => set({ view: 'lobby', activeRoom: null, chat: [] }),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
}));
