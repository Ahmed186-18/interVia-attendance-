import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  downloadDropboxFile,
  DropboxIntegrationError,
  findDropboxFileByName,
  isDropboxConfigured,
} from "@/lib/dropbox";
import { readXlsxSheet } from "@/lib/xlsx-reader";
import { createAuditLog } from "@/lib/utils";

export const dynamic = "force-dynamic";

function requireAdmin(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "ADMIN") {
    return NextResponse.json({ error: "مستودع المشاريع متاح للأدمن فقط" }, { status: 403 });
  }
  return auth;
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  const result = String(value).replace(/\s+/g, " ").trim();
  return result && !result.includes("#VALUE!") ? result : null;
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const query = String(params.get("q") || "").trim();
  const status = params.get("status") || "AVAILABLE";

  const where = {
    isAvailable: true,
    ...(status === "AVAILABLE" ? { importedProjectId: null } : status === "IMPORTED" ? { importedProjectId: { not: null } } : {}),
    ...(query ? {
      OR: [
        { name: { contains: query } },
        { code: { contains: query } },
        { clientName: { contains: query } },
        { clientCode: { contains: query } },
      ],
    } : {}),
  };
  const [items, available, imported, total] = await Promise.all([
    prisma.projectRepositoryItem.findMany({
      where,
      include: { importedProject: { select: { id: true, name: true, deletedAt: true } } },
      orderBy: { code: "desc" },
      take: 500,
    }),
    prisma.projectRepositoryItem.count({ where: { isAvailable: true, importedProjectId: null } }),
    prisma.projectRepositoryItem.count({ where: { isAvailable: true, importedProjectId: { not: null } } }),
    prisma.projectRepositoryItem.count({ where: { isAvailable: true } }),
  ]);
  return NextResponse.json({ items, stats: { available, imported, total } });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  if (!(await isDropboxConfigured())) {
    return NextResponse.json({ error: "اربط Dropbox أولاً من الإعدادات" }, { status: 503 });
  }

  try {
    const file = await findDropboxFileByName("Master_Sheet_All_Projects");
    if (!file) {
      return NextResponse.json({ error: "لم يتم العثور على ملف Master_Sheet_All_Projects.xlsx" }, { status: 404 });
    }
    const workbook = await downloadDropboxFile(file.id);
    const rows = readXlsxSheet(workbook, "Projects");
    const headers = rows[0].map((value) => text(value) || "");
    const index = (name: string) => headers.indexOf(name);
    const records = rows.slice(1).flatMap((row, rowIndex) => {
      const code = text(row[index("Project Code")]);
      const name = text(row[index("Project Name")]);
      if (!code || !/^P\d{3,}$/i.test(code) || !name) return [];
      const values = Object.fromEntries(headers.map((header, cellIndex) => [header, text(row[cellIndex])]));
      return [{
        externalProjectId: text(row[index("Project ID")]),
        code: code.toUpperCase(),
        name,
        clientId: text(row[index("Client ID")]),
        clientName: text(row[index("Client Name")]),
        clientCode: text(row[index("Client Code")]),
        projectType: text(row[index("Project Type")]),
        projectCategory: text(row[index("Project Category")]),
        location: text(row[index("Location")]),
        country: text(row[index("Country")]),
        projectStatus: text(row[index("Project Status")]),
        priority: text(row[index("Priority")]),
        sourceRow: rowIndex + 2,
        sourceFileId: file.id,
        sourcePath: file.path_display,
        sourceModifiedAt: file.server_modified ? new Date(file.server_modified) : null,
        rawData: JSON.stringify(values),
        isAvailable: true,
      }];
    });

    await prisma.projectRepositoryItem.updateMany({ data: { isAvailable: false } });
    await prisma.$transaction(records.map((record) =>
      prisma.projectRepositoryItem.upsert({
        where: { code: record.code },
        create: record,
        update: record,
      })
    ));
    await createAuditLog(
      auth.userId,
      "SYNC_PROJECT_REPOSITORY",
      "ProjectRepositoryItem",
      file.id,
      `مزامنة ${records.length} مشروعاً من ${file.path_display}`
    );

    return NextResponse.json({
      message: `تمت مزامنة ${records.length} مشروعاً من Master Sheet`,
      count: records.length,
      file: { name: file.name, path: file.path_display, modifiedAt: file.server_modified || null },
    });
  } catch (error) {
    console.error("Sync project repository error:", error);
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "تعذر مزامنة مستودع المشاريع",
    }, { status: 500 });
  }
}
