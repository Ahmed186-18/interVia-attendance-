"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  PauseIcon,
  PlayIcon,
  TrendingUpIcon,
  Volume2Icon,
} from "@/components/icons";

interface HourlyCheck {
  id: string;
  scheduledAt: string;
  confirmedAt: string | null;
  isConfirmed: boolean;
  isDeducted: boolean;
}

interface Attendance {
  id: string;
  checkIn: string;
  checkOut: string | null;
  totalHours: number;
  isActive: boolean;
  expectedHours: number;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  hourlyChecks: HourlyCheck[];
}

interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  executionOrder: number;
  deadline: string | null;
  project: { id: string; name: string };
  timeEntries: TimeEntry[];
}

interface EmployeeRequest {
  id: string;
  status: string;
  createdAt: string;
}

const NOTIFICATION_WINDOW_MS = 15 * 60 * 1000;

function playNotificationSound() {
  try {
    const context = new AudioContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1100, now + 0.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.35);
  } catch {}
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const hours = Math.floor(safe / 3600000);
  const minutes = Math.floor((safe % 3600000) / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function MyDayPage() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overtime, setOvertime] = useState<EmployeeRequest[]>([]);
  const [leave, setLeave] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [taskAction, setTaskAction] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustment, setAdjustment] = useState({ requestedCheckIn: "", requestedCheckOut: "", reason: "" });
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const playedChecksRef = useRef<Set<string>>(new Set());

  const fetchDayData = useCallback(async () => {
    try {
      const [attendanceResponse, tasksResponse, overtimeResponse, leaveResponse] = await Promise.all([
        fetch("/api/attendance/today"),
        fetch("/api/tasks?view=my"),
        fetch("/api/overtime"),
        fetch("/api/leave"),
      ]);
      const [attendanceData, tasksData, overtimeData, leaveData] = await Promise.all([
        attendanceResponse.json(),
        tasksResponse.json(),
        overtimeResponse.json(),
        leaveResponse.json(),
      ]);
      setAttendance(attendanceData.attendance || null);
      setTasks(tasksData.tasks || []);
      setOvertime(overtimeData.requests || []);
      setLeave(leaveData.requests || []);
    } catch {
      setMessage({ tone: "danger", text: "تعذر تحميل بيانات يومك" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDayData();
  }, [fetchDayData]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const windowChecks = useMemo(
    () =>
      attendance?.hourlyChecks.filter((check) => {
        if (check.isConfirmed) return false;
        const scheduled = new Date(check.scheduledAt).getTime();
        return currentTime.getTime() >= scheduled && currentTime.getTime() <= scheduled + NOTIFICATION_WINDOW_MS;
      }) || [],
    [attendance, currentTime]
  );

  const missedChecks = useMemo(
    () =>
      attendance?.hourlyChecks.filter(
        (check) =>
          !check.isConfirmed &&
          currentTime.getTime() > new Date(check.scheduledAt).getTime() + NOTIFICATION_WINDOW_MS
      ) || [],
    [attendance, currentTime]
  );

  useEffect(() => {
    windowChecks.forEach((check) => {
      if (!playedChecksRef.current.has(check.id)) {
        playedChecksRef.current.add(check.id);
        playNotificationSound();
      }
    });
  }, [windowChecks]);

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "COMPLETED")
        .sort((a, b) => {
          const statusOrder = (task: Task) => task.status === "IN_PROGRESS" ? 0 : 1;
          return statusOrder(a) - statusOrder(b) || a.executionOrder - b.executionOrder;
        }),
    [tasks]
  );

  const activeTimer = useMemo(() => {
    for (const task of tasks) {
      const entry = task.timeEntries.find((time) => !time.endedAt);
      if (entry) return { task, entry };
    }
    return null;
  }, [tasks]);

  const confirmedChecks = attendance?.hourlyChecks.filter((check) => check.isConfirmed).length || 0;
  const totalChecks = attendance?.hourlyChecks.length || 0;
  const deductedChecks = attendance?.hourlyChecks.filter((check) => check.isDeducted).length || 0;
  const overdueTasks = activeTasks.filter((task) => task.deadline && new Date(task.deadline) < currentTime).length;
  const pendingRequests = [...overtime, ...leave].filter((request) => request.status === "PENDING").length;
  const approvedRequests = [...overtime, ...leave].filter((request) => request.status === "APPROVED").length;

  const workMilliseconds = attendance
    ? (attendance.checkOut ? new Date(attendance.checkOut) : currentTime).getTime() -
      new Date(attendance.checkIn).getTime()
    : 0;
  const expectedCheckout = attendance
    ? new Date(new Date(attendance.checkIn).getTime() + (attendance.expectedHours || 8) * 3600000)
    : null;

  const greeting = currentTime.getHours() < 12 ? "صباح الخير" : "مساء الخير";

  const attendanceAction = async (type: "check-in" | "check-out") => {
    setChecking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/attendance/${type}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تسجيل الدوام");
      setMessage({ tone: "success", text: type === "check-in" ? "تم تسجيل حضورك" : "تم تسجيل انصرافك" });
      await fetchDayData();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "حدث خطأ" });
    } finally {
      setChecking(false);
    }
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!attendance) return;
    setAdjustmentSaving(true);
    try {
      const response = await fetch("/api/attendance/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId: attendance.id, ...adjustment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الطلب");
      setMessage({ tone: "success", text: "تم إرسال طلب تعديل الحضور للمراجعة" });
      setShowAdjustment(false);
      setAdjustment({ requestedCheckIn: "", requestedCheckOut: "", reason: "" });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر إرسال الطلب" });
    } finally {
      setAdjustmentSaving(false);
    }
  };

  const confirmCheck = async (checkId: string) => {
    const response = await fetch("/api/attendance/hourly-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ tone: "danger", text: data.error || "تعذر تأكيد الحضور" });
      return;
    }
    setMessage({ tone: data.isLate ? "danger" : "success", text: data.isLate ? "تم التأكيد متأخرًا واحتساب الخصم" : "تم تأكيد حضورك" });
    fetchDayData();
  };

  const toggleTimer = async (task: Task) => {
    setTaskAction(task.id);
    setMessage(null);
    try {
      const activeEntry = task.timeEntries.find((entry) => !entry.endedAt);
      const response = await fetch(`/api/tasks/${task.id}/time`, {
        method: activeEntry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeEntry ? { id: activeEntry.id } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحديث المؤقت");
      setMessage({ tone: "success", text: activeEntry ? "تم إيقاف مؤقت المهمة" : "بدأ تسجيل وقت المهمة" });
      await fetchDayData();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "حدث خطأ" });
    } finally {
      setTaskAction("");
    }
  };

  const sendForReview = async (task: Task) => {
    setTaskAction(task.id);
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: "IN_REVIEW" }),
    });
    const data = await response.json();
    setTaskAction("");
    if (!response.ok) {
      setMessage({ tone: "danger", text: data.error || "تعذر إرسال المهمة للمراجعة" });
      return;
    }
    setMessage({ tone: "success", text: "تم إرسال المهمة للمراجعة" });
    fetchDayData();
  };

  if (user?.role === "MANAGER" || user?.role === "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-teal/10"><ClockIcon size={32} className="text-teal" /></div>
        <h1 className="text-xl font-bold text-navy">لوحة المدير</h1>
        <p className="mt-2 max-w-md text-muted">صفحة يومي مخصصة للموظفين. يمكنك متابعة الفريق من مركز إدارة الموظفين.</p>
        <Link href="/employees" className="btn-primary mt-5">فتح مركز الفريق</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="space-y-5"><div className="skeleton h-28 rounded-2xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-card" />)}</div><div className="skeleton h-80 rounded-2xl" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">{greeting}، {user?.name?.split(" ")[0]}</h1>
          <p className="page-subtitle">{currentTime.toLocaleDateString("ar", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        {!attendance ? (
          <button disabled={checking} onClick={() => attendanceAction("check-in")} className="btn-primary flex items-center gap-2 disabled:opacity-50"><ClockIcon size={19} /> {checking ? "جاري التسجيل..." : "تسجيل الحضور"}</button>
        ) : !attendance.checkOut ? (
          <button disabled={checking} onClick={() => attendanceAction("check-out")} className="btn-secondary flex items-center gap-2 border-danger/20 text-danger disabled:opacity-50"><ClockIcon size={19} /> {checking ? "جاري التسجيل..." : "تسجيل الانصراف"}</button>
        ) : <div className="flex flex-wrap items-center gap-2"><span className="badge-success px-4 py-2">اكتمل دوام اليوم</span><button onClick={() => setShowAdjustment(true)} className="btn-ghost text-xs text-teal">طلب تعديل</button></div>}
      </div>

      {message && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${message.tone === "success" ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}>{message.tone === "success" ? <CheckIcon size={17} /> : <AlertCircleIcon size={17} />}{message.text}<button onClick={() => setMessage(null)} className="mr-auto">×</button></div>}

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-navy-600 via-navy-500 to-teal p-5 text-white shadow-soft-lg sm:p-6">
        <div className="absolute -left-12 -top-16 h-44 w-44 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-white/70"><span className={`h-2.5 w-2.5 rounded-full ${attendance?.isActive ? "bg-success animate-pulse" : "bg-white/40"}`} />{attendance?.isActive ? "أنت تعمل الآن" : attendance?.checkOut ? "انتهى دوامك" : "لم تبدأ دوامك"}</div>
            <p className="mt-2 font-mono text-3xl font-bold tracking-tight sm:text-4xl">{formatDuration(workMilliseconds)}</p>
            <p className="mt-2 text-xs text-white/60">{attendance ? `بدأت ${formatTime(attendance.checkIn)}${expectedCheckout ? ` · الخروج المتوقع ${formatTime(expectedCheckout)}` : ""}` : "سجّل حضورك لبدء احتساب يوم العمل"}</p>
          </div>
          {activeTimer && (
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm sm:min-w-64">
              <p className="text-[10px] text-white/60">المهمة النشطة الآن</p>
              <p className="mt-1 truncate text-sm font-semibold">{activeTimer.task.title}</p>
              <p className="mt-2 font-mono text-lg">{formatDuration(currentTime.getTime() - new Date(activeTimer.entry.startedAt).getTime())}</p>
            </div>
          )}
        </div>
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.min((workMilliseconds / ((attendance?.expectedHours || 8) * 3600000)) * 100, 100)}%` }} /></div>
      </section>

      {(attendance?.lateMinutes || 0) > 0 && <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-sm text-warning">تم تسجيل تأخير بمقدار {attendance?.lateMinutes} دقيقة بعد احتساب السماحية.</div>}
      {(attendance?.earlyLeaveMinutes || 0) > 0 && <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-sm text-warning">تم تسجيل انصراف مبكر بمقدار {attendance?.earlyLeaveMinutes} دقيقة.</div>}

      {showAdjustment && attendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 backdrop-blur-sm">
          <form onSubmit={submitAdjustment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-soft-lg">
            <div className="flex items-center justify-between"><h2 className="font-bold text-navy">طلب تعديل الحضور</h2><button type="button" onClick={() => setShowAdjustment(false)} className="text-muted">×</button></div>
            <p className="text-xs leading-5 text-muted">أدخل الوقت الصحيح للعنصر الذي تريد تعديله. سيصل الطلب إلى المدير للمراجعة.</p>
            <label className="label">وقت الحضور المطلوب<input type="datetime-local" value={adjustment.requestedCheckIn} onChange={(event) => setAdjustment({ ...adjustment, requestedCheckIn: event.target.value })} className="input-field mt-1" /></label>
            <label className="label">وقت الانصراف المطلوب<input type="datetime-local" value={adjustment.requestedCheckOut} onChange={(event) => setAdjustment({ ...adjustment, requestedCheckOut: event.target.value })} className="input-field mt-1" /></label>
            <label className="label">السبب<textarea required minLength={5} value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} className="input-field mt-1 min-h-24 resize-none" placeholder="مثال: نسيت تسجيل الانصراف بسبب اجتماع خارجي" /></label>
            <div className="flex gap-2"><button disabled={adjustmentSaving} className="btn-primary flex-1 disabled:opacity-50">{adjustmentSaving ? "جارٍ الإرسال..." : "إرسال الطلب"}</button><button type="button" onClick={() => setShowAdjustment(false)} className="btn-secondary flex-1">إلغاء</button></div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={CheckSquareIcon} label="مهام نشطة" value={activeTasks.length} hint={`${overdueTasks} متأخرة`} tone={overdueTasks ? "danger" : "teal"} />
        <Metric icon={ClockIcon} label="فحوصات مؤكدة" value={`${confirmedChecks}/${totalChecks}`} hint={`${deductedChecks} خصومات`} tone={deductedChecks ? "danger" : "success"} />
        <Metric icon={FileTextIcon} label="طلبات معلقة" value={pendingRequests} hint={`${approvedRequests} طلبات مقبولة`} tone="warning" />
        <Metric icon={TrendingUpIcon} label="وقت المهام اليوم" value={`${tasks.reduce((sum, task) => sum + task.timeEntries.reduce((entrySum, entry) => entrySum + (entry.duration || 0), 0), 0).toFixed(1)} س`} hint="الوقت المسجل" tone="navy" />
      </div>

      {(overdueTasks > 0 || missedChecks.length > 0 || windowChecks.length > 0) && (
        <section className="rounded-2xl border border-warning/20 bg-warning/[0.06] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2"><AlertCircleIcon size={18} className="text-warning" /><h2 className="font-semibold text-navy">يحتاج انتباهك</h2></div>
          <div className="grid gap-2 sm:grid-cols-3">
            {windowChecks.length > 0 && <Attention text={`${windowChecks.length} فحص حضور بانتظار التأكيد`} tone="success" />}
            {missedChecks.length > 0 && <Attention text={`${missedChecks.length} فحوصات فات موعدها`} tone="danger" />}
            {overdueTasks > 0 && <Attention text={`${overdueTasks} مهام تجاوزت موعدها`} tone="danger" />}
          </div>
        </section>
      )}

      {windowChecks.length > 0 && (
        <section className="card border-success/25 p-4">
          <div className="mb-3 flex items-center gap-2"><Volume2Icon size={19} className="animate-pulse text-success" /><h2 className="font-semibold text-success">تأكيد الحضور الآن</h2></div>
          {windowChecks.map((check) => {
            const remaining = new Date(check.scheduledAt).getTime() + NOTIFICATION_WINDOW_MS - currentTime.getTime();
            return <div key={check.id} className="flex items-center justify-between gap-3 rounded-xl bg-success/5 p-3"><div><p className="text-sm font-medium text-navy">فحص الساعة {formatTime(check.scheduledAt)}</p><p className="mt-1 font-mono text-xs text-success">متبقٍ {formatDuration(remaining).slice(3)}</p></div><button onClick={() => confirmCheck(check.id)} className="btn-primary py-2 text-sm">تأكيد الآن</button></div>;
          })}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-tint-200 p-5">
            <div><h2 className="font-semibold text-navy">ترتيب تنفيذك اليوم</h2><p className="mt-1 text-xs text-muted">المهام النشطة حسب ترتيب السحب والإفلات</p></div>
            <Link href="/tasks" className="text-xs font-medium text-teal">كل المهام</Link>
          </div>
          {activeTasks.length ? (
            <div className="divide-y divide-tint-200">
              {activeTasks.slice(0, 6).map((task, index) => <DayTask key={task.id} task={task} order={index + 1} attendanceActive={Boolean(attendance?.isActive)} activeTimer={activeTimer} busy={taskAction === task.id} now={currentTime} onTimer={() => toggleTimer(task)} onReview={() => sendForReview(task)} />)}
            </div>
          ) : <EmptyState icon={CheckSquareIcon} title="أحسنت، لا توجد مهام نشطة" text="ستظهر هنا المهام المسندة إليك" />}
        </section>

        <Timeline attendance={attendance} tasks={tasks} />
      </div>

      <section className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-navy">الإجازات والساعات الإضافية</h2><p className="mt-1 text-xs text-muted">{pendingRequests ? `لديك ${pendingRequests} طلبات قيد المراجعة` : "لا توجد طلبات معلقة"}</p></div>
          <div className="flex gap-2"><Link href="/requests?type=leave&new=true" className="btn-secondary flex items-center gap-2 py-2 text-sm"><CalendarIcon size={16} /> طلب إجازة</Link><Link href="/requests?type=overtime&new=true" className="btn-primary flex items-center gap-2 py-2 text-sm"><ClockIcon size={16} /> ساعات إضافية</Link></div>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof ClockIcon; label: string; value: string | number; hint: string; tone: "teal" | "success" | "warning" | "danger" | "navy" }) {
  const colors = { teal: "bg-teal/10 text-teal", success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger", navy: "bg-navy/10 text-navy" };
  return <div className="card p-4"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${colors[tone]}`}><Icon size={18} /></div><p className="text-[11px] text-muted">{label}</p><p className="mt-1 text-xl font-bold text-navy">{value}</p><p className={`mt-1 text-[10px] ${tone === "danger" ? "text-danger" : "text-muted"}`}>{hint}</p></div>;
}

