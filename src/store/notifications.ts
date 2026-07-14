// 通知中心 store：純列表操作（notificationCenter.ts）的薄 Zustand 包裝。
// 刻意不持久化 —— 與 session / workspace 一樣，跨啟動不保存。
import { create } from "zustand";
import {
  markAllNotificationsRead,
  markNotificationRead,
  pushNotification,
  resolveSessionNotifications,
  type AppNotification,
  type NotifyKind,
} from "./notificationCenter";

interface NotificationsState {
  items: AppNotification[];
  push: (n: {
    kind: NotifyKind;
    sessionId: string;
    sessionTitle: string;
    agentLabel?: string;
    text?: string;
  }) => void;
  resolveSession: (sessionId: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],

  push: (n) => {
    const next = pushNotification(get().items, {
      ...n,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      read: false,
      // done / error 是瞬時事件，無「待處理」狀態；waiting 類等回答後才 resolve。
      resolved: n.kind === "done" || n.kind === "error",
    });
    if (next !== get().items) set({ items: next });
  },

  resolveSession: (sessionId) => {
    const next = resolveSessionNotifications(get().items, sessionId);
    if (next !== get().items) set({ items: next });
  },

  markRead: (id) => {
    const next = markNotificationRead(get().items, id);
    if (next !== get().items) set({ items: next });
  },

  markAllRead: () => {
    const next = markAllNotificationsRead(get().items);
    if (next !== get().items) set({ items: next });
  },
}));
