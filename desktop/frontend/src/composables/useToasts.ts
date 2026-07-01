import { reactive } from 'vue'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export type Toast = {
  id: number
  title: string
  message?: string
  tone: ToastTone
  actionLabel?: string
  onAction?: () => void
  createdAt: number
}

type ToastInput = Omit<Toast, 'id' | 'createdAt' | 'tone'> & {
  tone?: ToastTone
  duration?: number
}

const toasts = reactive<Toast[]>([])
let nextToastId = 1
const timers = new Map<number, number>()

export function dismissToast(id: number) {
  const index = toasts.findIndex((toast) => toast.id === id)
  if (index >= 0) {
    toasts.splice(index, 1)
  }
  const timer = timers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
}

export function notify(input: ToastInput) {
  const toast: Toast = {
    id: nextToastId++,
    title: input.title,
    message: input.message,
    tone: input.tone ?? 'info',
    actionLabel: input.actionLabel,
    onAction: input.onAction,
    createdAt: Date.now(),
  }

  toasts.unshift(toast)
  while (toasts.length > 4) {
    const removed = toasts.pop()
    if (removed) dismissToast(removed.id)
  }

  const duration = input.duration ?? 5200
  if (duration > 0) {
    timers.set(toast.id, window.setTimeout(() => dismissToast(toast.id), duration))
  }

  return toast.id
}

export function useToasts() {
  return {
    toasts,
    notify,
    dismissToast,
  }
}
