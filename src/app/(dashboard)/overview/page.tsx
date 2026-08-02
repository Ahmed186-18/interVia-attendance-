"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  UsersIcon,
  CheckSquareIcon,
  ClockIcon,
  FolderIcon,
  ActivityIcon,
  TrendingUpIcon,
} from "@/components/icons";

interface OverviewStats {
  totalActiveEmployees: number;
  tasksInReview: number;
  pendingOvertime: number;
  activeProjects: number;
  todayAttendance: number;
  recentActivity: { id: string; action: string; details: string | null; createdAt: string; user: { name: string } }[];
}

interface OvertimeRequest {
  id: string;
  hours: number;
  reason: string | null;
  status: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const [statsRes, overtimeRes] = await Promise.all([
        fetch("/api/overview"),
        fetch("/api/overtime?status=PENDING"),
      ]);
      const statsData = await statsRes.json();
      const overtimeData = await overtimeRes.json();
      setStats(statsData.stats || null);
      setOvertimeRequests(overtimeData.requests || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const handleOvertimeAction = async (id: string, status: string) => {
    try {
      await fetch("/api/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      fetchOverview();
    } catch { alert("حدث خطأ"); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="skeleton-heading" /><div className="skeleton-text mt-2 w-64" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton-card h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="skeleton-card h-64" /><div className="skeleton-card h-64" />
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: "الموظفون النشطون", value: stats?.totalActiveEmployees ?? "—", icon: UsersIcon, color: "teal", bgClass: "bg-teal/10", iconClass: "text-teal" },
    { label: "مهام بانتظار المراجعة", value: stats?.tasksInReview ?? "—", icon: CheckSquareIcon, color: "warning", bgClass: "bg-warning/10", iconClass: "text-warning" },
    { label: "طلبات ساعات إضافية", value: stats?.pendingOvertime ?? "—", icon: ClockIcon, color: "danger", bgClass: "bg-danger/10", iconClass: "text-danger", badge: overtimeRequests.length },
    { label: "المشاريع النشطة", value: stats?.activeProjects ?? "—", icon: FolderIcon, color: "navy", bgClass: "bg-navy/10", iconClass: "text-navy" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="page-title">نظرة عامة</h1>
        <p className="page-subtitle">مرحباً {user?.name} — لوحة تحكم شاملة لحالة الفريق</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="card p-5 group hover:shadow-soft-md transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl ${kpi.bgClass} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  <Icon size={22} className={kpi.iconClass} />
                </div>
                {"badge" in kpi && kpi.badge ? <span className="badge-danger">{kpi.badge}</span> : null}
              </div>
              <p className="stat-label">{kpi.label}</p>
              <p className={`text-display-md mt-1 ${kpi.iconClass}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {overtimeRequests.length > 0 && (
        <div className="card">
          <div className="p-6 pb-4 border-b border-tint-200 flex items-center gap-2">
            <ClockIcon size={20} className="text-danger" />
            <h2 className="section-title">طلبات الساعات الإضافية المعلّقة</h2>
          </div>
          <div className="divide-y divide-tint-200">
            {overtimeRequests.map((req) => (
              <div key={req.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-tint/30 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center">
                    <span className="text-danger font-bold text-sm">{req.user.name.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">{req.user.name}</p>
                    <p className="break-words text-xs text-muted">{req.hours} ساعات إضافية{req.reason && ` — ${req.reason}`}</p>
                    <p className="text-[10px] text-muted/60 mt-0.5">{new Date(req.createdAt).toLocaleDateString("ar")}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => handleOvertimeAction(req.id, "APPROVED")} className="text-xs text-success hover:bg-success/10 px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer">موافقة</button>
                  <button onClick={() => handleOvertimeAction(req.id, "REJECTED")} className="text-xs text-danger hover:bg-danger/10 px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer">رفض</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-6 pb-4 border-b border-tint-200 flex items-center gap-2">
            <ActivityIcon size={20} className="text-teal" />
            <h2 className="section-title">آخر الأنشطة</h2>
          </div>
          {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-tint flex items-center justify-center mb-3"><ActivityIcon size={24} className="text-muted/40" /></div>
              <p className="text-muted font-medium">لا توجد أنشطة حديثة</p>
            </div>
          ) : (
            <div className="divide-y divide-tint-200 max-h-80 overflow-y-auto">
              {stats.recentActivity.map((a) => (
                <div key={a.id} className="p-4 flex items-start gap-3 hover:bg-tint/20 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ActivityIcon size={14} className="text-teal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy"><span className="font-semibold">{a.user.name}</span> {a.details || a.action}</p>
                    <p className="text-[10px] text-muted mt-0.5">{new Date(a.createdAt).toLocaleString("ar")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="p-6 pb-4 border-b border-tint-200 flex items-center gap-2">
            <TrendingUpIcon size={20} className="text-navy" />
            <h2 className="section-title">ملخص اليوم</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-tint/30">
              <span className="text-sm text-muted">الحضور اليوم</span>
              <span className="text-sm font-bold text-teal">{stats?.todayAttendance ?? 0} موظف</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-tint/30">
              <span className="text-sm text-muted">المشاريع النشطة</span>
              <span className="text-sm font-bold text-navy">{stats?.activeProjects ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-tint/30">
              <span className="text-sm text-muted">مهام بانتظار المراجعة</span>
              <span className="text-sm font-bold text-warning">{stats?.tasksInReview ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-tint/30">
              <span className="text-sm text-muted">طلبات overtime معلّقة</span>
              <span className="text-sm font-bold text-danger">{stats?.pendingOvertime ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
