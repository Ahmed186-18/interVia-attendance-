"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";

type RequestType = "overtime" | "leave";
type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

interface OvertimeRequest {
  id: string;
  hours: number;
  workDate: string;
  reason: string | null;
  status: string;
  managerNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  managerNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface AttendanceAdjustmentRequest {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedBy: { id: string; name: string; email: string };
  attendance: { date: string; checkIn: string; checkOut: string | null };
}

const statusLabels: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

const leaveTypeLabels: Record<string, string> = {
  ANNUAL: "إجازة سنوية",
  SICK: "إجازة مرضية",
  UNPAID: "إجازة بدون راتب",
  EMERGENCY: "إجازة طارئة",
};

function inputDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" });
}

export default function RequestsPage() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [activeType, setActiveType] = useState<RequestType>("overtime");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [overtime, setOvertime] = useState<OvertimeRequest[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [attendanceAdjustments, setAttendanceAdjustments] = useState<AttendanceAdjustmentRequest[]>([]);
  const [overtimeMaxHours, setOvertimeMaxHours] = useState(12);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; type: RequestType; name: string } | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [overtimeResponse, leaveResponse, adjustmentResponse] = await Promise.all([
        fetch("/api/overtime"),
        fetch("/api/leave"),
        fetch("/api/attendance/adjustments"),
      ]);
      const overtimeData = await overtimeResponse.json();
      const leaveData = await leaveResponse.json();
      const adjustmentData = await adjustmentResponse.json();
      if (!overtimeResponse.ok || !leaveResponse.ok) throw new Error("تعذر تحميل الطلبات");
      setOvertime(overtimeData.requests || []);
      setOvertimeMaxHours(overtimeData.maxHours || 12);
      setLeave(leaveData.requests || []);
      setAttendanceAdjustments(adjustmentData.requests || []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "حدث خطأ" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    if (type === "overtime" || type === "leave") setActiveType(type);
    if (params.get("new") === "true") setShowCreate(true);
    setStatusFilter("ALL");
  }, []);

  const currentRequests = useMemo(() => {
    const requests = activeType === "overtime" ? overtime : leave;
    return statusFilter === "ALL" ? requests : requests.filter((request) => request.status === statusFilter);
  }, [activeType, leave, overtime, statusFilter]);

  const allRequests = [...overtime, ...leave];
  const counts = {
    pending: allRequests.filter((request) => request.status === "PENDING").length,
    approved: allRequests.filter((request) => request.status === "APPROVED").length,
    rejected: allRequests.filter((request) => request.status === "REJECTED").length,
  };

  const cancelRequest = async (id: string) => {
    if (!window.confirm("هل تريد إلغاء هذا الطلب المعلّق؟")) return;
    const endpoint = activeType === "overtime" ? "/api/overtime" : "/api/leave";
    const response = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ type: "error", text: result.error || "تعذر إلغاء الطلب" });
      return;
    }
    setMessage({ type: "success", text: "تم إلغاء الطلب" });
    fetchRequests();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">{isManager ? "طلبات الفريق" : "طلباتي"}</h1>
          <p className="page-subtitle">
            {isManager ? "مراجعة الساعات الإضافية والإجازات واتخاذ القرار" : "قدّم طلبًا جديدًا وتابع حالة طلباتك"}
          </p>
        </div>
        {!isManager && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <PlusIcon size={18} /> طلب جديد
          </button>
        )}
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          message.type === "success" ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"
        }`}>
          {message.type === "success" ? <CheckIcon size={17} /> : <AlertCircleIcon size={17} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="mr-auto"><XIcon size={16} /></button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <button onClick={() => setStatusFilter("PENDING")} className={`card p-3 text-right sm:p-4 ${statusFilter === "PENDING" ? "ring-2 ring-warning/20" : ""}`}>
          <p className="text-[10px] text-muted sm:text-xs">قيد المراجعة</p><p className="mt-1 text-xl font-bold text-warning sm:text-2xl">{counts.pending}</p>
        </button>
        <button onClick={() => setStatusFilter("APPROVED")} className={`card p-3 text-right sm:p-4 ${statusFilter === "APPROVED" ? "ring-2 ring-success/20" : ""}`}>
          <p className="text-[10px] text-muted sm:text-xs">مقبولة</p><p className="mt-1 text-xl font-bold text-success sm:text-2xl">{counts.approved}</p>
        </button>
        <button onClick={() => setStatusFilter("REJECTED")} className={`card p-3 text-right sm:p-4 ${statusFilter === "REJECTED" ? "ring-2 ring-danger/20" : ""}`}>
          <p className="text-[10px] text-muted sm:text-xs">مرفوضة</p><p className="mt-1 text-xl font-bold text-danger sm:text-2xl">{counts.rejected}</p>
        </button>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b border-tint-200 sm:flex-row sm:items-end">
        <div className="flex gap-1">
          <TypeTab active={activeType === "overtime"} onClick={() => setActiveType("overtime")} icon={ClockIcon} label="الساعات الإضافية" count={overtime.length} />
          <TypeTab active={activeType === "leave"} onClick={() => setActiveType("leave")} icon={CalendarIcon} label="الإجازات" count={leave.length} />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="input-field mb-2 w-full py-2 text-sm sm:w-40">
          <option value="ALL">كل الحالات</option>
          <option value="PENDING">قيد المراجعة</option>
          <option value="APPROVED">مقبولة</option>
          <option value="REJECTED">مرفوضة</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="skeleton-card h-28" />)}</div>
      ) : currentRequests.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tint">
            {activeType === "overtime" ? <ClockIcon size={24} className="text-muted/50" /> : <CalendarIcon size={24} className="text-muted/50" />}
          </div>
          <p className="font-medium text-navy">لا توجد طلبات</p>
          <p className="mt-1 text-xs text-muted">لا توجد نتائج مطابقة للحالة المختارة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeType === "overtime"
            ? (currentRequests as OvertimeRequest[]).map((request) => (
                <RequestCard
                  key={request.id}
                  title={`${request.hours} ساعات إضافية`}
                  subtitle={`تاريخ العمل: ${formatDate(request.workDate)}`}
                  request={request}
                  isManager={isManager}
                  onReview={() => setReviewTarget({ id: request.id, type: "overtime", name: request.user.name })}
                  onCancel={() => cancelRequest(request.id)}
                />
              ))
            : (currentRequests as LeaveRequest[]).map((request) => (
                <RequestCard
                  key={request.id}
                  title={leaveTypeLabels[request.type] || request.type}
                  subtitle={`${formatDate(request.startDate)} — ${formatDate(request.endDate)} · ${request.days} أيام عمل`}
                  request={request}
                  isManager={isManager}
                  onReview={() => setReviewTarget({ id: request.id, type: "leave", name: request.user.name })}
                  onCancel={() => cancelRequest(request.id)}
                />
              ))}
        </div>
      )}

      {isManager && (
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="section-title text-base">طلبات تعديل الحضور</h2><span className="badge-warning">{attendanceAdjustments.filter((item) => item.status === "PENDING").length} معلقة</span></div>
          {attendanceAdjustments.filter((item) => statusFilter === "ALL" || item.status === statusFilter).length === 0 ? (
            <div className="card p-5 text-center text-sm text-muted">لا توجد طلبات تعديل حضور</div>
          ) : attendanceAdjustments.filter((item) => statusFilter === "ALL" || item.status === statusFilter).map((item) => (
            <div key={item.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold text-navy">{item.requestedBy.name} · {formatDate(item.attendance.date)}</p><p className="mt-1 text-xs text-muted">{item.reason}</p><p className="mt-1 text-xs text-teal">{item.requestedCheckIn && `دخول: ${new Date(item.requestedCheckIn).toLocaleString("ar")}`} {item.requestedCheckOut && ` · خروج: ${new Date(item.requestedCheckOut).toLocaleString("ar")}`}</p></div>
              {item.status === "PENDING" && <div className="flex gap-2"><button onClick={async () => { const response = await fetch("/api/attendance/adjustments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: "APPROVED" }) }); if (response.ok) fetchRequests(); }} className="btn-primary px-3 py-2 text-xs">موافقة</button><button onClick={async () => { const response = await fetch("/api/attendance/adjustments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: "REJECTED" }) }); if (response.ok) fetchRequests(); }} className="rounded-xl border border-danger/20 px-3 py-2 text-xs text-danger">رفض</button></div>}
            </div>
          ))}
        </section>
      )}

      {showCreate && (
        <CreateRequestModal
          initialType={activeType}
          overtimeMaxHours={overtimeMaxHours}
          onClose={() => setShowCreate(false)}
          onCreated={(text) => {
            setShowCreate(false);
            setMessage({ type: "success", text });
            fetchRequests();
          }}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          target={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onReviewed={(text) => {
            setReviewTarget(null);
            setMessage({ type: "success", text });
            fetchRequests();
          }}
        />
      )}
    </div>
  );
}

function TypeTab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof ClockIcon; label: string; count: number }) {
  return (
    <button onClick={onClick} className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium ${active ? "text-teal" : "text-muted hover:text-navy"}`}>
      <Icon size={17} /> {label}<span className="rounded-full bg-tint px-2 py-0.5 text-[10px]">{count}</span>
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal" />}
    </button>
  );
}

