"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ActivityIcon, BellIcon, CheckIcon, ClockIcon, FolderIcon, LockIcon,
  SettingsIcon, UsersIcon,
} from "@/components/icons";

type Tab = "account" | "appearance" | "notifications" | "security" | "organization" | "policies" | "integrations" | "audit";
type Personal = {
  theme: string; compactMode: boolean; reducedMotion: boolean;
  notifyTasks: boolean; notifyProjects: boolean; notifyRequests: boolean; notifyAttendance: boolean; notifySystem: boolean;
};
type Profile = { name: string; email: string; country: string; timezone: string; role: string };
type System = {
  organizationName: string; timezone: string; dailyWorkHours: number; workingDays: number[];
  workStartMinutes: number; lateGraceMinutes: number; earlyCheckInMinutes: number; autoCloseHour: number;
  hourlyCheckInterval: number; hourlyCheckWindow: number; overtimeMaxHours: number;
  annualLeaveDays: number; projectTrashRetentionDays: number;
};
type AuditLog = { id: string; action: string; entity: string; details?: string; createdAt: string; user: { name: string; email: string } };
type DropboxStatus = {
  configured: boolean; connected: boolean; mode: "refresh_token" | "access_token" | "dashboard_token" | "none";
  autoRefresh: boolean; accessTokenExpiresAt: string | null; tokenUpdatedAt: string | null; accountName: string | null;
  accountEmail: string | null; teamMemberId: string | null; error?: string;
};

