import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/utils";

const THEMES = ["LIGHT", "DARK", "SYSTEM"];
const TIMEZONES = ["Asia/Hebron", "Asia/Jerusalem", "Asia/Amman", "Asia/Riyadh", "Asia/Qatar", "Asia/Dubai"];

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const [user, personal, system] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { id: true, name: true, email: true, country: true, timezone: true, locale: true, role: true },
      }),
      prisma.userSettings.upsert({
        where: { userId: auth.userId },
        create: { userId: auth.userId },
        update: {},
      }),
      prisma.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {},
      }),
    ]);

    if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    return NextResponse.json({
      profile: user,
      personal,
      system: auth.role === "ADMIN" ? { ...system, workingDays: JSON.parse(system.workingDays) } : null,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json({ error: "تعذر تحميل الإعدادات" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const section = body.section;

    if (section === "profile") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const country = String(body.country || "").trim();
      const timezone = String(body.timezone || "");
      if (name.length < 2 || !email.includes("@") || country.length < 2 || !TIMEZONES.includes(timezone)) {
        return NextResponse.json({ error: "يرجى إدخال بيانات حساب صحيحة" }, { status: 400 });
      }
      const duplicate = await prisma.user.findFirst({ where: { email, id: { not: auth.userId } }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقًا" }, { status: 409 });
      const profile = await prisma.user.update({
        where: { id: auth.userId },
        data: { name, email, country, timezone },
        select: { id: true, name: true, email: true, country: true, timezone: true, locale: true, role: true },
      });
      await createAuditLog(auth.userId, "UPDATE_PROFILE", "User", auth.userId, "تحديث بيانات الحساب");
      return NextResponse.json({ profile, message: "تم حفظ بيانات الحساب" });
    }

    if (section === "personal") {
      const theme = String(body.theme || "LIGHT");
      if (!THEMES.includes(theme)) return NextResponse.json({ error: "نمط الواجهة غير صالح" }, { status: 400 });
      const personal = await prisma.userSettings.upsert({
        where: { userId: auth.userId },
        create: {
          userId: auth.userId,
          theme,
          compactMode: Boolean(body.compactMode),
          reducedMotion: Boolean(body.reducedMotion),
          notifyTasks: body.notifyTasks !== false,
          notifyProjects: body.notifyProjects !== false,
          notifyRequests: body.notifyRequests !== false,
          notifyAttendance: body.notifyAttendance !== false,
          notifySystem: body.notifySystem !== false,
        },
        update: {
          theme,
          compactMode: Boolean(body.compactMode),
          reducedMotion: Boolean(body.reducedMotion),
          notifyTasks: body.notifyTasks !== false,
          notifyProjects: body.notifyProjects !== false,
          notifyRequests: body.notifyRequests !== false,
          notifyAttendance: body.notifyAttendance !== false,
          notifySystem: body.notifySystem !== false,
        },
      });
      return NextResponse.json({ personal, message: "تم حفظ تفضيلاتك" });
    }

    if (section === "system") {
      if (auth.role !== "ADMIN") return NextResponse.json({ error: "هذه الإعدادات لمدير النظام فقط" }, { status: 403 });
      const organizationName = String(body.organizationName || "").trim();
      const timezone = String(body.timezone || "");
      const dailyWorkHours = Number(body.dailyWorkHours);
      const workStartMinutes = Number(body.workStartMinutes);
      const lateGraceMinutes = Number(body.lateGraceMinutes);
      const earlyCheckInMinutes = Number(body.earlyCheckInMinutes);
      const autoCloseHour = Number(body.autoCloseHour);
      const hourlyCheckInterval = Number(body.hourlyCheckInterval);
      const hourlyCheckWindow = Number(body.hourlyCheckWindow);
      const overtimeMaxHours = Number(body.overtimeMaxHours);
      const annualLeaveDays = Number(body.annualLeaveDays);
      const projectTrashRetentionDays = Number(body.projectTrashRetentionDays);
      const workingDays = Array.isArray(body.workingDays)
        ? body.workingDays.map(Number).filter((day: number) => day >= 0 && day <= 6)
        : [];
      if (
        organizationName.length < 2 || !TIMEZONES.includes(timezone) ||
        dailyWorkHours < 1 || dailyWorkHours > 16 || workStartMinutes < 0 || workStartMinutes > 1439 ||
        lateGraceMinutes < 0 || lateGraceMinutes > 120 || earlyCheckInMinutes < 0 || earlyCheckInMinutes > 240 ||
        autoCloseHour < 1 || autoCloseHour > 23 || hourlyCheckInterval < 15 || hourlyCheckInterval > 240 ||
        hourlyCheckWindow < 5 || hourlyCheckWindow > 120 || overtimeMaxHours < 1 || overtimeMaxHours > 24 ||
        annualLeaveDays < 0 || annualLeaveDays > 90 || projectTrashRetentionDays < 1 ||
        projectTrashRetentionDays > 365 || workingDays.length === 0
      ) {
        return NextResponse.json({ error: "بعض قيم سياسة العمل خارج النطاق المسموح" }, { status: 400 });
      }
      const system = await prisma.systemSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default", organizationName, timezone, dailyWorkHours, workStartMinutes, lateGraceMinutes, earlyCheckInMinutes, autoCloseHour, hourlyCheckInterval, hourlyCheckWindow,
          overtimeMaxHours, annualLeaveDays, projectTrashRetentionDays, workingDays: JSON.stringify(workingDays),
        },
        update: {
          organizationName, timezone, dailyWorkHours, workStartMinutes, lateGraceMinutes, earlyCheckInMinutes, autoCloseHour, hourlyCheckInterval, hourlyCheckWindow,
          overtimeMaxHours, annualLeaveDays, projectTrashRetentionDays, workingDays: JSON.stringify(workingDays),
        },
      });
      await createAuditLog(auth.userId, "UPDATE_SYSTEM_SETTINGS", "SystemSettings", "default", "تحديث سياسات المؤسسة والدوام");
      return NextResponse.json({ system: { ...system, workingDays }, message: "تم حفظ إعدادات المؤسسة" });
    }

    return NextResponse.json({ error: "قسم الإعدادات غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "تعذر حفظ الإعدادات" }, { status: 500 });
  }
}