function RequestCard({
  title,
  subtitle,
  request,
  isManager,
  onReview,
  onCancel,
}: {
  title: string;
  subtitle: string;
  request: OvertimeRequest | LeaveRequest;
  isManager: boolean;
  onReview: () => void;
  onCancel: () => void;
}) {
  const badge = request.status === "APPROVED" ? "badge-success" : request.status === "REJECTED" ? "badge-danger" : "badge-warning";
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
            request.status === "APPROVED" ? "bg-success/10 text-success" : request.status === "REJECTED" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          }`}>
            {"hours" in request ? <ClockIcon size={21} /> : <CalendarIcon size={21} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-navy">{title}</h3><span className={badge}>{statusLabels[request.status]}</span>
            </div>
            {isManager && <p className="mt-1 text-sm font-medium text-teal">{request.user.name}</p>}
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
            {request.reason && <p className="mt-2 text-sm text-navy-400">{request.reason}</p>}
            {request.managerNote && <p className="mt-2 rounded-lg bg-tint/60 px-3 py-2 text-xs text-navy"><strong>ملاحظة المدير:</strong> {request.managerNote}</p>}
          </div>
        </div>
        {request.status === "PENDING" && (
          isManager ? (
            <button onClick={onReview} className="btn-primary flex items-center justify-center gap-2 py-2 text-sm"><FileTextIcon size={16} /> مراجعة الطلب</button>
          ) : (
            <button onClick={onCancel} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-danger hover:bg-danger/5"><TrashIcon size={16} /> إلغاء الطلب</button>
          )
        )}
      </div>
    </div>
  );
}

function CreateRequestModal({ initialType, overtimeMaxHours, onClose, onCreated }: { initialType: RequestType; overtimeMaxHours: number; onClose: () => void; onCreated: (text: string) => void }) {
  const [type, setType] = useState<RequestType>(initialType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [overtime, setOvertime] = useState({ hours: "", workDate: inputDate(), reason: "" });
  const [leave, setLeave] = useState({ type: "ANNUAL", startDate: inputDate(), endDate: inputDate(), reason: "" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const endpoint = type === "overtime" ? "/api/overtime" : "/api/leave";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type === "overtime" ? overtime : leave),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || "تعذر إرسال الطلب");
      return;
    }
    onCreated(type === "overtime" ? "تم إرسال طلب الساعات الإضافية" : "تم إرسال طلب الإجازة");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/35 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-navy">طلب جديد</h2><p className="mt-1 text-xs text-muted">سيتم إرسال الطلب إلى الإدارة للمراجعة</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button></div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-tint/60 p-1">
          <button onClick={() => setType("overtime")} className={`rounded-lg px-3 py-2 text-sm font-medium ${type === "overtime" ? "bg-white text-teal shadow-soft" : "text-muted"}`}>ساعات إضافية</button>
          <button onClick={() => setType("leave")} className={`rounded-lg px-3 py-2 text-sm font-medium ${type === "leave" ? "bg-white text-teal shadow-soft" : "text-muted"}`}>إجازة</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {type === "overtime" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">عدد الساعات<input type="number" min="0.5" max={overtimeMaxHours} step="0.5" required value={overtime.hours} onChange={(event) => setOvertime({ ...overtime, hours: event.target.value })} className="input-field mt-1.5" /></label>
                <label className="label">تاريخ العمل<input type="date" required value={overtime.workDate} onChange={(event) => setOvertime({ ...overtime, workDate: event.target.value })} className="input-field mt-1.5" /></label>
              </div>
              <label className="label">سبب العمل الإضافي<textarea required minLength={5} rows={3} value={overtime.reason} onChange={(event) => setOvertime({ ...overtime, reason: event.target.value })} className="input-field mt-1.5 resize-none" placeholder="اشرح العمل الذي استدعى ساعات إضافية..." /></label>
            </>
          ) : (
            <>
              <label className="label">نوع الإجازة<select value={leave.type} onChange={(event) => setLeave({ ...leave, type: event.target.value })} className="input-field mt-1.5"><option value="ANNUAL">سنوية</option><option value="SICK">مرضية</option><option value="UNPAID">بدون راتب</option><option value="EMERGENCY">طارئة</option></select></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">من تاريخ<input type="date" required value={leave.startDate} onChange={(event) => setLeave({ ...leave, startDate: event.target.value, endDate: event.target.value > leave.endDate ? event.target.value : leave.endDate })} className="input-field mt-1.5" /></label>
                <label className="label">إلى تاريخ<input type="date" required min={leave.startDate} value={leave.endDate} onChange={(event) => setLeave({ ...leave, endDate: event.target.value })} className="input-field mt-1.5" /></label>
              </div>
              <label className="label">سبب الإجازة<textarea required minLength={5} rows={3} value={leave.reason} onChange={(event) => setLeave({ ...leave, reason: event.target.value })} className="input-field mt-1.5 resize-none" placeholder="أضف تفاصيل تساعد الإدارة على مراجعة الطلب..." /></label>
            </>
          )}
          {error && <div className="rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</div>}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row"><button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جاري الإرسال..." : "إرسال الطلب"}</button><button type="button" onClick={onClose} className="btn-secondary">إلغاء</button></div>
        </form>
      </div>
    </div>
  );
}

function ReviewModal({ target, onClose, onReviewed }: { target: { id: string; type: RequestType; name: string }; onClose: () => void; onReviewed: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const review = async (status: "APPROVED" | "REJECTED") => {
    setSaving(true);
    setError("");
    const response = await fetch(target.type === "overtime" ? "/api/overtime" : "/api/leave", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, status, managerNote: note }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || "تعذر تحديث الطلب");
      return;
    }
    onReviewed(status === "APPROVED" ? "تمت الموافقة على الطلب" : "تم رفض الطلب");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/35 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-navy">مراجعة طلب {target.name}</h2><p className="mt-1 text-xs text-muted">القرار سيظهر للموظف مباشرة</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button></div>
        <label className="label">ملاحظة للموظف (اختياري)<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} className="input-field mt-1.5 resize-none" placeholder="أضف سبب القرار أو أي توجيهات..." /></label>
        {error && <div className="mt-3 rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</div>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button disabled={saving} onClick={() => review("APPROVED")} className="flex items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><CheckIcon size={17} /> موافقة</button>
          <button disabled={saving} onClick={() => review("REJECTED")} className="flex items-center justify-center gap-2 rounded-xl border border-danger/20 px-4 py-3 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"><XIcon size={17} /> رفض</button>
        </div>
      </div>
    </div>
  );
}