const defaults: Personal = {
  theme: "LIGHT", compactMode: false, reducedMotion: false, notifyTasks: true,
  notifyProjects: true, notifyRequests: true, notifyAttendance: true, notifySystem: true,
};
const actionLabels: Record<string, string> = {
  UPDATE_PROFILE: "تحديث بيانات الحساب", CHANGE_PASSWORD: "تغيير كلمة المرور",
  UPDATE_SYSTEM_SETTINGS: "تحديث إعدادات المؤسسة", CREATE_OVERTIME: "إنشاء طلب ساعات إضافية",
  CREATE_LEAVE: "إنشاء طلب إجازة", APPROVE_OVERTIME: "الموافقة على ساعات إضافية",
  REJECT_OVERTIME: "رفض ساعات إضافية", APPROVE_LEAVE: "الموافقة على إجازة", REJECT_LEAVE: "رفض إجازة",
  UPDATE_DROPBOX_TOKEN: "تحديث توكن Dropbox", REMOVE_DROPBOX_TOKEN: "حذف توكن Dropbox",
};
const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>("account");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [personal, setPersonal] = useState<Personal>(defaults);
  const [system, setSystem] = useState<System | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [dropbox, setDropbox] = useState<DropboxStatus | null>(null);
  const [dropboxToken, setDropboxToken] = useState("");
  const [dropboxFormError, setDropboxFormError] = useState("");
  const [savingDropbox, setSavingDropbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const tabs = useMemo(() => [
    { id: "account" as Tab, label: "الحساب", icon: UsersIcon },
    { id: "appearance" as Tab, label: "المظهر", icon: SettingsIcon },
    { id: "notifications" as Tab, label: "الإشعارات", icon: BellIcon },
    { id: "security" as Tab, label: "الأمان", icon: LockIcon },
    ...(isAdmin ? [
      { id: "organization" as Tab, label: "المؤسسة", icon: FolderIcon },
      { id: "policies" as Tab, label: "سياسات العمل", icon: ClockIcon },
      { id: "integrations" as Tab, label: "التكاملات", icon: FolderIcon },
    ] : []),
    ...(isManager ? [{ id: "audit" as Tab, label: "سجل النشاط", icon: ActivityIcon }] : []),
  ], [isAdmin, isManager]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/settings");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setProfile(data.profile);
        setPersonal(data.personal);
        setSystem(data.system);
        if (isManager) {
          const auditResponse = await fetch("/api/audit");
          if (auditResponse.ok) setLogs((await auditResponse.json()).logs || []);
        }
        if (isAdmin) {
          const dropboxResponse = await fetch("/api/integrations/dropbox/status");
          if (dropboxResponse.ok) setDropbox(await dropboxResponse.json());
        }
      } catch (error) {
        show("error", error instanceof Error ? error.message : "تعذر تحميل الإعدادات");
      } finally { setLoading(false); }
    })();
  }, [isAdmin, isManager]);

  function show(type: "ok" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3500);
  }

  async function save(section: string, body: object) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      show("ok", data.message);
      return data;
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر حفظ الإعدادات");
      return null;
    } finally { setSaving(false); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const data = await save("profile", profile);
    if (data) { setProfile(data.profile); await refreshUser(); }
  }

  async function savePersonal(next = personal) {
    const data = await save("personal", next);
    if (data) {
      setPersonal(data.personal);
      localStorage.setItem("intervia-preferences", JSON.stringify(data.personal));
      applyPreferences(data.personal);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) return show("error", "تأكيد كلمة المرور غير متطابق");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      event.currentTarget.reset();
      show("ok", data.message);
    } catch (error) { show("error", error instanceof Error ? error.message : "تعذر تغيير كلمة المرور"); }
    finally { setSaving(false); }
  }

  async function saveDropboxToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dropboxToken.trim()) {
      setDropboxFormError("أدخل Access Token أولاً");
      return;
    }
    setDropboxFormError("");
    setSavingDropbox(true);
    try {
      const response = await fetch("/api/integrations/dropbox/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: dropboxToken }),
      });
      const data = await response.json();
      if (!response.ok || data.valid === false) throw new Error(data.error);
      setDropbox(data.status);
      setDropboxToken("");
      setDropboxFormError("");
      show("ok", data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حفظ توكن Dropbox";
      setDropboxFormError(message);
      show("error", message);
    } finally {
      setSavingDropbox(false);
    }
  }

  async function removeDropboxToken() {
    if (!window.confirm("هل تريد حذف توكن Dropbox المحفوظ من لوحة التحكم؟")) return;
    setSavingDropbox(true);
    try {
      const response = await fetch("/api/integrations/dropbox/status", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDropbox(data.status);
      show("ok", data.message);
    } catch (error) {
      show("error", error instanceof Error ? error.message : "تعذر حذف التوكن");
    } finally {
      setSavingDropbox(false);
    }
  }

  if (loading) return <div className="space-y-5"><div className="skeleton-heading" /><div className="skeleton-card h-96" /></div>;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div>
        <h1 className="page-title">الإعدادات</h1>
        <p className="page-subtitle">إدارة حسابك وتفضيلاتك وسياسات تشغيل النظام من مكان واحد</p>
      </div>

      {notice && <div className={`fixed left-5 top-20 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-soft-lg ${notice.type === "ok" ? "bg-success" : "bg-danger"}`}>{notice.text}</div>}

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card h-fit p-2 lg:sticky lg:top-20">
          <div className="mb-2 rounded-xl bg-tint/60 p-3">
            <p className="truncate text-sm font-semibold text-navy">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex min-w-max items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors lg:w-full ${tab === id ? "bg-teal text-white" : "text-muted hover:bg-tint hover:text-navy"}`}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {tab === "account" && profile && <Section title="بيانات الحساب" description="المعلومات الأساسية المستخدمة في الملف الشخصي والتقارير">
            <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل"><input className="input-field" required minLength={2} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
              <Field label="البريد الإلكتروني"><input type="email" className="input-field" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
              <Field label="الدولة"><input className="input-field" required value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} /></Field>
              <Field label="المنطقة الزمنية"><TimezoneSelect value={profile.timezone} onChange={(timezone) => setProfile({ ...profile, timezone })} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SaveButton saving={saving} /></div>
            </form>
          </Section>}

          {tab === "appearance" && <Section title="المظهر وتجربة الاستخدام" description="اختر الشكل الأنسب لك، وتحفظ التفضيلات على حسابك">
            <div className="space-y-6">
              <div>
                <p className="label">نمط الألوان</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[["LIGHT", "فاتح", "bg-white"], ["DARK", "داكن", "bg-navy"], ["SYSTEM", "حسب الجهاز", "bg-gradient-to-l from-white to-navy"]].map(([value, label, preview]) => (
                    <button key={value} onClick={() => setPersonal({ ...personal, theme: value })} className={`rounded-xl border p-3 text-right transition-all ${personal.theme === value ? "border-teal ring-2 ring-teal/10" : "border-tint-200"}`}>
                      <span className={`mb-3 block h-16 rounded-lg border border-tint-200 ${preview}`} /><span className="flex items-center justify-between text-sm font-medium text-navy">{label}{personal.theme === value && <CheckIcon size={16} className="text-teal" />}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Toggle label="الوضع المضغوط" description="تقليل المسافات لعرض محتوى أكثر" checked={personal.compactMode} onChange={(value) => setPersonal({ ...personal, compactMode: value })} />
              <Toggle label="تقليل الحركة" description="إيقاف معظم المؤثرات والانتقالات" checked={personal.reducedMotion} onChange={(value) => setPersonal({ ...personal, reducedMotion: value })} />
              <div className="flex justify-end"><SaveButton saving={saving} onClick={() => savePersonal()} /></div>
            </div>
          </Section>}

          {tab === "notifications" && <Section title="تفضيلات الإشعارات" description="حدد أنواع الإشعارات التي تريد استقبالها داخل النظام">
            <div className="divide-y divide-tint-200">
              <Toggle label="المهام" description="الإسناد، تغيير الأولوية، المراجعات والتعليقات" checked={personal.notifyTasks} onChange={(value) => setPersonal({ ...personal, notifyTasks: value })} />
              <Toggle label="المشاريع" description="الإضافة إلى مشروع والتحديثات الإدارية" checked={personal.notifyProjects} onChange={(value) => setPersonal({ ...personal, notifyProjects: value })} />
              <Toggle label="الطلبات" description="طلبات الإجازات والساعات الإضافية وقراراتها" checked={personal.notifyRequests} onChange={(value) => setPersonal({ ...personal, notifyRequests: value })} />
              <Toggle label="الحضور" description="تنبيهات التحقق من الحضور والتأخير" checked={personal.notifyAttendance} onChange={(value) => setPersonal({ ...personal, notifyAttendance: value })} />
              <Toggle label="إشعارات النظام" description="التنبيهات الإدارية والتحديثات المهمة" checked={personal.notifySystem} onChange={(value) => setPersonal({ ...personal, notifySystem: value })} />
            </div>
            <div className="mt-5 flex justify-end"><SaveButton saving={saving} onClick={() => savePersonal()} /></div>
          </Section>}

          {tab === "security" && <Section title="الأمان وكلمة المرور" description="استخدم كلمة مرور قوية ومختلفة عن حساباتك الأخرى">
            <form onSubmit={changePassword} className="max-w-xl space-y-4">
              <Field label="كلمة المرور الحالية"><input name="currentPassword" type="password" className="input-field" required autoComplete="current-password" /></Field>
              <Field label="كلمة المرور الجديدة"><input name="newPassword" type="password" className="input-field" required minLength={8} autoComplete="new-password" /></Field>
              <Field label="تأكيد كلمة المرور"><input name="confirmPassword" type="password" className="input-field" required minLength={8} autoComplete="new-password" /></Field>
              <p className="text-xs text-muted">يجب أن تتكون من 8 أحرف على الأقل. كلمات المرور مشفرة ولا يمكن لأي مدير الاطلاع عليها.</p>
              <SaveButton saving={saving} label="تغيير كلمة المرور" />
            </form>
          </Section>}

          {tab === "organization" && system && <Section title="بيانات المؤسسة" description="المعلومات العامة التي يعتمد عليها النظام">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم المؤسسة"><input className="input-field" value={system.organizationName} onChange={(e) => setSystem({ ...system, organizationName: e.target.value })} /></Field>
              <Field label="المنطقة الزمنية الافتراضية"><TimezoneSelect value={system.timezone} onChange={(timezone) => setSystem({ ...system, timezone })} /></Field>
              <div className="sm:col-span-2 flex justify-end"><SaveButton saving={saving} onClick={() => save("system", system)} /></div>
            </div>
          </Section>}

          {tab === "policies" && system && <Section title="سياسات العمل" description="القواعد الافتراضية للحضور والإجازات والعمل الإضافي">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="ساعات العمل اليومية" value={system.dailyWorkHours} min={1} max={16} step={0.5} onChange={(value) => setSystem({ ...system, dailyWorkHours: value })} />
              <NumberField label="بداية الدوام (بالدقائق من منتصف الليل)" value={system.workStartMinutes} min={0} max={1439} onChange={(value) => setSystem({ ...system, workStartMinutes: value })} />
              <NumberField label="سماحية التأخير (دقيقة)" value={system.lateGraceMinutes} min={0} max={120} onChange={(value) => setSystem({ ...system, lateGraceMinutes: value })} />
              <NumberField label="التسجيل المبكر (دقيقة)" value={system.earlyCheckInMinutes} min={0} max={240} onChange={(value) => setSystem({ ...system, earlyCheckInMinutes: value })} />
              <NumberField label="ساعة الإغلاق التلقائي" value={system.autoCloseHour} min={1} max={23} onChange={(value) => setSystem({ ...system, autoCloseHour: value })} />
              <NumberField label="رصيد الإجازة السنوي" value={system.annualLeaveDays} min={0} max={90} onChange={(value) => setSystem({ ...system, annualLeaveDays: value })} />
              <NumberField label="تكرار تحقق الحضور (دقيقة)" value={system.hourlyCheckInterval} min={15} max={240} onChange={(value) => setSystem({ ...system, hourlyCheckInterval: value })} />
              <NumberField label="مهلة تأكيد الحضور (دقيقة)" value={system.hourlyCheckWindow} min={5} max={120} onChange={(value) => setSystem({ ...system, hourlyCheckWindow: value })} />
              <NumberField label="أقصى ساعات إضافية للطلب" value={system.overtimeMaxHours} min={1} max={24} step={0.5} onChange={(value) => setSystem({ ...system, overtimeMaxHours: value })} />
              <NumberField label="الاحتفاظ بالمشاريع المحذوفة (يوم)" value={system.projectTrashRetentionDays} min={1} max={365} onChange={(value) => setSystem({ ...system, projectTrashRetentionDays: value })} />
              <div className="sm:col-span-2">
                <p className="label">أيام العمل الأسبوعية</p>
                <div className="flex flex-wrap gap-2">{days.map((day, index) => <button key={day} type="button" onClick={() => setSystem({ ...system, workingDays: system.workingDays.includes(index) ? system.workingDays.filter((d) => d !== index) : [...system.workingDays, index] })} className={`rounded-lg px-3 py-2 text-sm ${system.workingDays.includes(index) ? "bg-teal text-white" : "bg-tint text-muted"}`}>{day}</button>)}</div>
              </div>
              <div className="sm:col-span-2 flex justify-end"><SaveButton saving={saving} onClick={() => save("system", system)} /></div>
            </div>
          </Section>}

          {tab === "integrations" && <Section title="تكامل Dropbox" description="حالة ربط تسليمات الموظفين بالمساحة السحابية">
            <div className="space-y-5">
              <div className={`rounded-2xl border p-4 ${dropbox?.connected ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">{dropbox?.connected ? "الاتصال يعمل بشكل صحيح" : "التطبيق غير متصل بعد"}</p>
                    <p className="mt-1 text-sm text-muted">
                      {dropbox?.connected
                        ? `${dropbox.accountName || "Dropbox"}${dropbox.accountEmail ? ` · ${dropbox.accountEmail}` : ""}`
                        : dropbox?.error || "جارٍ فحص الاتصال..."}
                    </p>
                    {dropbox?.connected && dropbox.teamMemberId && <p className="mt-1 text-xs text-muted" dir="ltr">Team member: {dropbox.teamMemberId}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dropbox?.connected ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                    {dropbox?.connected ? "متصل" : "غير متصل"}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatusCard label="طريقة التوثيق" value={dropbox?.mode === "refresh_token" ? "Refresh Token" : dropbox?.mode === "dashboard_token" ? "توكن من لوحة التحكم" : dropbox?.mode === "access_token" ? "Access Token من الخادم" : "غير مهيأ"} />
                <StatusCard label="التجديد التلقائي" value={dropbox?.autoRefresh ? "مفعّل" : "غير مفعّل"} />
                <StatusCard
                  label="انتهاء الرمز الحالي"
                  value={dropbox?.accessTokenExpiresAt ? new Date(dropbox.accessTokenExpiresAt).toLocaleString("ar-EG") : ["access_token", "dashboard_token"].includes(dropbox?.mode || "") ? "يفحص مباشرة عند الاستخدام" : "—"}
                />
                <StatusCard label="آخر تحديث يدوي" value={dropbox?.tokenUpdatedAt ? new Date(dropbox.tokenUpdatedAt).toLocaleString("ar-EG") : "—"} />
              </div>

              <form onSubmit={saveDropboxToken} className="rounded-2xl border border-tint-200 p-4 sm:p-5">
                <div className="mb-4">
                  <h3 className="font-semibold text-navy">تحديث Access Token يدوياً</h3>
                  <p className="mt-1 text-xs leading-6 text-muted">الصق قيمة التوكن كاملة. يقبل النظام القيمة وحدها أو بصيغة Bearer، وسيزيل المسافات وعلامات الاقتباس تلقائياً قبل الفحص.</p>
                </div>
                <Field label="Dropbox Access Token">
                  <input
                    type="password"
                    autoComplete="off"
                    className="input-field text-left"
                    dir="ltr"
                    value={dropboxToken}
                    onChange={(event) => {
                      setDropboxToken(event.target.value);
                      if (dropboxFormError) setDropboxFormError("");
                    }}
                    placeholder="sl.u…"
                    required
                  />
                </Field>
                {dropboxFormError && <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
                  <p className="font-semibold">{dropboxFormError}</p>
                  {dropboxFormError.includes("file_requests.read") && <p className="mt-1 text-xs leading-6">فعّل صلاحيات File Requests من صفحة Permissions في Dropbox App Console، ثم أنشئ Access Token جديداً.</p>}
                  {dropboxFormError.includes("انتهت") && <p className="mt-1 text-xs leading-6">أنشئ Access Token جديداً من Dropbox App Console ثم الصقه هنا بالكامل.</p>}
                </div>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {dropbox?.mode === "dashboard_token" && <button type="button" onClick={removeDropboxToken} disabled={savingDropbox} className="btn-secondary text-danger disabled:opacity-60">حذف التوكن المحفوظ</button>}
                  <button type="submit" disabled={savingDropbox || !dropboxToken.trim()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                    {savingDropbox ? "جارٍ الفحص والحفظ..." : "فحص وحفظ التوكن"}
                  </button>
                </div>
              </form>

              <div className="rounded-xl bg-tint/60 p-4 text-xs leading-6 text-muted">
                لا يرسل النظام التوكن للموظفين ولا يعرض قيمته بعد الحفظ. للحصول على تجديد تلقائي دون إدخال يومي، استخدم إعدادات Refresh Token في بيئة الخادم.
              </div>
            </div>
          </Section>}

          {tab === "audit" && <Section title="سجل النشاط" description="آخر 40 عملية إدارية وحساسة في النظام">
            <div className="space-y-2">
              {logs.length === 0 && <p className="py-10 text-center text-sm text-muted">لا يوجد نشاط مسجل</p>}
              {logs.map((log) => <div key={log.id} className="flex gap-3 rounded-xl border border-tint-200 p-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal"><ActivityIcon size={17} /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-navy">{actionLabels[log.action] || log.action.replaceAll("_", " ")}</p><time className="text-xs text-muted">{new Date(log.createdAt).toLocaleString("ar-EG")}</time></div><p className="mt-1 text-xs text-muted">{log.user.name} · {log.details || log.entity}</p></div>
              </div>)}
            </div>
          </Section>}
        </main>
      </div>
    </div>
  );
}

function applyPreferences(settings: Personal) {
  const dark = settings.theme === "DARK" || (settings.theme === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark-theme", dark);
  document.documentElement.classList.toggle("compact-mode", settings.compactMode);
  document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion);
}
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="card p-5 sm:p-7"><div className="mb-6 border-b border-tint-200 pb-4"><h2 className="text-lg font-bold text-navy">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div>{children}</section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="label">{label}</span>{children}</label>; }
function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" className="input-field" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}
function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}><option value="Asia/Hebron">فلسطين — الخليل</option><option value="Asia/Jerusalem">فلسطين — القدس</option><option value="Asia/Amman">الأردن</option><option value="Asia/Riyadh">السعودية</option><option value="Asia/Qatar">قطر</option><option value="Asia/Dubai">الإمارات</option></select>;
}
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-4 py-4"><span><span className="block text-sm font-semibold text-navy">{label}</span><span className="mt-1 block text-xs text-muted">{description}</span></span><input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="relative h-6 w-11 shrink-0 rounded-full bg-tint-200 transition-colors peer-checked:bg-teal after:absolute after:right-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:-translate-x-5" /></label>;
}
function SaveButton({ saving, label = "حفظ التغييرات", onClick }: { saving: boolean; label?: string; onClick?: () => void }) {
  return <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={saving} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">{saving ? "جارٍ الحفظ..." : label}</button>;
}
function StatusCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-tint-200 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-sm font-semibold text-navy">{value}</p></div>;
}
