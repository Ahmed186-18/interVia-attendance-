import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/utils";

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const requestedIds: string[] = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    const ids = Array.from(new Set(requestedIds)).slice(0, 200);
    if (!ids.length) return NextResponse.json({ error: "اختر مشروعاً واحداً على الأقل" }, { status: 400 });

    const [items, existingProjects] = await Promise.all([
      prisma.projectRepositoryItem.findMany({
        where: { id: { in: ids }, isAvailable: true },
        orderBy: { code: "asc" },
      }),
      prisma.project.findMany({ select: { id: true, code: true, name: true, deletedAt: true } }),
    ]);
    const byCode = new Map(existingProjects.filter((project) => project.code).map((project) => [project.code!, project]));
    const byName = new Map(existingProjects.map((project) => [normalize(project.name), project]));
    let created = 0;
    let linked = 0;

    for (const item of items) {
      let project = byCode.get(item.code) || byName.get(normalize(item.name));
      if (project) {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            deletedAt: null,
            code: project.code || item.code,
            clientName: item.clientName,
            clientCode: item.clientCode,
          },
        });
        linked++;
      } else {
        project = await prisma.project.create({
          data: {
            name: item.name,
            code: item.code,
            clientName: item.clientName,
            clientCode: item.clientCode,
            description: [
              `مستورد من Master Sheet (${item.code})`,
              item.clientName ? `العميل: ${item.clientName}` : null,
            ].filter(Boolean).join(" · "),
          },
          select: { id: true, code: true, name: true, deletedAt: true },
        });
        byCode.set(item.code, project);
        byName.set(normalize(item.name), project);
        created++;
      }
      await prisma.projectRepositoryItem.update({
        where: { id: item.id },
        data: { importedProjectId: project.id, importedAt: new Date() },
      });
    }

    await createAuditLog(
      auth.userId,
      "IMPORT_REPOSITORY_PROJECTS",
      "Project",
      undefined,
      `إضافة ${created} مشروع جديد وربط ${linked} مشروع موجود من المستودع`
    );
    return NextResponse.json({
      message: created
        ? `تمت إضافة ${created} مشروع للمشاريع النشطة${linked ? ` وربط ${linked} مشروع موجود` : ""}`
        : `تم ربط ${linked} مشروع موجود بالمستودع`,
      created,
      linked,
    });
  } catch (error) {
    console.error("Import repository projects error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "تعذر استيراد المشاريع",
    }, { status: 500 });
  }
}
