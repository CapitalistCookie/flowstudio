/**
 * Framework-agnostic notification service.
 * Stores a queue of notifications; React layer (sonner) reads from here.
 */

import type { Notification, NotificationType } from '../types';
import { generateId } from '@flowstudio/shared';

type NotificationListener = (notification: Notification) => void;

const listeners = new Set<NotificationListener>();

export function subscribeNotifications(fn: NotificationListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(notification: Notification) {
  for (const fn of listeners) fn(notification);
}

function notify(
  type: NotificationType,
  title: string,
  description?: string,
  durationMs = 4000
) {
  emit({ id: generateId(), type, title, description, durationMs });
}

export const notifications = {
  success: (title: string, description?: string) =>
    notify('success', title, description),
  error: (title: string, description?: string) =>
    notify('error', title, description, 6000),
  warning: (title: string, description?: string) =>
    notify('warning', title, description),
  info: (title: string, description?: string) =>
    notify('info', title, description),
};
