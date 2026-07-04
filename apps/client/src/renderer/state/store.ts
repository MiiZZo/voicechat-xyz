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
  /**
   * Master override for the local microphone. When `true`, the user has
   * explicitly muted the mic via the control bar; activation hooks (VAD/PTT)
   * MUST NOT call `setMicrophoneEnabled(true)` while this is set. Lives in
   * runtime state (not prefs) — resets every session.
   */
  micMutedByUser: boolean;

  setPrefs(prefs: Prefs): void;
  setRooms(rooms: RoomSummary[]): void;
  setRoomsLoading(v: boolean): void;
  setRoomsError(err: string | null): void;
  enterRoom(payload: { roomId: string; roomName: string; join: JoinResponse }): void;
  leaveRoom(): void;
  pushChat(m: ChatMessage): void;
  /** Seed the list with loaded history, merged with any messages already
   *  present (live messages that arrived during the fetch win over history),
   *  deduped by id and sorted by timestamp. */
  seedHistory(msgs: ChatMessage[]): void;
  /** Patch a chat message in-place (used for upload progress / completion). */
  patchChat(id: string, patch: Partial<FileMessage>): void;
  setMicMutedByUser(muted: boolean): void;
};

export const useStore = create<Store>((set) => ({
  view: 'lobby',
  prefs: null,
  rooms: [],
  roomsLoading: true,
  roomsError: null,
  activeRoom: null,
  chat: [],
  micMutedByUser: false,
  setPrefs: (prefs) => set({ prefs }),
  setRooms: (rooms) => set({ rooms, roomsLoading: false, roomsError: null }),
  setRoomsLoading: (v) => set({ roomsLoading: v }),
  setRoomsError: (err) => set({ roomsError: err, roomsLoading: false }),
  enterRoom: (payload) => set({ view: 'room', activeRoom: payload, chat: [] }),
  // Leaving a room is also a session boundary — un-mute on next join unless
  // initial-device-state says otherwise (useLiveKitRoom owns that).
  leaveRoom: () => set({ view: 'lobby', activeRoom: null, chat: [], micMutedByUser: false }),
  // Dedup by id: a message can arrive both from loaded history and live p2p
  // (or be echoed) — the id is stable across sender/receiver/history.
  pushChat: (m) => set((s) => (s.chat.some((x) => x.id === m.id) ? s : { chat: [...s.chat, m] })),
  seedHistory: (msgs) =>
    set((s) => {
      const byId = new Map<string, ChatMessage>();
      for (const m of msgs) byId.set(m.id, m);
      for (const m of s.chat) byId.set(m.id, m); // live/existing wins over history
      const merged = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
      return { chat: merged };
    }),
  patchChat: (id, patch) =>
    set((s) => ({
      chat: s.chat.map((m) =>
        m.id === id && m.kind === 'file' ? ({ ...m, ...patch } as FileMessage) : m,
      ),
    })),
  setMicMutedByUser: (muted) => set({ micMutedByUser: muted }),
}));
