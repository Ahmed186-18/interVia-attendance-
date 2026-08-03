"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { formatProjectLabel } from "@/lib/project-label";
import {
  ActivityIcon,
  AlertCircleIcon,
  CalendarIcon,
  CheckSquareIcon,
  ClockIcon,
  FolderIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TrendingUpIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";

type EmployeeStatus = "WORKING" | "CHECKED_OUT" | "ON_LEAVE" | "ABSENT" | "INACTIVE" | "NOT_REQUIRED";
type Workload = "LOW" | "BALANCED" | "HIGH";
type ProfileTab = "overview" | "attendance" | "tasks" | "projects" | "requests" | "activity";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  country: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  status: EmployeeStatus;
  workload: Workload;
  metrics: {
    activeTasks: number;
    overdueTasks: number;
    highPriorityTasks: number;
    completedTasks: number;
    projects: number;
    monthHours: number;
    trackedHours: number;
    pendingRequests: number;
  };
  todayAttendance: {
    id: string;
    checkIn: string;
    checkOut: string | null;
    totalHours: number;
    confirmedChecks: number;
    deductedChecks: number;
    totalChecks: number;
  } | null;
  attendance: {
    id: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    totalHours: number;
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
    trackedHours: number;
    project: { id: string; name: string; code?: string | null };
  }[];
  projects: {
    id: string;
    name: string;
    code?: string | null;
    deadline: string | null;
    joinedAt: string;
    membershipId: string;
    _count: { tasks: number };
  }[];
  leaveRequests: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    reason: string | null;
  }[];
  overtimeRequests: {
    id: string;
    workDate: string;
    hours: number;
    status: string;
    reason: string | null;
  }[];
  activity: {
    id: string;
    action: string;
    entityType: string;
    details: string | null;
    createdAt: string;
  }[];
}

interface Summary {
  total: number;
  inactive: number;
  working: number;
  onLeave: number;
  absent: number;
  overloaded: number;
  pendingRequests: number;
}

const statusConfig: Record<EmployeeStatus, { label: string; className: string; dot: string }> = {
  WORKING: { label: "يعمل الآن", className: "badge-success", dot: "bg-success" },
  CHECKED_OUT: { label: "أنهى دوامه", className: "badge-neutral", dot: "bg-muted" },
  ON_LEAVE: { label: "في إجازة", className: "badge-info", dot: "bg-teal" },
  ABSENT: { label: "غير مسجل اليوم", className: "badge-warning", dot: "bg-warning" },
  INACTIVE: { label: "حساب موقوف", className: "badge-danger", dot: "bg-danger" },
  NOT_REQUIRED: { label: "الحضور غير مطلوب", className: "badge-neutral", dot: "bg-navy" },
};

const workloadConfig: Record<Workload, { label: string; className: string }> = {
  LOW: { label: "حمل منخفض", className: "text-muted bg-muted/10" },
  BALANCED: { label: "حمل متوازن", className: "text-success bg-success/10" },
  HIGH: { label: "حمل مرتفع", className: "text-danger bg-danger/10" },
};

const requestStatus: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