function Attention({ text, tone }: { text: string; tone: "success" | "danger" }) {
  return <div className="rounded-xl bg-white p-3 text-sm text-navy shadow-soft"><span className={`ml-2 inline-block h-2 w-2 rounded-full ${tone === "success" ? "bg-success" : "bg-danger"}`} />{text}</div>;
}

function DayTask({ task, order, attendanceActive, activeTimer, busy, now, onTimer, onReview }: { task: Task; order: number; attendanceActive: boolean; activeTimer: { task: Task; entry: TimeEntry } | null; busy: boolean; now: Date; onTimer: () => void; onReview: () => void }) {
  const activeEntry = task.timeEntries.find((entry) => !entry.endedAt);
  const overdue = task.deadline && new Date(task.deadline) < now;
  const timerBlocked = !activeEntry && Boolean(activeTimer);
  return (
    <div className="p-4 transition-colors hover:bg-tint/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${overdue ? "bg-danger" : order === 1 ? "bg-danger" : order === 2 ? "bg-warning" : order === 3 ? "bg-teal" : "bg-navy-300"}`}>{order}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-navy">{task.title}</h3>{overdue && <span className="badge-danger">متأخرة</span>}{task.status === "IN_REVIEW" && <span className="badge-info">قيد المراجعة</span>}</div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><FolderIcon size={13} />{task.project.name}{task.deadline && ` · ${new Date(task.deadline).toLocaleDateString("ar", { day: "numeric", month: "short" })}`}</p>
          {activeEntry && <p className="mt-1 font-mono text-xs font-semibold text-success">{formatDuration(now.getTime() - new Date(activeEntry.startedAt).getTime())}</p>}
        </div>
        <div className="flex gap-2">
          {task.status === "IN_PROGRESS" && <button disabled={busy || Boolean(activeEntry)} onClick={onReview} title={activeEntry ? "أوقف المؤقت أولًا" : ""} className="rounded-xl px-3 py-2 text-xs font-medium text-teal hover:bg-teal/5 disabled:opacity-50">إرسال للمراجعة</button>}
          <button disabled={busy || timerBlocked || (!attendanceActive && !activeEntry)} onClick={onTimer} title={!attendanceActive && !activeEntry ? "سجّل حضورك أولًا" : timerBlocked ? "أوقف المهمة النشطة أولًا" : ""} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${activeEntry ? "bg-danger/10 text-danger" : "bg-teal text-white"}`}>{activeEntry ? <PauseIcon size={14} /> : <PlayIcon size={14} />}{activeEntry ? "إيقاف" : "بدء"}</button>
        </div>
      </div>
    </div>
  );
}

function Timeline({ attendance, tasks }: { attendance: Attendance | null; tasks: Task[] }) {
  const events = useMemo(() => {
    const items: { id: string; time: Date; title: string; tone: string }[] = [];
    if (attendance) {
      items.push({ id: "check-in", time: new Date(attendance.checkIn), title: "تسجيل الحضور", tone: "bg-success" });
      attendance.hourlyChecks.filter((check) => check.confirmedAt).forEach((check) => items.push({ id: check.id, time: new Date(check.confirmedAt!), title: check.isDeducted ? "تأكيد متأخر" : "تأكيد الحضور", tone: check.isDeducted ? "bg-danger" : "bg-teal" }));
      if (attendance.checkOut) items.push({ id: "check-out", time: new Date(attendance.checkOut), title: "تسجيل الانصراف", tone: "bg-navy" });
    }
    tasks.flatMap((task) => task.timeEntries).forEach((entry) => {
      items.push({ id: `start-${entry.id}`, time: new Date(entry.startedAt), title: "بدء العمل على مهمة", tone: "bg-warning" });
      if (entry.endedAt) items.push({ id: `end-${entry.id}`, time: new Date(entry.endedAt), title: "إيقاف مؤقت المهمة", tone: "bg-muted" });
    });
    return items.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [attendance, tasks]);
  return (
    <section className="card p-5">
      <div className="mb-5"><h2 className="font-semibold text-navy">الخط الزمني لليوم</h2><p className="mt-1 text-xs text-muted">آخر أحداث الدوام والعمل</p></div>
      {events.length ? <div className="space-y-0">{events.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">{index < events.length - 1 && <div className="absolute right-[5px] top-3 h-full w-px bg-tint-200" />}<span className={`relative z-10 mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white ${event.tone}`} /><div><p className="text-xs font-medium text-navy">{event.title}</p><p className="mt-1 text-[10px] text-muted">{formatTime(event.time)}</p></div></div>)}</div> : <EmptyState icon={ClockIcon} title="لا توجد أحداث بعد" text="ابدأ يومك بتسجيل الحضور" compact />}
    </section>
  );
}

function EmptyState({ icon: Icon, title, text, compact = false }: { icon: typeof ClockIcon; title: string; text: string; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-10" : "py-14"}`}><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-tint"><Icon size={21} className="text-muted/40" /></div><p className="text-sm font-medium text-navy">{title}</p><p className="mt-1 text-xs text-muted">{text}</p></div>;
}
