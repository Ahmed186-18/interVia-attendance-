"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  PlusIcon,
  CheckSquareIcon,
  SearchIcon,
  MessageIcon,
  ListIcon,
  TimerIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  XIcon,
  TrashIcon,
  FolderIcon,
  GripVerticalIcon,
} from "@/components/icons";
import SelectField from "@/components/ui/select";

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

interface TaskComment {
  id: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
}

interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  note: string | null;
  user: { id: string; name: string };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  executionOrder: number;
  deadline: string | null;
  project: { id: string; name: string };
  assignee: { id: string; name: string };
  creator: { id: string; name: string };
  _count: { comments: number; subtasks: number; timeEntries: number };
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

const columns = [
  { title: "قيد التنفيذ", status: "IN_PROGRESS", dotColor: "bg-warning" },
  { title: "قيد المراجعة", status: "IN_REVIEW", dotColor: "bg-teal" },
  { title: "مكتملة", status: "COMPLETED", dotColor: "bg-success" },
];

const executionTones = [
  { card: "border-r-4 border-r-danger bg-danger/[0.035]", badge: "bg-danger text-white" },
  { card: "border-r-4 border-r-warning bg-warning/[0.04]", badge: "bg-warning text-white" },
  { card: "border-r-4 border-r-teal bg-teal/[0.035]", badge: "bg-teal text-white" },
  { card: "border-r-4 border-r-navy-300 bg-navy-50/35", badge: "bg-navy-300 text-white" },
];

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const tasksRequestRef = useRef<AbortController | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: "", description: "", projectId: "", assigneeId: "", deadline: "",
  });

  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  const fetchTasks = useCallback(async (silent = false) => {
    if (authLoading || !user) return;
    tasksRequestRef.current?.abort();
    const controller = new AbortController();
    tasksRequestRef.current = controller;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (filterProject) params.set("projectId", filterProject);
      if (filterAssignee) params.set("assigneeId", filterAssignee);
      if (!isManager) params.set("view", "my");

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تحميل المهام");
      if (tasksRequestRef.current !== controller) return;
      setTasks(data.tasks || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Error fetching tasks:", error);
    } finally {
      if (tasksRequestRef.current === controller) setLoading(false);
    }
  }, [authLoading, user, searchQuery, filterProject, filterAssignee, isManager]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {}
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      setTeam(data.users || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const timer = window.setTimeout(() => void fetchTasks(), searchQuery ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, user, fetchTasks, searchQuery]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchProjects();
    if (isManager) fetchTeam();
  }, [authLoading, user, fetchProjects, fetchTeam, isManager]);

  useEffect(() => {
    if (authLoading || !user) return;
    const refresh = () => void fetchTasks(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      tasksRequestRef.current?.abort();
    };
  }, [authLoading, user, fetchTasks]);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (!taskId || tasks.length === 0) return;
    const linkedTask = tasks.find((task) => task.id === taskId);
    if (linkedTask) setSelectedTask(linkedTask);
  }, [tasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewTask({ title: "", description: "", projectId: "", assigneeId: "", deadline: "" });
        await fetchTasks(true);
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch { alert("حدث خطأ"); }
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (res.ok) fetchTasks();
    } catch { alert("حدث خطأ"); }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!window.confirm(`هل تريد حذف المهمة "${task.title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      const response = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حذف المهمة");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedTask(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حذف المهمة");
    }
  };

  const handleDragStart = (taskId: string) => setDraggedTask(taskId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (draggedTask) {
      handleMoveTask(draggedTask, newStatus);
      setDraggedTask(null);
    }
  };

  const canReorderExecution =
    (!isManager || Boolean(filterAssignee)) &&
    !searchQuery &&
    !filterProject;

  const handleReorderDrop = async (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTask || targetTask.status !== "IN_PROGRESS") return;
    const sourceTask = tasks.find((task) => task.id === draggedTask);
    if (!sourceTask) return;
    if (sourceTask.status !== "IN_PROGRESS") {
      setDraggedTask(null);
      handleMoveTask(sourceTask.id, "IN_PROGRESS");
      return;
    }
    if (!canReorderExecution) return;
    if (sourceTask.assignee.id !== targetTask.assignee.id) return;

    const ordered = getTasksForStatus("IN_PROGRESS");
    const sourceIndex = ordered.findIndex((task) => task.id === sourceTask.id);
    const targetIndex = ordered.findIndex((task) => task.id === targetTask.id);
    if (sourceIndex === targetIndex) { setDraggedTask(null); return; }
    const next = [...ordered];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    const nextIds = new Set(next.map((task) => task.id));
    setTasks((current) => [...next.map((task, index) => ({ ...task, executionOrder: index + 1 })), ...current.filter((task) => !nextIds.has(task.id))]);
    setDraggedTask(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: next.map((task, index) => ({ id: task.id, executionOrder: index + 1 })) }),
      });
      if (!response.ok) throw new Error("تعذر حفظ ترتيب المهام");
    } catch {
      alert("تعذر حفظ الترتيب، تمت استعادة الترتيب السابق");
      fetchTasks();
    }
  };

  const getTasksForStatus = (status: string) =>
    tasks.filter((t) => t.status === status);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ar", { month: "short", day: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><div className="skeleton-heading" /><div className="skeleton-text mt-2 w-48" /></div>
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-5 w-24 rounded-md" />
              {[1, 2].map((j) => <div key={j} className="skeleton-card" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="page-title">المهام</h1>
          <p className="page-subtitle">{isManager ? "إدارة جميع مهام الفريق" : "المهام المسندة إليك"}</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <PlusIcon size={18} /> {isManager ? "مهمة جديدة" : "إضافة مهمة لنفسي"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 basis-full sm:min-w-[200px] sm:max-w-md sm:flex-1">
          <SearchIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pr-10 text-sm"
            placeholder="بحث بالعنوان أو الوصف..."
          />
        </div>
        {isManager && projects.length > 0 && (
          <SelectField
            value={filterProject}
            onChange={setFilterProject}
            options={[
              { value: "", label: "كل المشاريع" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            className="w-full sm:w-auto sm:min-w-[160px]"
          />
        )}
        {isManager && (
          <SelectField
            value={filterAssignee}
            onChange={setFilterAssignee}
            options={[
              { value: "", label: "كل الموظفين" },
              ...team.map((member) => ({ value: member.id, label: member.name })),
            ]}
            className="w-full sm:w-auto sm:min-w-[160px]"
          />
        )}
        {(searchQuery || filterProject || filterAssignee) && (
          <button
            onClick={() => { setSearchQuery(""); setFilterProject(""); setFilterAssignee(""); }}
            className="btn-ghost text-sm flex items-center gap-1 text-danger"
          >
            <XIcon size={14} /> مسح الفلتر
          </button>
        )}
      </div>

      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
        canReorderExecution ? "border-teal/20 bg-teal/5 text-teal" : "border-tint-200 bg-white text-muted"
      }`}>
        <GripVerticalIcon size={15} />
        {canReorderExecution
          ? "يمكنك سحب مهام «قيد التنفيذ» للأعلى والأسفل لتحديد ترتيب تنفيذها."
          : isManager && !filterAssignee
            ? "اختر موظفاً أولاً لتتمكن من ترتيب تسلسل تنفيذ مهامه."
            : "امسح فلتر البحث والمشروع لتعديل ترتيب التنفيذ."}
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-1 sm:px-0 lg:grid-cols-3 lg:gap-6">
        {columns.map((col) => {
          const colTasks = getTasksForStatus(col.status);
          return (
            <div
              key={col.status}
              className="flex w-[86vw] max-w-sm flex-none snap-start flex-col sm:w-auto sm:max-w-none"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                <h3 className="text-sm font-semibold text-navy">{col.title}</h3>
                <span className="text-xs text-muted bg-tint px-2 py-0.5 rounded-full">{colTasks.length}</span>
              </div>
              <div className="space-y-3 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 rounded-2xl border-2 border-dashed border-tint-200">
                    <CheckSquareIcon size={24} className="text-muted/30 mb-2" />
                    <p className="text-xs text-muted/50">لا توجد مهام</p>
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const executionRank = task.status === "IN_PROGRESS"
                      ? colTasks.filter((item) => item.assignee.id === task.assignee.id).findIndex((item) => item.id === task.id) + 1
                      : 0;
                    const tone = executionRank > 0
                      ? executionTones[Math.min(executionRank - 1, executionTones.length - 1)]
                      : null;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onDragEnd={() => setDraggedTask(null)}
                        onDragOver={task.status === "IN_PROGRESS" ? handleDragOver : undefined}
                        onDrop={task.status === "IN_PROGRESS" ? (event) => handleReorderDrop(event, task) : undefined}
                        onClick={() => setSelectedTask(task)}
                        className={`card cursor-pointer p-3 transition-all duration-200 hover:shadow-soft-md ${tone?.card || ""} ${draggedTask === task.id ? "scale-95 opacity-50" : ""}`}
                      >
                        <div className="mb-1.5 flex items-start justify-between">
                          {task.status === "IN_PROGRESS" && (
                            <span title={canReorderExecution ? "اسحب لترتيب التنفيذ" : `ترتيب التنفيذ للموظف: ${executionRank}`} className={`ml-2 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-bold shadow-sm ${tone?.badge}`}>
                              {canReorderExecution && <GripVerticalIcon size={12} />}
                              {executionRank}
                            </span>
                          )}
                          <h4 className="text-sm font-semibold text-navy leading-tight flex-1">{task.title}</h4>
                          {task.deadline && (
                            <span className="mr-2 whitespace-nowrap rounded-full bg-tint px-1.5 py-0.5 text-[9px] text-muted">
                              {formatDate(task.deadline)}
                            </span>
                          )}
                          {(isManager || task.assignee.id === user?.id || task.creator.id === user?.id) && (
                            <button
                              type="button"
                              title="حذف المهمة"
                              onClick={(event) => { event.stopPropagation(); void handleDeleteTask(task); }}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="mr-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                            >
                              <TrashIcon size={13} />
                            </button>
                          )}
                        </div>
                        {task.description && (
                          <p className="mb-2 line-clamp-1 text-[11px] leading-5 text-muted">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-teal/10">
                              <span className="text-teal text-[10px] font-bold">{task.assignee.name.charAt(0)}</span>
                            </div>
                            <span className="text-[10px] text-muted">{task.assignee.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted">
                            {task._count.subtasks > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px]">
                                <ListIcon size={12} /> {task._count.subtasks}
                              </span>
                            )}
                            {task._count.comments > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px]">
                                <MessageIcon size={12} /> {task._count.comments}
                              </span>
                            )}
                          </div>
                        </div>
                        {task.project && (
                          <div className="mt-1.5 flex items-center gap-1 border-t border-tint-200 pt-1.5">
                            <FolderIcon size={12} className="text-muted" />
                            <span className="text-[10px] text-muted">{task.project.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          canDelete={Boolean(isManager || selectedTask.assignee.id === user?.id || selectedTask.creator.id === user?.id)}
          onDelete={() => void handleDeleteTask(selectedTask)}
        />
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-soft-lg animate-scale-in sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="section-title">إنشاء مهمة جديدة</h2>
              <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 rounded-lg hover:bg-tint flex items-center justify-center text-muted transition-colors cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="label">عنوان المهمة</label>
                <input type="text" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} className="input-field" placeholder="مثال: تصميم الصفحة الرئيسية" required />
              </div>
              <div>
                <label className="label">الوصف (اختياري)</label>
                <textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} className="input-field min-h-[80px] resize-none" placeholder="تفاصيل المهمة..." />
              </div>
              <div className={`grid gap-4 ${isManager ? "sm:grid-cols-2" : ""}`}>
                <div>
                  <label className="label">المشروع</label>
                  <SelectField
                    value={newTask.projectId}
                    onChange={(val) => setNewTask({ ...newTask, projectId: val })}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="اختر مشروع"
                    required
                  />
                </div>
                {isManager && <div>
                  <label className="label">الموظف</label>
                  <SelectField
                    value={newTask.assigneeId}
                    onChange={(val) => setNewTask({ ...newTask, assigneeId: val })}
                    options={team.map((u) => ({ value: u.id, label: u.name }))}
                    placeholder="اختر موظف"
                    required
                  />
                </div>}
              </div>
              <div>
                <label className="label">الموعد النهائي</label>
                <input type="date" value={newTask.deadline} onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} className="input-field" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">إنشاء المهمة</button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskDetailModal({ task, onClose, canDelete, onDelete }: { task: Task; onClose: () => void; canDelete: boolean; onDelete: () => void }) {
  const [activeTab, setActiveTab] = useState<"details" | "subtasks" | "comments" | "time">("details");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newTimeNote, setNewTimeNote] = useState("");
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatDate = (date: string) => new Date(date).toLocaleDateString("ar", { month: "short", day: "numeric" });

  const fetchSubtasks = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/subtasks`);
    const data = await res.json();
    setSubtasks(data.subtasks || []);
  }, [task.id]);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/comments`);
    const data = await res.json();
    setComments(data.comments || []);
  }, [task.id]);

  const fetchTimeEntries = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/time`);
    const data = await res.json();
    setTimeEntries(data.entries || []);
  }, [task.id]);

  useEffect(() => {
    fetchSubtasks(); fetchComments(); fetchTimeEntries();
  }, [fetchSubtasks, fetchComments, fetchTimeEntries]);

  useEffect(() => {
    if (activeTimer) {
      timerRef.current = setInterval(() => setTimerElapsed((p) => p + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [activeTimer]);

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newSubtask }),
    });
    setNewSubtask(""); fetchSubtasks();
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subtaskId, completed: !completed }),
    });
    fetchSubtasks();
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subtaskId }),
    });
    fetchSubtasks();
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: newComment }),
    });
    setNewComment(""); fetchComments();
  };

  const handleStartTimer = async () => {
    const res = await fetch(`/api/tasks/${task.id}/time`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: newTimeNote }),
    });
    const data = await res.json();
    if (data.entry) { setActiveTimer(data.entry.id); setTimerElapsed(0); setNewTimeNote(""); }
  };

  const handleStopTimer = async () => {
    if (!activeTimer) return;
    await fetch(`/api/tasks/${task.id}/time`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeTimer }),
    });
    setActiveTimer(null); setTimerElapsed(0); fetchTimeEntries();
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

  const tabs = [
    { id: "details" as const, label: "التفاصيل", icon: CheckSquareIcon },
    { id: "subtasks" as const, label: `المهام الفرعية (${subtasks.length})`, icon: ListIcon },
    { id: "comments" as const, label: `التعليقات (${comments.length})`, icon: MessageIcon },
    { id: "time" as const, label: "تتبع الوقت", icon: TimerIcon },
  ];

  return (
    <div className="fixed inset-0 bg-navy/30 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-soft-lg animate-scale-in sm:max-h-[85vh]">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-tint-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-navy truncate">{task.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted">{task.project.name}</span>
              <span className="text-xs text-muted">← {task.assignee.name}</span>
            </div>
          </div>
          <div className="ml-3 flex items-center gap-1">
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-danger transition-colors hover:bg-danger/10"
              >
                <TrashIcon size={14} /> حذف
              </button>
            )}
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-tint cursor-pointer">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b border-tint-200 px-3 sm:px-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-max items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors cursor-pointer sm:px-4 sm:text-sm ${
                  activeTab === tab.id ? "border-teal text-teal" : "border-transparent text-muted hover:text-navy"
                }`}
              >
                <Icon size={15} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "details" && (
            <div className="space-y-4">
              {task.description && (
                <div><p className="text-sm text-muted mb-1">الوصف</p><p className="text-sm text-navy leading-relaxed">{task.description}</p></div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted mb-1">الحالة</p><p className="text-sm font-medium text-navy">{columns.find(c => c.status === task.status)?.title || task.status}</p></div>
                <div><p className="text-xs text-muted mb-1">المنشئ</p><p className="text-sm text-navy">{task.creator.name}</p></div>
                <div><p className="text-xs text-muted mb-1">الموعد النهائي</p><p className="text-sm text-navy">{task.deadline ? formatDate(task.deadline) : "—"}</p></div>
              </div>
            </div>
          )}

          {activeTab === "subtasks" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()} className="input-field text-sm flex-1" placeholder="إضافة مهمة فرعية..." />
                <button onClick={handleAddSubtask} className="btn-primary text-sm px-4">إضافة</button>
              </div>
              {subtasks.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">لا توجد مهام فرعية</p>
              ) : (
                subtasks.map((st) => (
                  <div key={st.id} className="flex items-center gap-3 p-3 rounded-xl bg-tint/30 hover:bg-tint/50 transition-colors group">
                    <button onClick={() => handleToggleSubtask(st.id, st.completed)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${st.completed ? "bg-success border-success text-white" : "border-muted/30 hover:border-teal"}`}>
                      {st.completed && <CheckIcon size={12} />}
                    </button>
                    <span className={`text-sm flex-1 ${st.completed ? "line-through text-muted" : "text-navy"}`}>{st.title}</span>
                    <button onClick={() => handleDeleteSubtask(st.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all cursor-pointer">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "comments" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddComment()} className="input-field text-sm flex-1" placeholder="اكتب تعليقاً..." />
                <button onClick={handleAddComment} className="btn-primary text-sm px-4">إرسال</button>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">لا توجد تعليقات</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="p-3 rounded-xl bg-tint/30">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-teal/10 flex items-center justify-center"><span className="text-teal text-[10px] font-bold">{c.author.name.charAt(0)}</span></div>
                      <span className="text-xs font-semibold text-navy">{c.author.name}</span>
                      <span className="text-[10px] text-muted">{new Date(c.createdAt).toLocaleDateString("ar")}</span>
                    </div>
                    <p className="text-sm text-navy mr-8">{c.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "time" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-tint/30">
                {activeTimer ? (
                  <>
                    <div className="text-2xl font-mono font-bold text-teal">{formatDuration(timerElapsed)}</div>
                    <button onClick={handleStopTimer} className="btn-danger text-sm flex items-center gap-1 cursor-pointer"><PauseIcon size={14} /> إيقاف</button>
                  </>
                ) : (
                  <>
                    <input value={newTimeNote} onChange={(e) => setNewTimeNote(e.target.value)} className="input-field text-sm flex-1" placeholder="ملاحظة (اختياري)" />
                    <button onClick={handleStartTimer} className="btn-primary text-sm flex items-center gap-1 cursor-pointer"><PlayIcon size={14} /> بدء</button>
                  </>
                )}
              </div>
              {timeEntries.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">لا توجد سجلات وقت</p>
              ) : (
                <div className="space-y-2">
                  {timeEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-tint/30">
                      <div>
                        <p className="text-sm text-navy">{entry.user.name}</p>
                        <p className="text-[10px] text-muted">{new Date(entry.startedAt).toLocaleString("ar")}{entry.endedAt ? ` — ${new Date(entry.endedAt).toLocaleTimeString("ar")}` : " — نشط"}</p>
                      </div>
                      <span className="text-sm font-semibold text-teal">{entry.duration ? formatHours(entry.duration) : "..."}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