const leaveTypes: Record<string, string> = {
  ANNUAL: "إجازة سنوية",
  SICK: "إجازة مرضية",
  UNPAID: "إجازة بدون راتب",
  EMERGENCY: "إجازة طارئة",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [workload, setWorkload] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [view, setView] = useState<"table" | "cards">("table");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [error, setError] = useState("");

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/employees");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الموظفين");
      setEmployees(data.employees || []);
      setSummary(data.summary);
      setSelected((current) => current ? (data.employees || []).find((item: Employee) => item.id === current.id) || null : null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isManager) fetchEmployees();
  }, [fetchEmployees, isManager]);

  const filtered = useMemo(
    () =>
      employees.filter((employee) => {
        const matchesQuery = `${employee.name} ${employee.email}`.toLowerCase().includes(query.toLowerCase());
        return (
          matchesQuery &&
          (status === "ALL" || employee.status === status) &&
          (workload === "ALL" || employee.workload === workload) &&
          (role === "ALL" || employee.role === role)
        );
      }),
    [employees, query, role, status, workload]
  );

  const setSummaryFilter = (filter: EmployeeStatus | "OVERLOADED" | "PENDING") => {
    if (filter === "OVERLOADED") {
      setStatus("ALL");
      setWorkload("HIGH");
    } else if (filter === "PENDING") {
      setStatus("ALL");
      setWorkload("ALL");
      setQuery("");
    } else {
      setWorkload("ALL");
      setStatus(filter);
    }
  };

  const deactivate = async (employee: Employee) => {
    if (!confirm(`إيقاف حساب "${employee.name}"؟ لن يتمكن من تسجيل الدخول، وستبقى بياناته محفوظة.`)) return;
    const response = await fetch(`/api/users?id=${employee.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "تعذر إيقاف الحساب");
      return;
    }
    setSelected(null);
    fetchEmployees();
  };

  const activate = async (employee: Employee) => {
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: employee.id, action: "ACTIVATE" }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "تعذر تفعيل الحساب");
      return;
    }
    setSelected(null);
    fetchEmployees();
  };

  const resetPassword = async (employee: Employee) => {
    if (!confirm(`إعادة تعيين كلمة مرور "${employee.name}"؟ ستتوقف كلمة المرور الحالية عن العمل فورًا.`)) return;
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: employee.id, action: "RESET_PASSWORD" }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || "تعذر إعادة تعيين كلمة المرور");
      return;
    }
    setResetInfo({
      name: data.user.name,
      email: data.user.email,
      password: data.tempPassword,
    });
  };

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-danger/10"><UsersIcon size={32} className="text-danger" /></div>
        <h1 className="text-xl font-bold text-navy">غير مصرح</h1>
        <p className="mt-2 text-muted">هذه الصفحة للمديرين فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">مركز إدارة الفريق</h1>
          <p className="page-subtitle">الحضور والمهام والمشاريع وطلبات الموظفين في مكان واحد</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2"><PlusIcon size={18} /> موظف جديد</button>
      </div>

      {error && <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div>}

      {loading || !summary ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{[1, 2, 3, 4, 5, 6, 7].map((item) => <div key={item} className="skeleton-card h-24" />)}</div>
          <div className="skeleton-card h-80" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <SummaryCard label="إجمالي الفريق" value={summary.total} color="text-navy" onClick={() => { setStatus("ALL"); setWorkload("ALL"); }} />
            <SummaryCard label="يعملون الآن" value={summary.working} color="text-success" onClick={() => setSummaryFilter("WORKING")} />
            <SummaryCard label="في إجازة" value={summary.onLeave} color="text-teal" onClick={() => setSummaryFilter("ON_LEAVE")} />
            <SummaryCard label="غير مسجلين" value={summary.absent} color="text-warning" onClick={() => setSummaryFilter("ABSENT")} />
            <SummaryCard label="حمل مرتفع" value={summary.overloaded} color="text-danger" onClick={() => setSummaryFilter("OVERLOADED")} />
            <SummaryCard label="طلبات معلقة" value={summary.pendingRequests} color="text-warning" onClick={() => setSummaryFilter("PENDING")} />
            <SummaryCard label="حسابات موقوفة" value={summary.inactive} color="text-danger" onClick={() => setSummaryFilter("INACTIVE")} />
          </div>

          <section className="card p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <SearchIcon size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="input-field py-2.5 pr-10 text-sm" placeholder="ابحث بالاسم أو البريد..." />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex">
                <FilterSelect value={status} onChange={setStatus} options={[["ALL", "كل حالات اليوم"], ["WORKING", "يعمل الآن"], ["CHECKED_OUT", "أنهى دوامه"], ["ON_LEAVE", "في إجازة"], ["ABSENT", "غير مسجل"], ["NOT_REQUIRED", "الحضور غير مطلوب"], ["INACTIVE", "حساب موقوف"]]} />
                <FilterSelect value={workload} onChange={setWorkload} options={[["ALL", "كل الأحمال"], ["LOW", "منخفض"], ["BALANCED", "متوازن"], ["HIGH", "مرتفع"]]} />
                <FilterSelect value={role} onChange={setRole} options={[["ALL", "كل الأدوار"], ["EMPLOYEE", "موظف"], ["MANAGER", "مدير"], ["ADMIN", "مدير النظام"]]} />
              </div>
              <div className="flex rounded-xl bg-tint/70 p-1">
                <button aria-label="عرض جدول" onClick={() => setView("table")} className={`rounded-lg p-2 ${view === "table" ? "bg-white text-teal shadow-soft" : "text-muted"}`}><ListIcon size={17} /></button>
                <button aria-label="عرض بطاقات" onClick={() => setView("cards")} className={`rounded-lg p-2 ${view === "cards" ? "bg-white text-teal shadow-soft" : "text-muted"}`}><UsersIcon size={17} /></button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">عرض {filtered.length} من {employees.length} موظفين</p>
          </section>

          {filtered.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <UsersIcon size={28} className="mb-3 text-muted/40" />
              <p className="font-medium text-navy">لا توجد نتائج مطابقة</p>
              <button onClick={() => { setQuery(""); setStatus("ALL"); setWorkload("ALL"); setRole("ALL"); }} className="mt-3 text-sm font-medium text-teal">مسح الفلاتر</button>
            </div>
          ) : view === "table" ? (
            <EmployeeTable employees={filtered} onSelect={setSelected} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((employee) => <EmployeeCard key={employee.id} employee={employee} onSelect={() => setSelected(employee)} />)}
            </div>
          )}
        </>
      )}

      {selected && <EmployeeProfile employee={selected} onClose={() => setSelected(null)} onDeactivate={() => deactivate(selected)} onActivate={() => activate(selected)} canResetPassword={user?.role === "ADMIN"} onResetPassword={() => resetPassword(selected)} />}
      {showAdd && <AddEmployeeModal isAdmin={user?.role === "ADMIN"} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); fetchEmployees(); }} />}
      {resetInfo && <PasswordResultModal info={resetInfo} onClose={() => setResetInfo(null)} />}
    </div>
  );
}

function SummaryCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return <button onClick={onClick} className="card p-4 text-right hover:border-teal/20 hover:shadow-soft-md"><p className="text-[11px] font-medium text-muted">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></button>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="input-field min-w-0 py-2 text-xs sm:w-40">{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}

function EmployeeTable({ employees, onSelect }: { employees: Employee[]; onSelect: (employee: Employee) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px]">
          <thead className="bg-tint/30"><tr>{["الموظف", "حالة اليوم", "المشاريع", "المهام النشطة", "ساعات الشهر", "عبء العمل", "طلبات", ""].map((header) => <th key={header} className="px-4 py-3 text-right text-xs font-semibold text-muted">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-tint-200">
            {employees.map((employee) => (
              <tr key={employee.id} onClick={() => onSelect(employee)} className="cursor-pointer hover:bg-tint/25">
                <td className="px-4 py-3"><EmployeeIdentity employee={employee} /></td>
                <td className="px-4 py-3"><StatusBadge status={employee.status} /></td>
                <td className="px-4 py-3 text-sm font-semibold text-navy">{employee.metrics.projects}</td>
                <td className="px-4 py-3"><span className="text-sm font-semibold text-navy">{employee.metrics.activeTasks}</span>{employee.metrics.overdueTasks > 0 && <span className="mr-2 text-[10px] text-danger">{employee.metrics.overdueTasks} متأخرة</span>}</td>
                <td className="px-4 py-3 text-sm font-semibold text-navy">{employee.role === "ADMIN" ? "—" : employee.metrics.monthHours.toFixed(1)}</td>
                <td className="px-4 py-3"><WorkloadBadge workload={employee.workload} /></td>
                <td className="px-4 py-3 text-sm font-semibold text-warning">{employee.metrics.pendingRequests || "—"}</td>
                <td className="px-4 py-3 text-left text-xs font-medium text-teal">عرض الملف</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeCard({ employee, onSelect }: { employee: Employee; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="card p-5 text-right hover:border-teal/20 hover:shadow-soft-md">
      <div className="flex items-start justify-between gap-3"><EmployeeIdentity employee={employee} /><StatusBadge status={employee.status} /></div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <SmallMetric value={employee.metrics.activeTasks} label="مهام نشطة" />
        <SmallMetric value={employee.metrics.projects} label="مشاريع" />
        <SmallMetric value={employee.role === "ADMIN" ? "—" : employee.metrics.monthHours.toFixed(0)} label="ساعة" />
      </div>
      <div className="mt-4 flex items-center justify-between"><WorkloadBadge workload={employee.workload} />{employee.metrics.overdueTasks > 0 && <span className="text-xs font-medium text-danger">{employee.metrics.overdueTasks} مهام متأخرة</span>}</div>
    </button>
  );
}

function EmployeeIdentity({ employee }: { employee: Employee }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal/15 to-teal/5 text-sm font-bold text-teal">{employee.name.charAt(0)}</div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-navy">{employee.name}</p><p className="truncate text-[10px] text-muted" dir="ltr">{employee.email}</p></div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const config = statusConfig[status];
  return <span className={config.className}><span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${config.dot}`} />{config.label}</span>;
}

