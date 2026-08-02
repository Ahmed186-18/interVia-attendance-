"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  BarChartIcon,
  CalendarIcon,
  CheckSquareIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/icons";

type Tab = "summary" | "attendance" | "tasks" | "projects" | "overtime";

interface ReportsData {
  filters: {
    users: { id: string; name: string; email: string }[];
    projects: { id: string; name: string; deadline: string | null }[];
  };
  summary: {
    attendanceDays: number;
    totalHours: number;
    averageHours: number;
    confirmedRate: number;
    deductedChecks: number;
    completedTasks: number;
    completionRate: number;
    overdueTasks: number;
    pendingOvertime: number;
    approvedOvertimeHours: number;
  };
  charts: {
    trend: { date: string; attendance: number; hours: number; completed: number }[];
    taskStatus: { IN_PROGRESS: number; IN_REVIEW: number; COMPLETED: number };
  };
  attendance: {
    id: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    totalHours: number;
    isActive: boolean;
    status: string;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    user: { id: string; name: string; email: string };
    confirmedChecks: number;
    deductedChecks: number;
    totalChecks: number;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline: string | null;
    updatedAt: string;
    assignee: { id: string; name: string };
    project: { id: string; name: string };
    subtaskProgress: number;
    trackedHours: number;
  }[];
  projects: {
    id: string;
    name: string;
    deadline: string | null;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    trackedHours: number;
    progress: number;
  }[];
  overtime: {
    id: string;
    hours: number;
    status: string;
    reason: string | null;
    createdAt: string;
    user: { id: string; name: string };
  }[];
}

const tabs: { id: Tab; label: string }[] = [
  { id: "summary", label: "الملخص التنفيذي" },
  { id: "attendance", label: "الحضور والانضباط" },
  { id: "tasks", label: "المهام والإنتاجية" },
  { id: "projects", label: "المشاريع" },
  { id: "overtime", label: "الساعات الإضافية" },
];

