"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

interface Notification {
  id: string;
  type: string;
  audience: "USER" | "EMPLOYEE" | "MANAGEMENT" | "ADMIN";
  title: string;
  message: string;
  severity: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

type Filter = "ALL" | "UNREAD" | "TASKS" | "REQUESTS" | "PROJECTS";

const filterLabels: { id: Filter; label: string }[] = [
  { id: "ALL", label: "الكل" },
  { id: "UNREAD", label: "غير المقروء" },
  { id: "TASKS", label: "المهام" },
  { id: "REQUESTS", label: "الطلبات" },
  { id: "PROJECTS", label: "المشاريع" },
];

const severityTone: Record<string, { icon: string; border: string; dot: string }> = {
  SUCCESS: { icon: "bg-success/10 text-success", border: "border-r-success", dot: "bg-success" },
  WARNING: { icon: "bg-warning/10 text-warning", border: "border-r-warning", dot: "bg-warning" },
  DANGER: { icon: "bg-danger/10 text-danger", border: "border-r-danger", dot: "bg-danger" },
  INFO: { icon: "bg-teal/10 text-teal", border: "border-r-teal", dot: "bg-teal" },
};

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "الآن";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function category(type: string): Exclude<Filter, "ALL" | "UNREAD"> | "OTHER" {
  if (type.startsWith("TASK_")) return "TASKS";
  if (type.startsWith("LEAVE_") || type.startsWith("OVERTIME_") || type.startsWith("SUBMISSION_")) return "REQUESTS";
  if (type.startsWith("PROJECT_")) return "PROJECTS";
  return "OTHER";
}

function notificationIcon(type: string) {
  if (type.startsWith("TASK_")) return CheckSquareIcon;
  if (type.startsWith("LEAVE_")) return CalendarIcon;
  if (type.startsWith("OVERTIME_")) return ClockIcon;
  if (type.startsWith("PROJECT_")) return FolderIcon;
  if (type.startsWith("SUBMISSION_")) return FileTextIcon;
  return FileTextIcon;
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
}

function playNotificationTone(contextRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const context = contextRef.current || new AudioContext();
    contextRef.current = context;
    if (context.state !== "running") return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    gain.connect(context.destination);
    [740, 980].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(now + index * 0.13);
      oscillator.stop(now + 0.32 + index * 0.13);
    });
  } catch {}
}

