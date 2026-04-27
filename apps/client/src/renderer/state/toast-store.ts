import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success';
export type Toast = { id: string; kind: ToastKind; text: string };

type ToastState = {
  toasts: Toast[];
  push(kind: ToastKind, text: string): void;
  dismiss(id: string): void;
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