const statusLabels: Record<string, string> = {
  IN_PROGRESS: "قيد التنفيذ",
  IN_REVIEW: "قيد المراجعة",
  COMPLETED: "مكتملة",
  PENDING: "معلّق",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

const priorityLabels: Record<string, string> = {
  HIGH: "عالية",
  MEDIUM: "متوسطة",
  LOW: "منخفضة",
};

function inputDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof ClockIcon;
  tone?: "teal" | "navy" | "success" | "warning" | "danger";
}) {
  const tones = {
    teal: "bg-teal/10 text-teal",
    navy: "bg-navy/10 text-navy",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-navy">{value}</p>
          <p className="mt-1 text-[11px] text-muted/80">{hint}</p>
        </div>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const now = useMemo(() => new Date(), []);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [from, setFrom] = useState(inputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(inputDate(now));
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (userId) params.set("userId", userId);
      if (projectId) params.set("projectId", projectId);
      const response = await fetch(`/api/reports?${params.toString()}`);
      if (!response.ok) throw new Error("تعذر تحميل التقرير");
      setData(await response.json());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, [from, to, userId, projectId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const setPeriod = (period: "week" | "month" | "quarter") => {
    const end = new Date();
    const start = new Date();
    if (period === "week") start.setDate(end.getDate() - 6);
    if (period === "month") start.setDate(end.getDate() - 29);
    if (period === "quarter") start.setMonth(end.getMonth() - 3);
    setFrom(inputDate(start));
    setTo(inputDate(end));
  };

  const exportCsv = () => {
    if (!data) return;
    let rows: (string | number)[][] = [];
    let fileName = "report";

    if (activeTab === "attendance" || activeTab === "summary") {
      fileName = "attendance-report";
      rows = [
        ["الموظف", "التاريخ", "الدخول", "الخروج", "الساعات", "الفحوصات المؤكدة", "الخصومات"],
        ...data.attendance.map((item) => [
          item.user.name,
          formatDate(item.date),
          formatTime(item.checkIn),
          item.checkOut ? formatTime(item.checkOut) : "-",
          item.totalHours.toFixed(1),
          `${item.confirmedChecks}/${item.totalChecks}`,
          item.deductedChecks,
        ]),
      ];
    } else if (activeTab === "tasks") {
      fileName = "tasks-report";
      rows = [
        ["المهمة", "الموظف", "المشروع", "الحالة", "الأولوية", "الموعد", "الساعات"],
        ...data.tasks.map((item) => [
          item.title,
          item.assignee.name,
          item.project.name,
          statusLabels[item.status] || item.status,
          priorityLabels[item.priority] || item.priority,
          item.deadline ? formatDate(item.deadline) : "-",
          item.trackedHours.toFixed(1),
        ]),
      ];
    } else if (activeTab === "projects") {
      fileName = "projects-report";
      rows = [
        ["المشروع", "نسبة الإنجاز", "إجمالي المهام", "المكتملة", "المتأخرة", "الساعات"],
        ...data.projects.map((item) => [
          item.name,
          `${item.progress}%`,
          item.totalTasks,
          item.completedTasks,
          item.overdueTasks,
          item.trackedHours.toFixed(1),
        ]),
      ];
    } else {
      fileName = "overtime-report";
      rows = [
        ["الموظف", "الساعات", "الحالة", "السبب", "التاريخ"],
        ...data.overtime.map((item) => [
          item.user.name,
          item.hours,
          statusLabels[item.status] || item.status,
          item.reason || "-",
          formatDate(item.createdAt),
        ]),
      ];
    }

    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxTrendHours = Math.max(...(data?.charts.trend.map((item) => item.hours) || [1]), 1);
  const taskTotal = data
    ? data.charts.taskStatus.IN_PROGRESS + data.charts.taskStatus.IN_REVIEW + data.charts.taskStatus.COMPLETED
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">التقارير والتحليلات</h1>
          <p className="page-subtitle">مركز موحّد لمتابعة الحضور والإنتاجية وصحة المشاريع</p>
        </div>
        <button onClick={exportCsv} disabled={!data || loading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <DownloadIcon size={18} />
          تصدير التقرير
        </button>
      </div>

      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setPeriod("week")} className="rounded-lg bg-tint px-3 py-1.5 text-xs font-medium text-navy hover:bg-teal/10 hover:text-teal">آخر 7 أيام</button>
          <button onClick={() => setPeriod("month")} className="rounded-lg bg-tint px-3 py-1.5 text-xs font-medium text-navy hover:bg-teal/10 hover:text-teal">آخر 30 يومًا</button>
          <button onClick={() => setPeriod("quarter")} className="rounded-lg bg-tint px-3 py-1.5 text-xs font-medium text-navy hover:bg-teal/10 hover:text-teal">آخر 3 أشهر</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-muted">
            من تاريخ
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="input-field mt-1.5 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-muted">
            إلى تاريخ
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="input-field mt-1.5 py-2.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-muted">
            الموظف
            <select value={userId} onChange={(event) => setUserId(event.target.value)} className="input-field mt-1.5 py-2.5 text-sm">
              <option value="">كل الموظفين</option>
              {data?.filters.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            المشروع
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="input-field mt-1.5 py-2.5 text-sm">
              <option value="">كل المشاريع</option>
              {data?.filters.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="overflow-x-auto border-b border-tint-200">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id ? "text-teal" : "text-muted hover:text-navy"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-teal" />}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          <AlertCircleIcon size={18} /> {error}
          <button onClick={fetchReport} className="mr-auto font-semibold">إعادة المحاولة</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-card" />)}</div>
          <div className="skeleton-card h-80" />
        </div>
      ) : data ? (
        <>
          {activeTab === "summary" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="إجمالي ساعات العمل" value={data.summary.totalHours.toFixed(1)} hint={`متوسط ${data.summary.averageHours.toFixed(1)} ساعة لليوم`} icon={ClockIcon} />
                <MetricCard label="الالتزام بالفحوصات" value={`${data.summary.confirmedRate}%`} hint={`${data.summary.deductedChecks} فحوصات عليها خصم`} icon={CheckSquareIcon} tone="success" />
                <MetricCard label="إنجاز المهام" value={`${data.summary.completionRate}%`} hint={`${data.summary.completedTasks} مهام مكتملة`} icon={TrendingUpIcon} tone="navy" />
                <MetricCard label="المهام المتأخرة" value={String(data.summary.overdueTasks)} hint="تحتاج متابعة الإدارة" icon={AlertCircleIcon} tone={data.summary.overdueTasks ? "danger" : "success"} />
              </div>

              {(data.summary.overdueTasks > 0 || data.summary.pendingOvertime > 0 || data.summary.deductedChecks > 0) && (
                <section className="rounded-2xl border border-warning/20 bg-warning/[0.06] p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <AlertCircleIcon size={19} className="text-warning" />
                    <h2 className="font-semibold text-navy">يحتاج انتباهك</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button onClick={() => setActiveTab("tasks")} className="rounded-xl bg-white p-3 text-right text-sm text-navy shadow-soft">
                      <strong className="ml-1 text-danger">{data.summary.overdueTasks}</strong> مهام تجاوزت موعدها
                    </button>
                    <button onClick={() => setActiveTab("overtime")} className="rounded-xl bg-white p-3 text-right text-sm text-navy shadow-soft">
                      <strong className="ml-1 text-warning">{data.summary.pendingOvertime}</strong> طلبات ساعات معلقة
                    </button>
                    <button onClick={() => setActiveTab("attendance")} className="rounded-xl bg-white p-3 text-right text-sm text-navy shadow-soft">
                      <strong className="ml-1 text-danger">{data.summary.deductedChecks}</strong> فحوصات عليها خصم
                    </button>
                  </div>
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                <section className="card p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-navy">اتجاه ساعات العمل</h2>
                      <p className="mt-1 text-xs text-muted">إجمالي الساعات المسجلة يوميًا</p>
                    </div>
                    <BarChartIcon size={20} className="text-teal" />
                  </div>
                  {data.charts.trend.length ? (
                    <div className="flex h-52 items-end gap-2 overflow-x-auto border-b border-tint-200 pb-1">
                      {data.charts.trend.map((item) => (
                        <div key={item.date} className="group flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-2">
                          <span className="text-[10px] font-semibold text-teal opacity-0 transition-opacity group-hover:opacity-100">{item.hours.toFixed(1)}</span>
                          <div className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-teal to-teal-300 transition-all group-hover:from-teal-700" style={{ height: `${Math.max((item.hours / maxTrendHours) * 150, 5)}px` }} />
                          <span className="whitespace-nowrap text-[9px] text-muted">{new Date(`${item.date}T00:00:00`).toLocaleDateString("ar", { day: "numeric", month: "numeric" })}</span>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState text="لا توجد بيانات ضمن الفترة المحددة" />}
                </section>

                <section className="card p-5">
                  <h2 className="font-semibold text-navy">توزيع حالات المهام</h2>
                  <p className="mt-1 text-xs text-muted">{taskTotal} مهام ضمن النطاق</p>
                  <div className="mt-7 space-y-5">
                    {[
                      ["قيد التنفيذ", data.charts.taskStatus.IN_PROGRESS, "bg-warning"],
                      ["قيد المراجعة", data.charts.taskStatus.IN_REVIEW, "bg-teal"],
                      ["مكتملة", data.charts.taskStatus.COMPLETED, "bg-success"],
                    ].map(([label, count, color]) => {
                      const numericCount = Number(count);
                      const percentage = taskTotal ? Math.round((numericCount / taskTotal) * 100) : 0;
                      return (
                        <div key={String(label)}>
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="font-medium text-navy">{label}</span>
                            <span className="text-muted">{numericCount} · {percentage}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-tint">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === "attendance" && <AttendanceReport data={data} />}
          {activeTab === "tasks" && <TasksReport data={data} />}
          {activeTab === "projects" && <ProjectsReport data={data} />}
          {activeTab === "overtime" && <OvertimeReport data={data} />}
        </>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-tint"><FileTextIcon size={21} className="text-muted/50" /></div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function AttendanceReport({ data }: { data: ReportsData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="أيام الحضور المسجلة" value={String(data.summary.attendanceDays)} hint="إجمالي سجلات الموظفين" icon={CalendarIcon} />
        <MetricCard label="متوسط الساعات" value={data.summary.averageHours.toFixed(1)} hint="لكل سجل حضور" icon={ClockIcon} tone="navy" />
        <MetricCard label="الفحوصات المؤكدة" value={`${data.summary.confirmedRate}%`} hint="نسبة الالتزام" icon={CheckSquareIcon} tone="success" />
        <MetricCard label="الخصومات" value={String(data.summary.deductedChecks)} hint="فحوصات غير مؤكدة" icon={AlertCircleIcon} tone="danger" />
      </div>
      <ReportTable
        headers={["الموظف", "التاريخ", "الدخول", "الخروج", "الساعات", "التأخير", "الخروج المبكر", "الحالة"]}
        empty="لا توجد سجلات حضور ضمن هذه الفترة"
      >
        {data.attendance.map((item) => (
          <tr key={item.id} className="border-b border-tint-200/70 hover:bg-tint/20">
            <Cell strong>{item.user.name}</Cell><Cell>{formatDate(item.date)}</Cell><Cell>{formatTime(item.checkIn)}</Cell>
            <Cell>{item.checkOut ? formatTime(item.checkOut) : "—"}</Cell><Cell strong>{item.totalHours.toFixed(1)}</Cell>
            <Cell danger={item.lateMinutes > 0}>{item.lateMinutes ? `${item.lateMinutes} د` : "—"}</Cell><Cell danger={item.earlyLeaveMinutes > 0}>{item.earlyLeaveMinutes ? `${item.earlyLeaveMinutes} د` : "—"}</Cell>
            <Cell><span className={item.status === "EARLY_LEAVE" ? "badge-warning" : item.checkOut ? "badge-success" : "badge-warning"}>{item.status === "LATE" ? "متأخر" : item.status === "EARLY_LEAVE" ? "انصراف مبكر" : item.checkOut ? "مكتمل" : "نشط"}</span></Cell>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function TasksReport({ data }: { data: ReportsData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="إجمالي المهام" value={String(data.tasks.length)} hint="ضمن الفلاتر الحالية" icon={CheckSquareIcon} />
        <MetricCard label="المكتملة" value={String(data.summary.completedTasks)} hint={`${data.summary.completionRate}% معدل الإنجاز`} icon={TrendingUpIcon} tone="success" />
        <MetricCard label="قيد المراجعة" value={String(data.charts.taskStatus.IN_REVIEW)} hint="تنتظر إجراء المدير" icon={FileTextIcon} tone="warning" />
        <MetricCard label="المتأخرة" value={String(data.summary.overdueTasks)} hint="تجاوزت الموعد النهائي" icon={AlertCircleIcon} tone="danger" />
      </div>
      <ReportTable headers={["المهمة", "الموظف", "المشروع", "الحالة", "الأولوية", "الموعد", "وقت مسجل"]} empty="لا توجد مهام ضمن هذه الفترة">
        {data.tasks.map((item) => {
          const overdue = item.deadline && item.status !== "COMPLETED" && new Date(item.deadline) < new Date();
          return (
            <tr key={item.id} className="border-b border-tint-200/70 hover:bg-tint/20">
              <Cell strong>{item.title}</Cell><Cell>{item.assignee.name}</Cell><Cell>{item.project.name}</Cell>
              <Cell><span className={item.status === "COMPLETED" ? "badge-success" : item.status === "IN_REVIEW" ? "badge-info" : "badge-warning"}>{statusLabels[item.status]}</span></Cell>
              <Cell>{priorityLabels[item.priority]}</Cell><Cell danger={Boolean(overdue)}>{item.deadline ? formatDate(item.deadline) : "—"}</Cell>
              <Cell strong>{item.trackedHours.toFixed(1)} س</Cell>
            </tr>
          );
        })}
      </ReportTable>
    </div>
  );
}

function ProjectsReport({ data }: { data: ReportsData }) {
  return data.projects.length ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.projects.map((project) => (
        <div key={project.id} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-semibold text-navy">{project.name}</h3><p className="mt-1 text-xs text-muted">{project.totalTasks} مهام · {project.trackedHours.toFixed(1)} ساعة</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/10 text-navy"><FolderIcon size={20} /></div>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted">نسبة الإنجاز</span><strong className="text-teal">{project.progress}%</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-tint"><div className="h-full rounded-full bg-teal" style={{ width: `${project.progress}%` }} /></div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-tint/50 p-2"><strong className="block text-sm text-navy">{project.totalTasks}</strong><span className="text-[10px] text-muted">الكل</span></div>
            <div className="rounded-xl bg-success/5 p-2"><strong className="block text-sm text-success">{project.completedTasks}</strong><span className="text-[10px] text-muted">مكتملة</span></div>
            <div className="rounded-xl bg-danger/5 p-2"><strong className="block text-sm text-danger">{project.overdueTasks}</strong><span className="text-[10px] text-muted">متأخرة</span></div>
          </div>
          {project.deadline && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><CalendarIcon size={14} /> الموعد: {formatDate(project.deadline)}</p>}
        </div>
      ))}
    </div>
  ) : <div className="card"><EmptyState text="لا توجد مشاريع مطابقة للفلاتر" /></div>;
}

function OvertimeReport({ data }: { data: ReportsData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="إجمالي الطلبات" value={String(data.overtime.length)} hint="خلال الفترة المحددة" icon={ClockIcon} />
        <MetricCard label="الطلبات المعلقة" value={String(data.summary.pendingOvertime)} hint="تحتاج قرارًا" icon={AlertCircleIcon} tone="warning" />
        <MetricCard label="الساعات المعتمدة" value={data.summary.approvedOvertimeHours.toFixed(1)} hint="مجموع الطلبات المقبولة" icon={CheckSquareIcon} tone="success" />
        <MetricCard label="الموظفون" value={String(new Set(data.overtime.map((item) => item.user.id)).size)} hint="قدموا طلبات إضافية" icon={UsersIcon} tone="navy" />
      </div>
      <ReportTable headers={["الموظف", "الساعات", "الحالة", "السبب", "التاريخ"]} empty="لا توجد طلبات ساعات إضافية ضمن الفترة">
        {data.overtime.map((item) => (
          <tr key={item.id} className="border-b border-tint-200/70 hover:bg-tint/20">
            <Cell strong>{item.user.name}</Cell><Cell strong>{item.hours.toFixed(1)} س</Cell>
            <Cell><span className={item.status === "APPROVED" ? "badge-success" : item.status === "REJECTED" ? "badge-danger" : "badge-warning"}>{statusLabels[item.status]}</span></Cell>
            <Cell>{item.reason || "—"}</Cell><Cell>{formatDate(item.createdAt)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function ReportTable({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-tint-200 p-5"><FileTextIcon size={19} className="text-teal" /><h2 className="font-semibold text-navy">التفاصيل</h2></div>
      {hasRows ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-tint/30"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold text-muted">{header}</th>)}</tr></thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : <EmptyState text={empty} />}
    </div>
  );
}

function Cell({ children, strong = false, danger = false }: { children: React.ReactNode; strong?: boolean; danger?: boolean }) {
  return <td className={`whitespace-nowrap px-5 py-3 text-sm ${strong ? "font-semibold" : ""} ${danger ? "text-danger" : "text-navy"}`}>{children}</td>;
}