export default function NotificationCenter() {
  const router = useRouter();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Notification | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?limit=30", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const items: Notification[] = data.notifications || [];
      const newItems = initialized.current
        ? items.filter((item) => !item.isRead && !knownIds.current.has(item.id))
        : [];
      if (newItems.length) {
        const newest = newItems[0];
        setToast(newest);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 6500);
        if (user?.role === "EMPLOYEE") playNotificationTone(audioContextRef);
      }
      knownIds.current = new Set(items.map((item) => item.id));
      initialized.current = true;
      setNotifications(items);
      setUnreadCount(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 15000);
    return () => {
      window.clearInterval(timer);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (user?.role !== "EMPLOYEE") return;
    const unlock = () => {
      try {
        const context = audioContextRef.current || new AudioContext();
        audioContextRef.current = context;
        if (context.state === "suspended") void context.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [user?.role]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const visible = useMemo(() => notifications.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "UNREAD") return !item.isRead;
    return category(item.type) === filter;
  }), [filter, notifications]);

  const groups = useMemo(() => [
    { label: "اليوم", items: visible.filter((item) => isToday(item.createdAt)) },
    { label: "سابقاً", items: visible.filter((item) => !isToday(item.createdAt)) },
  ].filter((group) => group.items.length), [visible]);

  const openNotification = async (notification: Notification) => {
    if (!notification.isRead) {
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
    }
    setToast(null);
    setOpen(false);
    if (notification.actionUrl) router.push(notification.actionUrl);
  };

  const readAll = async () => {
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readAll: true }),
    });
  };

  const remove = async (event: React.MouseEvent, notification: Notification) => {
    event.stopPropagation();
    setNotifications((items) => items.filter((item) => item.id !== notification.id));
    if (!notification.isRead) setUnreadCount((count) => Math.max(0, count - 1));
    await fetch(`/api/notifications?id=${notification.id}`, { method: "DELETE" });
  };

  const clearRead = async () => {
    setNotifications((items) => items.filter((item) => !item.isRead));
    await fetch("/api/notifications?read=true", { method: "DELETE" });
  };

  const counts = {
    ALL: notifications.length,
    UNREAD: notifications.filter((item) => !item.isRead).length,
    TASKS: notifications.filter((item) => category(item.type) === "TASKS").length,
    REQUESTS: notifications.filter((item) => category(item.type) === "REQUESTS").length,
    PROJECTS: notifications.filter((item) => category(item.type) === "PROJECTS").length,
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`الإشعارات${unreadCount ? `، ${unreadCount} غير مقروءة` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void fetchNotifications();
        }}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
          open ? "bg-teal text-white shadow-soft" : "text-muted hover:bg-tint hover:text-navy"
        }`}
      >
        <BellIcon size={20} />
        {unreadCount > 0 && (
          <span className="absolute -left-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[8px] font-bold leading-none text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {toast && !open && (
        <div className="fixed inset-x-3 top-20 z-[70] rounded-2xl border border-teal/20 bg-white p-2 shadow-soft-lg animate-slide-up sm:inset-x-auto sm:left-5 sm:w-[360px]">
          <button onClick={() => void openNotification(toast)} className="flex w-full items-start gap-3 rounded-xl p-1 text-right hover:bg-tint/30">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal"><BellIcon size={18} /></div>
            <div className="min-w-0 flex-1 pl-7"><p className="text-[10px] font-semibold text-teal">إشعار جديد</p><p className="mt-0.5 text-sm font-bold text-navy">{toast.title}</p><p className="mt-1 line-clamp-1 text-xs text-muted">{toast.message}</p></div>
          </button>
          <button aria-label="إغلاق المعاينة" onClick={() => setToast(null)} className="absolute left-3 top-3 rounded-lg p-1 text-muted hover:bg-tint hover:text-navy"><XIcon size={14} /></button>
        </div>
      )}

      {open && (
        <div className="fixed inset-x-2 top-[4.5rem] z-50 flex max-h-[calc(100dvh-5.25rem)] flex-col overflow-hidden rounded-2xl border border-tint-200 bg-white shadow-soft-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-12 sm:h-[min(72vh,650px)] sm:w-[430px]">
          <div className="border-b border-tint-200 bg-gradient-to-l from-teal/[0.07] to-transparent px-4 pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><h2 className="font-bold text-navy">مركز الإشعارات</h2>{unreadCount > 0 && <span className="badge-info">{unreadCount} جديد</span>}</div>
                <p className="mt-1 text-[10px] text-muted">آخر تحديثات المهام والطلبات والمشاريع</p>
              </div>
              <button onClick={() => { setOpen(false); router.push("/settings"); }} title="إعدادات الإشعارات" className="rounded-xl p-2 text-muted hover:bg-white hover:text-teal"><SettingsIcon size={17} /></button>
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto pb-0.5">
              {filterLabels.map((item) => (
                <button key={item.id} onClick={() => setFilter(item.id)} className={`flex min-w-max items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${filter === item.id ? "bg-teal text-white shadow-soft" : "bg-white/70 text-muted hover:text-navy"}`}>
                  {item.label}<span className={`rounded-full px-1.5 py-0.5 text-[8px] ${filter === item.id ? "bg-white/15" : "bg-tint"}`}>{counts[item.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-tint-200 px-4 py-2">
            <span className="text-[10px] text-muted">{visible.length} إشعارات</span>
            <div className="flex items-center gap-1">
              {notifications.some((item) => item.isRead) && <button onClick={() => void clearRead()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted hover:bg-danger/5 hover:text-danger"><TrashIcon size={12} /> حذف المقروءة</button>}
              {unreadCount > 0 && <button onClick={() => void readAll()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-teal hover:bg-teal/5"><CheckIcon size={12} /> قراءة الكل</button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-20 rounded-xl" />)}</div>
            ) : visible.length === 0 ? (
              <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tint"><BellIcon size={23} className="text-muted/40" /></div>
                <p className="text-sm font-semibold text-navy">{filter === "UNREAD" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات ضمن هذا التصنيف"}</p>
                <p className="mt-1 text-xs text-muted">{filter === "UNREAD" ? "أنت مطّلع على كل جديد" : "جرّب اختيار تصنيف آخر"}</p>
              </div>
            ) : groups.map((group) => (
              <section key={group.label}>
                <div className="sticky top-0 z-10 bg-surface/95 px-4 py-1.5 text-[9px] font-semibold text-muted backdrop-blur-sm">{group.label}</div>
                {group.items.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} onOpen={openNotification} onRemove={remove} />
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification, onOpen, onRemove }: {
  notification: Notification;
  onOpen: (notification: Notification) => Promise<void>;
  onRemove: (event: React.MouseEvent, notification: Notification) => Promise<void>;
}) {
  const Icon = notificationIcon(notification.type);
  const tone = severityTone[notification.severity] || severityTone.INFO;
  return (
    <div
      onClick={() => void onOpen(notification)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void onOpen(notification);
      }}
      role="button"
      tabIndex={0}
      className={`group relative flex items-start gap-3 border-b border-r-4 border-b-tint-200/70 px-3 py-3 text-right transition-colors hover:bg-tint/30 sm:px-4 ${tone.border} ${notification.isRead ? "bg-white" : "bg-teal/[0.035]"}`}
    >
      <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tone.icon}`}><Icon size={18} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`flex-1 text-xs leading-5 text-navy ${notification.isRead ? "font-semibold" : "font-bold"}`}>{notification.title}</p>
          {notification.audience === "ADMIN" && <span className="rounded-full bg-navy/10 px-1.5 py-0.5 text-[8px] font-semibold text-navy">إداري</span>}
          {!notification.isRead && <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${tone.dot}`} />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{notification.message}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2"><time className="text-[9px] text-muted/70">{relativeTime(notification.createdAt)}</time>{notification.actionUrl && <span className="text-[9px] font-semibold text-teal">عرض التفاصيل ←</span>}</div>
      </div>
      <button type="button" aria-label="حذف الإشعار" onClick={(event) => void onRemove(event, notification)} className="absolute left-2 top-2 rounded-lg bg-white p-1 text-muted opacity-0 shadow-soft transition-opacity hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"><XIcon size={12} /></button>
    </div>
  );
}