function WorkloadBadge({ workload }: { workload: Workload }) {
  const config = workloadConfig[workload];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${config.className}`}>{config.label}</span>;
}

function SmallMetric({ value, label }: { value: string | number; label: string }) {
  return <div className="rounded-xl bg-tint/45 p-2.5"><strong className="block text-sm text-navy">{value}</strong><span className="text-[9px] text-muted">{label}</span></div>;
}

function EmployeeProfile({ employee, onClose, onDeactivate, onActivate, canResetPassword, onResetPassword }: { employee: Employee; onClose: () => void; onDeactivate: () => void; onActivate: () => void; canResetPassword: boolean; onResetPassword: () => void }) {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "overview", label: "نظرة عامة" }, { id: "attendance", label: "الحضور" }, { id: "tasks", label: "المهام" },
    { id: "projects", label: "المشاريع" }, { id: "requests", label: "الطلبات" }, { id: "activity", label: "النشاط" },
  ];
  return (
    <>
      <button aria-label="إغلاق ملف الموظف" onClick={onClose} className="fixed inset-0 z-50 bg-navy/30 backdrop-blur-sm" />
      <aside className="fixed inset-y-0 left-0 z-[60] flex w-full max-w-2xl flex-col bg-surface shadow-soft-lg animate-slide-in-right">
        <div className="border-b border-tint-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-teal/10 text-xl font-bold text-teal">{employee.name.charAt(0)}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-navy">{employee.name}</h2><StatusBadge status={employee.status} /></div><p className="mt-1 text-xs text-muted" dir="ltr">{employee.email}</p><p className="mt-1 text-xs text-muted">{employee.country} · {employee.role === "ADMIN" ? "مدير النظام" : employee.role === "MANAGER" ? "مدير" : "موظف"}</p></div>
            <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={20} /></button>
          </div>
          <div className="mt-5 flex gap-1 overflow-x-auto">
            {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${tab === item.id ? "bg-teal text-white" : "text-muted hover:bg-tint hover:text-navy"}`}>{item.label}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === "overview" && <OverviewTab employee={employee} />}
          {tab === "attendance" && <AttendanceTab employee={employee} />}
          {tab === "tasks" && <TasksTab employee={employee} />}
          {tab === "projects" && <ProjectsTab employee={employee} />}
          {tab === "requests" && <RequestsTab employee={employee} />}
          {tab === "activity" && <ActivityTab employee={employee} />}
        </div>
        {employee.role !== "ADMIN" && (
          <div className="flex flex-wrap gap-2 border-t border-tint-200 bg-white p-4">
            {canResetPassword && (
              <button onClick={onResetPassword} className="rounded-xl bg-navy/5 px-4 py-2 text-sm font-medium text-navy hover:bg-navy/10">إعادة تعيين كلمة المرور</button>
            )}
            {employee.isActive ? (
              <button onClick={onDeactivate} className="rounded-xl px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5">إيقاف حساب الموظف</button>
            ) : (
              <button onClick={onActivate} className="rounded-xl bg-success/10 px-4 py-2 text-sm font-medium text-success hover:bg-success/15">إعادة تفعيل الحساب</button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function OverviewTab({ employee }: { employee: Employee }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ProfileMetric icon={CheckSquareIcon} value={employee.metrics.activeTasks} label="مهام نشطة" />
        <ProfileMetric icon={FolderIcon} value={employee.metrics.projects} label="مشاريع" />
        <ProfileMetric icon={ClockIcon} value={employee.role === "ADMIN" ? "—" : employee.metrics.monthHours.toFixed(1)} label="ساعات الشهر" />
        <ProfileMetric icon={TrendingUpIcon} value={employee.metrics.completedTasks} label="مهام مكتملة" />
      </div>
      <section className="card p-5"><h3 className="font-semibold text-navy">حالة اليوم</h3>{employee.role === "ADMIN" ? <Empty text="الحضور غير مطلوب لحساب مدير النظام" /> : employee.todayAttendance ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Info label="الدخول" value={formatTime(employee.todayAttendance.checkIn)} /><Info label="الخروج" value={employee.todayAttendance.checkOut ? formatTime(employee.todayAttendance.checkOut) : "يعمل الآن"} /><Info label="الفحوصات" value={`${employee.todayAttendance.confirmedChecks}/${employee.todayAttendance.totalChecks}`} /><Info label="الخصومات" value={String(employee.todayAttendance.deductedChecks)} danger={employee.todayAttendance.deductedChecks > 0} /></div> : <Empty text="لا يوجد تسجيل حضور اليوم" />}</section>
      <section className="card p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="font-semibold text-navy">عبء العمل</h3><WorkloadBadge workload={employee.workload} /></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Info label="مهام نشطة" value={String(employee.metrics.activeTasks)} /><Info label="متأخرة" value={String(employee.metrics.overdueTasks)} danger={employee.metrics.overdueTasks > 0} /><Info label="وقت المهام" value={`${employee.metrics.trackedHours.toFixed(1)} س`} /></div></section>
    </div>
  );
}

function AttendanceTab({ employee }: { employee: Employee }) {
  if (employee.role === "ADMIN") {
    return <section className="card p-5"><Empty text="سجلات الحضور غير مطلوبة لحساب مدير النظام" /></section>;
  }
  return <SectionList title="سجل الحضور هذا الشهر" icon={CalendarIcon} empty="لا توجد سجلات حضور">{employee.attendance.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-tint-200 py-3"><div><p className="text-sm font-medium text-navy">{formatDate(item.date)}</p><p className="mt-1 text-xs text-muted">{formatTime(item.checkIn)} — {item.checkOut ? formatTime(item.checkOut) : "لم يسجل خروجًا"}</p></div><div className="text-left"><p className="text-sm font-semibold text-teal">{item.totalHours.toFixed(1)} س</p>{item.deductedChecks > 0 && <p className="text-[10px] text-danger">{item.deductedChecks} خصم</p>}</div></div>)}</SectionList>;
}

function TasksTab({ employee }: { employee: Employee }) {
  return <SectionList title="المهام المسندة" icon={CheckSquareIcon} empty="لا توجد مهام مسندة">{employee.tasks.map((task) => { const overdue = task.deadline && task.status !== "COMPLETED" && new Date(task.deadline) < new Date(); return <div key={task.id} className="border-b border-tint-200 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-navy">{task.title}</p><p className="mt-1 truncate text-xs text-muted" title={task.project.name}>{formatProjectLabel(task.project, 28)}{task.deadline && ` · ${formatDate(task.deadline)}`}</p></div><span className={task.status === "COMPLETED" ? "badge-success" : task.status === "IN_REVIEW" ? "badge-info" : overdue ? "badge-danger" : "badge-warning"}>{overdue ? "متأخرة" : task.status === "COMPLETED" ? "مكتملة" : task.status === "IN_REVIEW" ? "مراجعة" : "تنفيذ"}</span></div></div>; })}</SectionList>;
}

function ProjectsTab({ employee }: { employee: Employee }) {
  return <div className="grid gap-3 sm:grid-cols-2">{employee.projects.length ? employee.projects.map((project) => <div key={project.id} className="card p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10"><FolderIcon size={19} className="text-teal" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-navy" title={project.name}>{formatProjectLabel(project, 30)}</p><p className="mt-1 text-[10px] text-muted">{project._count.tasks} مهام · انضم {formatDate(project.joinedAt)}</p></div></div></div>) : <Empty text="ليس عضوًا في أي مشروع نشط" />}</div>;
}

function RequestsTab({ employee }: { employee: Employee }) {
  const requests = [
    ...employee.leaveRequests.map((request) => ({ id: request.id, title: leaveTypes[request.type] || request.type, detail: `${request.days} أيام · ${formatDate(request.startDate)}`, status: request.status, date: request.startDate })),
    ...employee.overtimeRequests.map((request) => ({ id: request.id, title: "ساعات إضافية", detail: `${request.hours} ساعات · ${formatDate(request.workDate)}`, status: request.status, date: request.workDate })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return <SectionList title="الإجازات والساعات الإضافية" icon={FileIcon} empty="لا توجد طلبات">{requests.map((request) => <div key={request.id} className="flex items-center justify-between border-b border-tint-200 py-3"><div><p className="text-sm font-medium text-navy">{request.title}</p><p className="mt-1 text-xs text-muted">{request.detail}</p></div><span className={request.status === "APPROVED" ? "badge-success" : request.status === "REJECTED" ? "badge-danger" : "badge-warning"}>{requestStatus[request.status]}</span></div>)}</SectionList>;
}

const FileIcon = AlertCircleIcon;

function ActivityTab({ employee }: { employee: Employee }) {
  return <SectionList title="آخر النشاطات" icon={ActivityIcon} empty="لا يوجد نشاط مسجل">{employee.activity.map((item) => <div key={item.id} className="flex gap-3 border-b border-tint-200 py-3"><div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal/10"><ActivityIcon size={14} className="text-teal" /></div><div><p className="text-sm text-navy">{item.details || `${item.action} · ${item.entityType}`}</p><p className="mt-1 text-[10px] text-muted">{new Date(item.createdAt).toLocaleString("ar")}</p></div></div>)}</SectionList>;
}

function ProfileMetric({ icon: Icon, value, label }: { icon: typeof ClockIcon; value: string | number; label: string }) {
  return <div className="card p-4"><Icon size={18} className="mb-3 text-teal" /><p className="text-xl font-bold text-navy">{value}</p><p className="mt-1 text-[10px] text-muted">{label}</p></div>;
}

function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-xl bg-tint/45 p-3"><p className="text-[10px] text-muted">{label}</p><p className={`mt-1 text-sm font-semibold ${danger ? "text-danger" : "text-navy"}`}>{value}</p></div>;
}

function SectionList({ title, icon: Icon, empty, children }: { title: string; icon: typeof ClockIcon; empty: string; children: React.ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="card p-5"><div className="mb-3 flex items-center gap-2"><Icon size={18} className="text-teal" /><h3 className="font-semibold text-navy">{title}</h3></div>{hasItems ? children : <Empty text={empty} />}</section>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted">{text}</div>;
}

function AddEmployeeModal({ isAdmin, onClose, onCreated }: { isAdmin: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", username: "", country: "فلسطين", role: "EMPLOYEE" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const timezones: Record<string, string> = { "فلسطين": "Asia/Gaza", "قطر": "Asia/Qatar", "مصر": "Africa/Cairo", "السعودية": "Asia/Riyadh", "الإمارات": "Asia/Dubai", "بريطانيا": "Europe/London", "أمريكا": "America/New_York" };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, timezone: timezones[form.country] }) });
    const data = await response.json(); setSaving(false);
    if (!response.ok) { setError(data.error || "تعذر إنشاء الموظف"); return; }
    setCreated({ name: data.user.name, email: data.user.email, password: data.tempPassword });
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/35 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-navy">إضافة موظف</h2><p className="mt-1 text-xs text-muted">إنشاء حساب جديد للفريق</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button></div>
        {created ? <div className="space-y-4"><div className="rounded-xl border border-success/20 bg-success/5 p-4"><p className="font-semibold text-success">تم إنشاء الحساب بنجاح</p><div className="mt-4 space-y-2 text-sm"><InfoRow label="الاسم" value={created.name} /><InfoRow label="البريد" value={created.email} /><InfoRow label="كلمة المرور المؤقتة" value={created.password} /></div></div><button onClick={onCreated} className="btn-primary w-full">تم</button></div> : <form onSubmit={submit} className="space-y-4">
          <label className="label">الاسم الكامل<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-field mt-1.5" /></label>
          <label className="label">اسم المستخدم<input required dir="ltr" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") })} className="input-field mt-1.5" placeholder="username" /><span className="mt-1 block text-[10px] text-muted">{form.username || "username"}@intervia.com</span></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="label">الدولة<select value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} className="input-field mt-1.5">{Object.keys(timezones).map((country) => <option key={country}>{country}</option>)}</select></label><label className="label">الدور<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="input-field mt-1.5"><option value="EMPLOYEE">موظف</option>{isAdmin && <option value="MANAGER">مدير</option>}</select></label></div>
          {error && <div className="rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</div>}
          <div className="flex gap-3 pt-2"><button disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جاري الإنشاء..." : "إنشاء الحساب"}</button><button type="button" onClick={onClose} className="btn-secondary">إلغاء</button></div>
        </form>}
      </div>
    </div>
  );
}

function PasswordResultModal({ info, onClose }: { info: { name: string; email: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`البريد: ${info.email}\nكلمة المرور المؤقتة: ${info.password}`);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/40 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold text-navy">كلمة المرور المؤقتة</h2><p className="mt-1 text-xs text-muted">ستظهر هذه البيانات الآن فقط</p></div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button>
        </div>
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
          تم إلغاء كلمة المرور السابقة. انسخ البيانات وشاركها مع {info.name} عبر وسيلة آمنة.
        </div>
        <div className="mt-4 space-y-3 rounded-xl bg-tint/50 p-4">
          <InfoRow label="البريد" value={info.email} />
          <InfoRow label="كلمة المرور" value={info.password} />
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={copy} className="btn-primary flex-1">{copied ? "تم النسخ" : "نسخ بيانات الدخول"}</button>
          <button onClick={onClose} className="btn-secondary">إغلاق</button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted">{label}</span><strong className="text-navy" dir="ltr">{value}</strong></div>;
}
