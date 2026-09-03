import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, title: string, description?: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (kind, title, description) => {
    const id = ++counter;
    set({ toasts: [...get().toasts, { id, kind, title, description }].slice(-4) });
    window.setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push('success', title, description),
  error: (title: string, description?: string) => useToasts.getState().push('error', title, description),
  info: (title: string, description?: string) => useToasts.getState().push('info', title, description),
};
