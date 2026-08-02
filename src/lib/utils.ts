import { prisma } from "./prisma";

export function getTodayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getTodayDateForTimezone(timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
}

export function getLocalTime(timezone: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
}

export async function getTodayAttendance(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = getTodayDateForTimezone(user?.timezone || "Asia/Hebron");
  return prisma.attendance.findUnique({
    where: { userId_date: { userId, date: today } },
    include: { hourlyChecks: { orderBy: { scheduledAt: "asc" } } },
  });
}

export async function calculateTotalHours(attendanceId: string) {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { hourlyChecks: true },
  });

  if (!attendance) return 0;

  const deductedChecks = attendance.hourlyChecks.filter((c) => c.isDeducted).length;

  const totalScheduled = attendance.hourlyChecks.length;
  if (totalScheduled === 0) return 0;

  const effectiveHours = Math.max(0, totalScheduled - deductedChecks);
  return effectiveHours;
}

export async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: string
) {
  return prisma.auditLog.create({
    data: { userId, action, entity, entityId, details },
  });
}

export interface NotificationInput {
  userId: string;
  type: string;
  audience: "USER" | "EMPLOYEE" | "MANAGEMENT" | "ADMIN";
  title: string;
  message: string;
  severity?: "INFO" | "SUCCESS" | "WARNING" | "DANGER";
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  expiresAt?: Date;
}

function notificationPreference(type: string) {
  const normalized = type.toUpperCase();
  if (normalized.startsWith("TASK_") || normalized === "TASK_COMMENT") return "notifyTasks" as const;
  if (normalized.startsWith("PROJECT_")) return "notifyProjects" as const;
  if (normalized.startsWith("LEAVE_") || normalized.startsWith("OVERTIME_") || normalized.startsWith("SUBMISSION_")) return "notifyRequests" as const;
  if (normalized.startsWith("ATTENDANCE_") || normalized.startsWith("HOURLY_")) return "notifyAttendance" as const;
  return "notifySystem" as const;
}

export async function createNotification(input: NotificationInput) {
  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      role: true,
      isActive: true,
      settings: {
        select: {
          notifyTasks: true,
          notifyProjects: true,
          notifyRequests: true,
          notifyAttendance: true,
          notifySystem: true,
        },
      },
    },
  });
  if (!recipient?.isActive) return null;

  const audienceRoles = {
    USER: ["EMPLOYEE", "MANAGER", "ADMIN"],
    EMPLOYEE: ["EMPLOYEE"],
    MANAGEMENT: ["MANAGER", "ADMIN"],
    ADMIN: ["ADMIN"],
  };
  if (!audienceRoles[input.audience].includes(recipient.role)) return null;

  const preference = notificationPreference(input.type);
  if (recipient.settings && !recipient.settings[preference]) return null;

  if (input.entityId) {
    const duplicate = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        entityId: input.entityId,
        createdAt: { gte: new Date(Date.now() - 8000) },
      },
      select: { id: true },
    });
    if (duplicate) return null;
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      audience: input.audience,
      title: input.title,
      message: input.message,
      severity: input.severity || "INFO",
      entityType: input.entityType,
      entityId: input.entityId,
      actionUrl: input.actionUrl,
      expiresAt: input.expiresAt,
    },
  });
}

export async function notifyAdmins(input: Omit<NotificationInput, "userId" | "audience">, excludeUserId?: string) {
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      role: "ADMIN",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return Promise.all(admins.map((admin) => createNotification({ ...input, userId: admin.id, audience: "ADMIN" })));
}
