"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  PlusIcon,
  FolderIcon,
  UsersIcon,
  ActivityIcon,
  BarChartIcon,
  ClockIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  UserPlusIcon,
  UserMinusIcon,
  CopyIcon,
} from "@/components/icons";

interface Project {
  id: string;
  name: string;
  code?: string | null;
  clientName?: string | null;
  clientCode?: string | null;
  description: string | null;
  deadline: string | null;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  inReviewTasks: number;
  totalMembers: number;
  createdAt: string;
  deletedAt?: string | null;
}

interface RepositoryProject {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  clientCode: string | null;
  projectStatus: string | null;
  sourceRow: number;
  importedProjectId: string | null;
  importedProject?: { id: string; name: string; deletedAt: string | null } | null;
}

interface RepositoryStats {
  available: number;
  imported: number;
  total: number;
}

interface ProjectMember {
  id: string;
  user: { id: string; name: string; email: string; role: string };
}

interface ProjectStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  inReviewTasks: number;
  byPriority: { HIGH: number; MEDIUM: number; LOW: number };
  membersCount: number;
  progress: number;
  recentActivity: ActivityEntry[];
}

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  details: string | null;
  createdAt: string;
  user: { name: string };
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  tasks: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const tabs = [
  { id: "overview" as const, label: "نظرة عامة", icon: BarChartIcon },
  { id: "members" as const, label: "الأعضاء", icon: UsersIcon },
  { id: "activity" as const, label: "النشاط", icon: ActivityIcon },
];

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [trashProjects, setTrashProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "activity">("overview");
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showRepositoryModal, setShowRepositoryModal] = useState(false);
  const [repositoryItems, setRepositoryItems] = useState<RepositoryProject[]>([]);
  const [repositoryStats, setRepositoryStats] = useState<RepositoryStats>({ available: 0, imported: 0, total: 0 });
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [repositoryFilter, setRepositoryFilter] = useState<"AVAILABLE" | "IMPORTED" | "ALL">("AVAILABLE");
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<string[]>([]);
  const [repositoryBusy, setRepositoryBusy] = useState<"loading" | "syncing" | "importing" | null>(null);
  const [repositoryMessage, setRepositoryMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [newProject, setNewProject] = useState({ name: "", description: "", deadline: "" });

  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  const visibleRepositoryItems = useMemo(() => {
    const query = repositoryQuery.trim().toLocaleLowerCase();
    return repositoryItems.filter((item) => {
      if (repositoryFilter === "AVAILABLE" && item.importedProjectId) return false;
      if (repositoryFilter === "IMPORTED" && !item.importedProjectId) return false;
      if (!query) return true;
      return [item.code, item.name, item.clientName, item.clientCode]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query));
    });
  }, [repositoryFilter, repositoryItems, repositoryQuery]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrash = useCallback(async () => {
    if (!isManager) return;
    try {
      const res = await fetch("/api/projects?trash=true");
      const data = await res.json();
      setTrashProjects(data.projects || []);
    } catch (error) {
      console.error("Error fetching project trash:", error);
    }
  }, [isManager]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {}
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setTeam(data.users || []);
    } catch {}
  }, []);

  const fetchRepository = useCallback(async () => {
    if (!isAdmin) return;
    setRepositoryBusy("loading");
    try {
      const response = await fetch("/api/projects/repository?status=ALL");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRepositoryItems(data.items || []);
      setRepositoryStats(data.stats || { available: 0, imported: 0, total: 0 });
    } catch (error) {
      setRepositoryMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر تحميل المستودع" });
    } finally {
      setRepositoryBusy(null);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (showRepositoryModal) fetchRepository();
  }, [fetchRepository, showRepositoryModal]);

  const syncRepository = async () => {
    setRepositoryBusy("syncing");
    setRepositoryMessage(null);
    try {
      const response = await fetch("/api/projects/repository", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRepositoryMessage({ tone: "success", text: data.message });
      await fetchRepository();
    } catch (error) {
      setRepositoryMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر مزامنة المستودع" });
      setRepositoryBusy(null);
    }
  };

  const importRepositoryProjects = async () => {
    if (!selectedRepositoryIds.length) return;
    setRepositoryBusy("importing");
    setRepositoryMessage(null);
    try {
      const response = await fetch("/api/projects/repository/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRepositoryIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelectedRepositoryIds([]);
      setRepositoryMessage({ tone: "success", text: data.message });
      await Promise.all([fetchRepository(), fetchProjects()]);
    } catch (error) {
      setRepositoryMessage({ tone: "danger", text: error instanceof Error ? error.message : "تعذر استيراد المشاريع" });
      setRepositoryBusy(null);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchTrash();
    fetchTemplates();
    if (isManager) fetchTeam();
  }, [fetchProjects, fetchTrash, fetchTemplates, fetchTeam, isManager]);

  const fetchProjectDetails = useCallback(async (projectId: string) => {
    try {
      const [statsRes, membersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/stats`),
        fetch(`/api/projects/${projectId}/members`),
      ]);
      const statsData = await statsRes.json();
      const membersData = await membersRes.json();
      setStats(statsData.stats || null);
      setMembers(membersData.members || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (selectedProject) fetchProjectDetails(selectedProject.id);
  }, [selectedProject, fetchProjectDetails]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewProject({ name: "", description: "", deadline: "" });
        fetchProjects();
      }
    } catch { alert("حدث خطأ"); }
  };

  const handleUseTemplate = (template: ProjectTemplate) => {
    setNewProject({
      name: template.name,
      description: template.description || "",
      deadline: "",
    });
    setShowTemplateModal(false);
    setShowCreateModal(true);
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedProject) return;
    try {
      await fetch(`/api/projects/${selectedProject.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      fetchProjectDetails(selectedProject.id);
      setShowAddMemberModal(false);
    } catch { alert("حدث خطأ"); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedProject) return;
    if (!confirm("هل أنت متأكد من إزالة هذا العضو؟")) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "تعذر إزالة العضو");
        return;
      }
      fetchProjectDetails(selectedProject.id);
    } catch { alert("حدث خطأ"); }
  };

  const handleTrashProject = async (project: Project) => {
    if (!confirm(`نقل مشروع "${project.name}" إلى سلة المهملات؟ ستبقى جميع المهام والعضويات محفوظة.`)) return;
    const res = await fetch(`/api/projects?id=${project.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "تعذر حذف المشروع");
      return;
    }
    setSelectedProject(null);
    setStats(null);
    setMembers([]);
    fetchProjects();
    fetchTrash();
  };

  const handleRestoreProject = async (project: Project) => {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: project.id, action: "RESTORE" }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "تعذر استعادة المشروع");
      return;
    }
    fetchProjects();
    fetchTrash();
  };

  const getProgress = (project: Project) => {
    if (project.totalTasks === 0) return 0;
    return Math.round((project.completedTasks / project.totalTasks) * 100);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><div className="skeleton-heading" /><div className="skeleton-text mt-2 w-48" /></div>
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-card h-48" />)}
        </div>
      </div>
    );
  }

  if (selectedProject) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedProject(null); setStats(null); setMembers([]); }} className="btn-ghost text-sm cursor-pointer">← رجوع</button>
            <div>
              <h1 className="text-lg font-bold text-navy">{selectedProject.name}</h1>
              {selectedProject.description && <p className="text-sm text-muted">{selectedProject.description}</p>}
            </div>
          </div>
          {isManager && (
            <button onClick={() => handleTrashProject(selectedProject)} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-danger transition-colors hover:bg-danger/5">
              <TrashIcon size={16} /> نقل إلى سلة المهملات
            </button>
          )}
        </div>

        <div className="flex border-b border-tint-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${activeTab === tab.id ? "border-teal text-teal" : "border-transparent text-muted hover:text-navy"}`}>
                <Icon size={15} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-navy">{stats.totalTasks}</p>
                <p className="text-xs text-muted mt-1">إجمالي المهام</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-success">{stats.completedTasks}</p>
                <p className="text-xs text-muted mt-1">مكتملة</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-warning">{stats.inProgressTasks}</p>
                <p className="text-xs text-muted mt-1">قيد التنفيذ</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-teal">{stats.inReviewTasks}</p>
                <p className="text-xs text-muted mt-1">قيد المراجعة</p>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-sm font-semibold text-navy mb-3">التقدم</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-tint rounded-full h-3">
                  <div className="bg-teal h-3 rounded-full transition-all duration-500" style={{ width: `${stats.progress}%` }} />
                </div>
                <span className="text-lg font-bold text-navy">{stats.progress}%</span>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-danger" /><span className="text-xs text-muted">عالية: {stats.byPriority.HIGH}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-warning" /><span className="text-xs text-muted">متوسطة: {stats.byPriority.MEDIUM}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-teal" /><span className="text-xs text-muted">منخفضة: {stats.byPriority.LOW}</span></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "members" && (
          <div className="space-y-4">
            {isManager && (
              <button onClick={() => setShowAddMemberModal(true)} className="btn-primary text-sm flex items-center gap-1 cursor-pointer">
                <UserPlusIcon size={16} /> إضافة عضو
              </button>
            )}
            {members.length === 0 ? (
              <div className="card p-8 text-center"><UsersIcon size={32} className="text-muted/30 mx-auto mb-2" /><p className="text-muted">لا يوجد أعضاء</p></div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center"><span className="text-teal font-bold text-sm">{m.user.name.charAt(0)}</span></div>
                      <div><p className="text-sm font-semibold text-navy">{m.user.name}</p><p className="text-xs text-muted">{m.user.email}</p></div>
                    </div>
                    {isManager && m.user.role !== "ADMIN" && (
                      <button onClick={() => handleRemoveMember(m.user.id)} className="text-muted hover:text-danger transition-colors cursor-pointer p-2"><UserMinusIcon size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-3">
            {(!stats?.recentActivity || stats.recentActivity.length === 0) ? (
              <div className="card p-8 text-center"><ActivityIcon size={32} className="text-muted/30 mx-auto mb-2" /><p className="text-muted">لا يوجد نشاط حديث</p></div>
            ) : (
              stats.recentActivity.map((a) => (
                <div key={a.id} className="card p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center flex-shrink-0"><ActivityIcon size={14} className="text-teal" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy"><span className="font-semibold">{a.user.name}</span> {a.details || a.action}</p>
                    <p className="text-[10px] text-muted mt-0.5">{new Date(a.createdAt).toLocaleString("ar")}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {showAddMemberModal && (
          <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg animate-scale-in sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title text-base">إضافة عضو</h3>
                <button onClick={() => setShowAddMemberModal(false)} className="cursor-pointer"><XIcon size={18} className="text-muted" /></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {team.filter((t) => !members.some((m) => m.user.id === t.id)).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-tint transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center"><span className="text-teal text-xs font-bold">{t.name.charAt(0)}</span></div>
                      <span className="text-sm text-navy">{t.name}</span>
                    </div>
                    <button onClick={() => handleAddMember(t.id)} className="text-teal hover:bg-teal/10 p-1.5 rounded-lg transition-colors cursor-pointer"><UserPlusIcon size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">المشاريع</h1>
          <p className="page-subtitle">إدارة جميع مشاريع الفريق</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button onClick={() => setShowRepositoryModal(true)} className="btn-secondary relative flex items-center gap-2 cursor-pointer">
              <FolderIcon size={16} /> مستودع المشاريع
              {repositoryStats.available > 0 && <span className="badge-success">{repositoryStats.available}</span>}
            </button>
          )}
          {isManager && (
            <button onClick={() => setShowTrashModal(true)} className="btn-secondary relative flex items-center gap-2 cursor-pointer">
              <TrashIcon size={16} /> سلة المهملات
              {trashProjects.length > 0 && <span className="badge-danger">{trashProjects.length}</span>}
            </button>
          )}
          {isManager && (
            <button onClick={() => setShowTemplateModal(true)} className="btn-secondary flex items-center gap-2 cursor-pointer">
              <CopyIcon size={16} /> قوالب
            </button>
          )}
          {isManager && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2 cursor-pointer">
              <PlusIcon size={18} /> مشروع جديد
            </button>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-tint flex items-center justify-center mb-4"><FolderIcon size={28} className="text-muted/40" /></div>
            <p className="text-muted font-medium text-lg">لا توجد مشاريع حالياً</p>
            <p className="text-sm text-muted/60 mt-1 mb-6">ابدأ بإنشاء مشروع جديد</p>
            {isManager && (
              <button onClick={() => setShowCreateModal(true)} className="btn-secondary flex items-center gap-2 cursor-pointer"><PlusIcon size={16} /> إنشاء أول مشروع</button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const progress = getProgress(project);
            return (
              <div key={project.id} onClick={() => setSelectedProject(project)} className="card-hover p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-teal/10 flex items-center justify-center"><FolderIcon size={22} className="text-teal" /></div>
                  <span className="text-xs text-muted bg-tint px-2 py-0.5 rounded-full">{project.totalMembers} أعضاء</span>
                </div>
                <h3 className="text-base font-bold text-navy mb-1">{project.name}</h3>
                {(project.code || project.clientName) && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {project.code && <span dir="ltr" className="rounded-md bg-teal/10 px-2 py-1 font-semibold text-teal">{project.code}</span>}
                    {project.clientName && <span className="max-w-full truncate rounded-md bg-tint px-2 py-1 text-muted">{project.clientName}</span>}
                  </div>
                )}
                {project.description && <p className="text-sm text-muted line-clamp-2 mb-4">{project.description}</p>}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted">التقدم</span>
                    <span className="font-semibold text-navy">{progress}%</span>
                  </div>
                  <div className="w-full bg-tint rounded-full h-1.5">
                    <div className="bg-teal h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-warning" />{project.inProgressTasks} قيد التنفيذ</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal" />{project.inReviewTasks} قيد المراجعة</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success" />{project.completedTasks} مكتملة</span>
                </div>
                {project.deadline && (
                  <div className="mt-3 pt-3 border-t border-tint-200 flex items-center gap-1">
                    <ClockIcon size={12} className="text-muted" />
                    <span className="text-[11px] text-muted">الموعد النهائي: {new Date(project.deadline).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" })}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showRepositoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/35 p-3 backdrop-blur-sm animate-fade-in sm:p-5">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-soft-lg animate-scale-in sm:max-h-[calc(100dvh-2.5rem)]">
            <div className="border-b border-tint-200 p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10">
                      <FolderIcon size={20} className="text-teal" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-navy">مستودع المشاريع</h2>
                      <p className="text-xs text-muted">مزامنة المشاريع التي يبدأ كودها بـ P0 من ملف Master_Sheet_All_Projects في Dropbox</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={syncRepository}
                    disabled={repositoryBusy !== null}
                    className="btn-secondary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ActivityIcon size={16} />
                    {repositoryBusy === "syncing" ? "جارٍ المزامنة..." : "مزامنة Dropbox"}
                  </button>
                  <button
                    onClick={() => setShowRepositoryModal(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-tint"
                    aria-label="إغلاق"
                  >
                    <XIcon size={19} />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-lg">
                <div className="rounded-xl bg-tint p-3 text-center">
                  <p className="text-lg font-bold text-navy">{repositoryStats.total}</p>
                  <p className="text-[11px] text-muted">إجمالي المستودع</p>
                </div>
                <div className="rounded-xl bg-success/10 p-3 text-center">
                  <p className="text-lg font-bold text-success">{repositoryStats.available}</p>
                  <p className="text-[11px] text-muted">متاح للاستيراد</p>
                </div>
                <div className="rounded-xl bg-teal/10 p-3 text-center">
                  <p className="text-lg font-bold text-teal">{repositoryStats.imported}</p>
                  <p className="text-[11px] text-muted">تم استيراده</p>
                </div>
              </div>

              {repositoryMessage && (
                <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                  repositoryMessage.tone === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}>
                  {repositoryMessage.text}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  value={repositoryQuery}
                  onChange={(event) => setRepositoryQuery(event.target.value)}
                  className="input-field lg:max-w-sm"
                  placeholder="ابحث باسم المشروع أو الكود أو العميل..."
                />
                <div className="flex flex-wrap gap-2">
                  {([
                    ["AVAILABLE", "متاح"],
                    ["IMPORTED", "مستورد"],
                    ["ALL", "الكل"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setRepositoryFilter(value)}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                        repositoryFilter === value ? "bg-navy text-white" : "bg-tint text-muted hover:text-navy"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {repositoryBusy === "loading" && repositoryItems.length === 0 ? (
                <div className="flex min-h-48 items-center justify-center text-sm text-muted">جارٍ تحميل المستودع...</div>
              ) : visibleRepositoryItems.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <FolderIcon size={30} className="mb-3 text-muted/30" />
                  <p className="font-medium text-navy">{repositoryItems.length ? "لا توجد نتائج مطابقة" : "المستودع فارغ"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {repositoryItems.length ? "غيّر البحث أو الفلتر" : "اضغط مزامنة Dropbox لجلب المشاريع"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {repositoryFilter !== "IMPORTED" && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-tint-200 bg-tint/40 px-4 py-3 text-sm font-medium text-navy">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal"
                        checked={
                          visibleRepositoryItems.some((item) => !item.importedProjectId) &&
                          visibleRepositoryItems.filter((item) => !item.importedProjectId).every((item) => selectedRepositoryIds.includes(item.id))
                        }
                        onChange={(event) => {
                          const ids = visibleRepositoryItems.filter((item) => !item.importedProjectId).map((item) => item.id);
                          setSelectedRepositoryIds((current) =>
                            event.target.checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id))
                          );
                        }}
                      />
                      تحديد كل المشاريع الظاهرة والمتاحة ({visibleRepositoryItems.filter((item) => !item.importedProjectId).length})
                    </label>
                  )}

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {visibleRepositoryItems.map((item) => {
                      const imported = Boolean(item.importedProjectId);
                      const selected = selectedRepositoryIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex gap-3 rounded-xl border p-4 transition-colors ${
                            imported
                              ? "cursor-default border-tint-200 bg-tint/30"
                              : selected
                                ? "cursor-pointer border-teal bg-teal/5"
                                : "cursor-pointer border-tint-200 hover:border-teal/40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={imported}
                            checked={selected || imported}
                            className="mt-1 h-4 w-4 flex-shrink-0 accent-teal"
                            onChange={() =>
                              setSelectedRepositoryIds((current) =>
                                current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="font-semibold text-navy">{item.name}</p>
                              <span dir="ltr" className="rounded-md bg-navy/5 px-2 py-1 text-[11px] font-bold text-navy">{item.code}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                              {item.clientName && <span className="truncate">{item.clientName}</span>}
                              {item.clientCode && <span dir="ltr" className="rounded bg-tint px-1.5 py-0.5">{item.clientCode}</span>}
                              {item.projectStatus && <span className="rounded bg-tint px-1.5 py-0.5">{item.projectStatus}</span>}
                            </div>
                            {imported && (
                              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success">
                                <CheckIcon size={13} />
                                {item.importedProject?.deletedAt ? "مرتبط بمشروع في سلة المهملات" : "مضاف إلى المشاريع النشطة"}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-tint-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-muted">
                تم تحديد <span className="font-bold text-navy">{selectedRepositoryIds.length}</span> مشروع
              </p>
              <button
                onClick={importRepositoryProjects}
                disabled={!selectedRepositoryIds.length || repositoryBusy !== null}
                className="btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon size={17} />
                {repositoryBusy === "importing" ? "جارٍ الاستيراد..." : "إضافة إلى المشاريع النشطة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg animate-scale-in sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title text-base">قوالب المشاريع</h3>
              <button onClick={() => setShowTemplateModal(false)} className="cursor-pointer"><XIcon size={18} className="text-muted" /></button>
            </div>
            {templates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted mb-4">لا توجد قوالب بعد</p>
                <button onClick={() => { setShowTemplateModal(false); setShowCreateModal(true); }} className="btn-secondary text-sm cursor-pointer">إنشاء مشروع وحفظه كقالب</button>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-tint transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-navy">{t.name}</p>
                      <p className="text-xs text-muted">{t.description || "بدون وصف"}</p>
                    </div>
                    <button onClick={() => handleUseTemplate(t)} className="btn-ghost text-xs cursor-pointer">استخدام</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showTrashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4 backdrop-blur-sm animate-fade-in">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg animate-scale-in sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="section-title text-base">سلة مهملات المشاريع</h3>
                <p className="mt-1 text-xs text-muted">يمكن استعادة المشروع مع جميع مهامه وأعضائه</p>
              </div>
              <button onClick={() => setShowTrashModal(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-tint"><XIcon size={18} /></button>
            </div>
            {trashProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tint"><TrashIcon size={23} className="text-muted/40" /></div>
                <p className="font-medium text-navy">سلة المهملات فارغة</p>
                <p className="mt-1 text-xs text-muted">المشاريع المحذوفة ستظهر هنا</p>
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {trashProjects.map((project) => (
                  <div key={project.id} className="flex flex-col gap-3 rounded-xl border border-tint-200 p-4 sm:flex-row sm:items-center">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-danger/10"><FolderIcon size={19} className="text-danger" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{project.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {project.totalTasks} مهام · {project.totalMembers} أعضاء
                        {project.deletedAt && ` · حُذف ${new Date(project.deletedAt).toLocaleDateString("ar")}`}
                      </p>
                    </div>
                    <button onClick={() => handleRestoreProject(project)} className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-4 py-2 text-sm font-medium text-success hover:bg-success/15">
                      <CheckIcon size={16} /> استعادة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg animate-scale-in sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="section-title">إنشاء مشروع جديد</h2>
              <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 rounded-lg hover:bg-tint flex items-center justify-center text-muted transition-colors cursor-pointer"><XIcon size={18} /></button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="label">اسم المشروع</label>
                <input type="text" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} className="input-field" placeholder="مثال: موقع InterVia" required />
              </div>
              <div>
                <label className="label">الوصف (اختياري)</label>
                <textarea value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} className="input-field min-h-[80px] resize-none" placeholder="وصف مختصر للمشروع..." />
              </div>
              <div>
                <label className="label">الموعد النهائي (اختياري)</label>
                <input type="date" value={newProject.deadline} onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })} className="input-field" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">إنشاء المشروع</button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
