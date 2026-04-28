import { create } from 'zustand';
import type { Prefs } from '../../shared/types.js';
import type { JoinResponse, RoomSummary } from '../lib/api.js';

export type View = 'lobby' | 'room';

type ChatBase = {
  id: string;
  fromIdentity: string;
  fromName: string;
  timestamp: number;
};

export type TextMessage = ChatBase & { kind: 'text'; text: string };

export type FileMessage = ChatBase & {
  kind: 'file';
  fileId: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  /** For local outgoing messages: 'uploading' | 'done' | 'error'. Remote messages are always 'done'. */
  status: 'uploading' | 'done' | 'error';
  /** 0..1 for in-flight uploads. Undefined when not relevant. */
  progress?: number;
  /** Error reason for status='error'. */
  errorReason?: string;
};

export type ChatMessage = TextMessage | FileMessage;

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
  /** Patch a chat message in-place (used for upload progress / completion). */
  patchChat(id: string, patch: Partial<FileMessage>): void;
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
  patchChat: (id, patch) =>
    set((s) => ({
      chat: s.chat.map((m) =>
        m.id === id && m.kind === 'file' ? ({ ...m, ...patch } as FileMessage) : m,
      ),
    })),
}));
