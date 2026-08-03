"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "@/components/icons";
import SelectField from "@/components/ui/select";
import { formatProjectLabel } from "@/lib/project-label";

type SubmissionType = "DAILY" | "MONTHLY";
type SubmissionStatus = "OPEN" | "SUBMITTED" | "REVIEWED" | "REVISION_REQUESTED" | "CANCELLED";

interface SubmissionFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string | null;
}

interface Submission {
  id: string;
  type: SubmissionType;
  periodDate: string;
  note: string | null;
  status: SubmissionStatus;
  dropboxRequestUrl: string;
  fileCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  project: { id: string; name: string; code?: string | null };
  reviewer?: { id: string; name: string } | null;
  files: SubmissionFile[];
  version: number;
  revisions?: { id: string; version: number; status: string; filesJson: string; note: string | null; createdAt: string }[];
}

interface Project { id: string; name: string; code?: string | null }
interface TeamMember { id: string; name: string; role: string }

const statusInfo: Record<SubmissionStatus, { label: string; badge: string }> = {
  OPEN: { label: "بانتظار رفع الملفات", badge: "badge-warning" },
  SUBMITTED: { label: "بانتظار المراجعة", badge: "badge-info" },
  REVIEWED: { label: "تمت المراجعة", badge: "badge-success" },
  REVISION_REQUESTED: { label: "مطلوب تعديل", badge: "badge-danger" },
  CANCELLED: { label: "ملغى", badge: "badge-danger" },
};

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string, type?: SubmissionType) {
  return new Date(value).toLocaleDateString("ar", type === "MONTHLY"
    ? { year: "numeric", month: "long" }
    : { year: "numeric", month: "short", day: "numeric" });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function SubmissionsPage() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [type, setType] = useState<"ALL" | SubmissionType>("ALL");
  const [status, setStatus] = useState("ALL");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Submission | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const fetchSubmissions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/submissions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmissions(data.submissions || []);
      setConfigured(data.dropboxConfigured);
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر تحميل التسليمات" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubmissions();
    void fetch("/api/projects", { cache: "no-store" }).then((response) => response.json()).then((data) => setProjects(data.projects || []));
    if (isManager) void fetch("/api/users", { cache: "no-store" }).then((response) => response.json()).then((data) => setTeam(data.users || []));
    const timer = window.setInterval(() => void fetchSubmissions(true), 20000);
    return () => window.clearInterval(timer);
  }, [fetchSubmissions, isManager]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && submissions.some((item) => item.id === id)) {
      window.setTimeout(() => document.getElementById(`submission-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [submissions]);

  const filtered = useMemo(() => submissions.filter((item) => {
    if (type !== "ALL" && item.type !== type) return false;
    if (status !== "ALL" && item.status !== status) return false;
    if (projectId && item.project.id !== projectId) return false;
    if (userId && item.user.id !== userId) return false;
    if (query && !`${item.user.name} ${item.project.name} ${item.note || ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [projectId, query, status, submissions, type, userId]);

  const counts = {
    total: submissions.length,
    open: submissions.filter((item) => item.status === "OPEN" || item.status === "REVISION_REQUESTED").length,
    submitted: submissions.filter((item) => item.status === "SUBMITTED").length,
    reviewed: submissions.filter((item) => item.status === "REVIEWED").length,
  };

  const verify = async (submission: Submission) => {
    setBusy(submission.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/submissions/${submission.id}/verify`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage({ tone: "success", text: `تم إتمام التسليم وتسجيل ${data.submission.fileCount} ملفات` });
      await fetchSubmissions(true);
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر التحقق من الملفات" });
    } finally { setBusy(""); }
  };

  const manageSubmission = async (submission: Submission, action: "CANCEL" | "REOPEN") => {
    const prompt = action === "CANCEL" ? "هل تريد إلغاء رابط هذا التسليم؟" : "هل تريد إعادة فتح التسليم وإنشاء رابط رفع جديد؟";
    if (!window.confirm(prompt)) return;
    setBusy(submission.id);
    try {
      const response = await fetch(`/api/submissions/${submission.id}/manage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage({ tone: "success", text: action === "CANCEL" ? "تم إلغاء رابط التسليم" : "تم إعادة فتح التسليم" });
      await fetchSubmissions(true);
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }); }
    finally { setBusy(""); }
  };

  const deleteFile = async (submission: Submission, file: SubmissionFile) => {
    if (!window.confirm(`حذف الملف "${file.name}" من التسليم؟`)) return;
    setBusy(file.id);
    try {
      const response = await fetch(`/api/submissions/${submission.id}/files?fileId=${file.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage({ tone: "success", text: "تم حذف الملف" });
      await fetchSubmissions(true);
    } catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر حذف الملف" }); }
    finally { setBusy(""); }
  };

  const openFile = async (submissionId: string, fileId: string) => {
    setBusy(fileId);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/files?fileId=${fileId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.open(data.link, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر فتح الملف" });
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="page-title">تسليم الملفات</h1><p className="page-subtitle">{isManager ? "متابعة التسليمات اليومية والشهرية للفريق" : "ارفع ملفات عملك اليومية والشهرية حسب المشروع"}</p></div>
        {!isManager && <button disabled={!configured} onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"><PlusIcon size={18} /> تسليم جديد</button>}
      </div>

      {!configured && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.06] p-4 text-warning">
          <AlertCircleIcon size={20} className="mt-0.5 flex-shrink-0" />
          <div><p className="text-sm font-semibold">Dropbox غير مربوط بعد</p><p className="mt-1 text-xs leading-relaxed">{isManager ? "أضف DROPBOX_APP_KEY وDROPBOX_APP_SECRET وDROPBOX_REFRESH_TOKEN إلى متغيرات الخادم لتفعيل التسليمات." : "اطلب من مدير النظام إكمال ربط Dropbox قبل إنشاء تسليم."}</p></div>
        </div>
      )}

      {message && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${message.tone === "success" ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}>{message.tone === "success" ? <CheckIcon size={17} /> : <AlertCircleIcon size={17} />}{message.text}<button onClick={() => setMessage(null)} className="mr-auto"><XIcon size={15} /></button></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary icon={FileTextIcon} label="إجمالي التسليمات" value={counts.total} />
        <Summary icon={ClockIcon} label="بانتظار الملفات" value={counts.open} tone="warning" />
        <Summary icon={FolderIcon} label="بانتظار المراجعة" value={counts.submitted} tone="teal" />
        <Summary icon={CheckIcon} label="تمت مراجعتها" value={counts.reviewed} tone="success" />
      </div>

      <section className="card p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1"><SearchIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input-field py-2.5 pr-9 text-sm" placeholder="بحث بالموظف أو المشروع..." /></div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <SelectField value={type} onChange={(value) => setType(value as typeof type)} options={[{ value: "ALL", label: "كل الأنواع" }, { value: "DAILY", label: "يومي" }, { value: "MONTHLY", label: "شهري" }]} className="min-w-0 sm:w-32" />
            <SelectField value={status} onChange={setStatus} options={[{ value: "ALL", label: "كل الحالات" }, { value: "OPEN", label: "بانتظار الملفات" }, { value: "SUBMITTED", label: "بانتظار المراجعة" }, { value: "REVIEWED", label: "تمت المراجعة" }, { value: "REVISION_REQUESTED", label: "مطلوب تعديل" }, { value: "CANCELLED", label: "ملغى" }]} className="min-w-0 sm:w-44" />
            <SelectField value={projectId} onChange={setProjectId} options={[{ value: "", label: "كل المشاريع" }, ...projects.map((project) => ({ value: project.id, label: formatProjectLabel(project) }))]} className="min-w-0 sm:w-52" />
            {isManager && <SelectField value={userId} onChange={setUserId} options={[{ value: "", label: "كل الموظفين" }, ...team.filter((member) => member.role === "EMPLOYEE").map((member) => ({ value: member.id, label: member.name }))]} className="min-w-0 sm:w-44" />}
          </div>
        </div>
      </section>

      {loading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-card h-52" />)}</div> : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center"><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tint"><FileTextIcon size={24} className="text-muted/40" /></div><p className="font-medium text-navy">لا توجد تسليمات مطابقة</p><p className="mt-1 text-xs text-muted">{isManager ? "ستظهر تسليمات الموظفين هنا" : "أنشئ تسليماً عند وجود ملفات جاهزة"}</p></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((submission) => <SubmissionCard key={submission.id} submission={submission} isManager={isManager} busy={busy} onVerify={() => verify(submission)} onReview={() => setReviewTarget(submission)} onOpenFile={openFile} onCancel={() => manageSubmission(submission, "CANCEL")} onReopen={() => manageSubmission(submission, "REOPEN")} onDeleteFile={(file) => deleteFile(submission, file)} />)}
        </div>
      )}

      {showCreate && <CreateSubmissionModal projects={projects} onClose={() => setShowCreate(false)} onCreated={(submission) => { setShowCreate(false); setSubmissions((items) => [submission, ...items]); setMessage({ tone: "success", text: "تم إنشاء رابط Dropbox، أكمل رفع الملفات ثم اضغط إتمام التسليم" }); window.open(submission.dropboxRequestUrl, "_blank", "noopener,noreferrer"); }} />}
      {reviewTarget && <ReviewModal submission={reviewTarget} onClose={() => setReviewTarget(null)} onReviewed={async (text) => { setReviewTarget(null); setMessage({ tone: "success", text }); await fetchSubmissions(true); }} />}
    </div>
  );
}

function Summary({ icon: Icon, label, value, tone = "navy" }: { icon: typeof FileTextIcon; label: string; value: number; tone?: "navy" | "warning" | "teal" | "success" }) {
  const colors = { navy: "bg-navy/10 text-navy", warning: "bg-warning/10 text-warning", teal: "bg-teal/10 text-teal", success: "bg-success/10 text-success" };
  return <div className="card p-4"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${colors[tone]}`}><Icon size={18} /></div><p className="text-[10px] text-muted sm:text-xs">{label}</p><p className="mt-1 text-xl font-bold text-navy sm:text-2xl">{value}</p></div>;
}

function SubmissionCard({ submission, isManager, busy, onVerify, onReview, onOpenFile, onCancel, onReopen, onDeleteFile }: { submission: Submission; isManager: boolean; busy: string; onVerify: () => void; onReview: () => void; onOpenFile: (submissionId: string, fileId: string) => void; onCancel: () => void; onReopen: () => void; onDeleteFile: (file: SubmissionFile) => void }) {
  const info = statusInfo[submission.status];
  const canUpload = submission.status === "OPEN" || submission.status === "REVISION_REQUESTED";
  return (
    <article id={`submission-${submission.id}`} className="card scroll-mt-24 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-tint-200 p-4 sm:p-5">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${submission.type === "DAILY" ? "bg-teal/10 text-teal" : "bg-navy/10 text-navy"}`}>{submission.type === "DAILY" ? <CalendarIcon size={20} /> : <ClockIcon size={20} />}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-navy">{submission.type === "DAILY" ? "تسليم يومي" : "تسليم شهري"}</h3><span className={info.badge}>{info.label}</span></div><p className="mt-1 truncate text-sm font-medium text-teal" title={submission.project.name}>{formatProjectLabel(submission.project)}</p><p className="mt-1 text-xs text-muted">{formatDate(submission.periodDate, submission.type)}{isManager && ` · ${submission.user.name}`}</p></div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {submission.note && <p className="rounded-xl bg-tint/45 p-3 text-xs leading-relaxed text-navy-400">{submission.note}</p>}
        {submission.reviewNote && <div className={`rounded-xl p-3 text-xs ${submission.status === "REVISION_REQUESTED" ? "bg-danger/5 text-danger" : "bg-success/5 text-success"}`}><span className="font-semibold">ملاحظة المراجعة: </span>{submission.reviewNote}</div>}
        {submission.files.length > 0 && <div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-navy">الملفات · النسخة {submission.version}</p><span className="text-[10px] text-muted">{submission.files.length} ملفات</span></div><div className="space-y-1.5">{submission.files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg bg-tint/35 px-3 py-2"><button disabled={busy === file.id} onClick={() => onOpenFile(submission.id, file.id)} className="flex min-w-0 flex-1 items-center gap-2 text-right hover:text-teal disabled:opacity-50"><FileTextIcon size={14} className="flex-shrink-0 text-teal" /><span className="min-w-0 flex-1 truncate text-xs text-navy">{file.name}</span><span className="text-[9px] text-muted">{formatSize(file.size)}</span></button>{canUpload && <button onClick={() => onDeleteFile(file)} className="rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger" title="حذف الملف أو استبداله بنسخة جديدة"><XIcon size={13} /></button>}</div>)}</div></div>}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {canUpload && <><a href={submission.dropboxRequestUrl} target="_blank" rel="noreferrer" className="btn-secondary flex flex-1 items-center justify-center gap-2 py-2 text-xs"><FolderIcon size={15} /> رفع الملفات عبر Dropbox</a><button disabled={busy === submission.id} onClick={onVerify} className="btn-primary flex-1 py-2 text-xs disabled:opacity-50">{busy === submission.id ? "جارٍ التحقق..." : "تحقق وإتمام التسليم"}</button></>}
          {isManager && submission.status === "SUBMITTED" && <button onClick={onReview} className="btn-primary w-full py-2 text-xs">مراجعة التسليم</button>}
          {!isManager && ["OPEN", "REVISION_REQUESTED"].includes(submission.status) && <button onClick={onCancel} className="rounded-xl border border-danger/20 px-3 py-2 text-xs text-danger">إلغاء الرابط</button>}
          {isManager && ["REVIEWED", "CANCELLED"].includes(submission.status) && <button onClick={onReopen} className="btn-secondary w-full py-2 text-xs">إعادة فتح وإضافة ملفات</button>}
        </div>
        {submission.revisions && submission.revisions.length > 0 && <div className="mt-3 rounded-xl bg-tint/40 p-3"><p className="mb-2 text-[11px] font-semibold text-navy">سجل النسخ السابقة</p><div className="flex flex-wrap gap-2">{submission.revisions.map((revision) => <span key={revision.id} className="rounded-lg bg-white px-2 py-1 text-[10px] text-muted">النسخة {revision.version} · {new Date(revision.createdAt).toLocaleDateString("ar")}</span>)}</div></div>}
      </div>
    </article>
  );
}

function CreateSubmissionModal({ projects, onClose, onCreated }: { projects: Project[]; onClose: () => void; onCreated: (submission: Submission) => void }) {
  const [form, setForm] = useState({ projectId: "", type: "DAILY" as SubmissionType, dailyDate: todayInput(), month: todayInput().slice(0, 7), note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: form.projectId, type: form.type, periodDate: form.type === "DAILY" ? form.dailyDate : `${form.month}-01`, note: form.note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onCreated(data.submission);
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر إنشاء التسليم"); setSaving(false); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/35 p-4 backdrop-blur-sm"><div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-navy">تسليم ملفات جديد</h2><p className="mt-1 text-xs text-muted">سيتم إنشاء رابط Dropbox مخصص لهذا التسليم</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button></div><form onSubmit={submit} className="space-y-4"><label className="label">المشروع<SelectField required value={form.projectId} onChange={(projectId) => setForm({ ...form, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} placeholder="اختر المشروع" className="mt-1.5" /></label><div><p className="label">نوع التسليم</p><div className="grid grid-cols-2 rounded-xl bg-tint/60 p-1"><button type="button" onClick={() => setForm({ ...form, type: "DAILY" })} className={`rounded-lg px-3 py-2 text-sm ${form.type === "DAILY" ? "bg-white font-semibold text-teal shadow-soft" : "text-muted"}`}>يومي</button><button type="button" onClick={() => setForm({ ...form, type: "MONTHLY" })} className={`rounded-lg px-3 py-2 text-sm ${form.type === "MONTHLY" ? "bg-white font-semibold text-teal shadow-soft" : "text-muted"}`}>شهري</button></div></div><label className="label">{form.type === "DAILY" ? "تاريخ التسليم" : "شهر التسليم"}<input type={form.type === "DAILY" ? "date" : "month"} required value={form.type === "DAILY" ? form.dailyDate : form.month} onChange={(event) => setForm(form.type === "DAILY" ? { ...form, dailyDate: event.target.value } : { ...form, month: event.target.value })} className="input-field mt-1.5" /></label><label className="label">ملاحظة (اختياري)<textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="input-field mt-1.5 resize-none" placeholder="صف الملفات أو العمل المنجز..." /></label>{error && <div className="rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</div>}<div className="flex flex-col gap-3 pt-2 sm:flex-row"><button disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جارٍ إنشاء الرابط..." : "إنشاء وفتح Dropbox"}</button><button type="button" onClick={onClose} className="btn-secondary">إلغاء</button></div></form></div></div>;
}

function ReviewModal({ submission, onClose, onReviewed }: { submission: Submission; onClose: () => void; onReviewed: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const review = async (action: "REVIEWED" | "REVISION_REQUESTED") => {
    setSaving(action); setError("");
    try {
      const response = await fetch(`/api/submissions/${submission.id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onReviewed(action === "REVIEWED" ? "تم اعتماد التسليم" : "تم إرسال طلب التعديل للموظف");
    } catch (error) { setError(error instanceof Error ? error.message : "تعذر حفظ المراجعة"); setSaving(""); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/35 p-4 backdrop-blur-sm"><div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-navy">مراجعة تسليم {submission.user.name}</h2><p className="mt-1 text-xs text-muted">{submission.project.name} · {submission.fileCount} ملفات</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-tint"><XIcon size={19} /></button></div><label className="label">ملاحظة المراجعة<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} className="input-field mt-1.5 resize-none" placeholder="ملاحظة اختيارية عند الاعتماد، ومطلوبة عملياً عند طلب التعديل..." /></label>{error && <div className="mt-3 rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</div>}<div className="mt-5 grid grid-cols-2 gap-3"><button disabled={Boolean(saving)} onClick={() => review("REVIEWED")} className="flex items-center justify-center gap-2 rounded-xl bg-success px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"><CheckIcon size={16} /> اعتماد</button><button disabled={Boolean(saving)} onClick={() => review("REVISION_REQUESTED")} className="flex items-center justify-center gap-2 rounded-xl border border-danger/20 px-3 py-3 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"><XIcon size={16} /> طلب تعديل</button></div></div></div>;
}
