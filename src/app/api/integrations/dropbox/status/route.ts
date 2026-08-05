import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import {
  DropboxIntegrationError,
  getDropboxConnectionStatus,
  normalizeDropboxAccessToken,
  validateDropboxAccessToken,
} from "@/lib/dropbox";
import {
  deleteIntegrationCredential,
  setIntegrationCredential,
} from "@/lib/integration-credentials";
import { createAuditLog } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;

  const status = await getDropboxConnectionStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: NextRequest) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const token =
      typeof body.token === "string" ? normalizeDropboxAccessToken(body.token) : "";
    if (token.length < 20 || token.length > 4096) {
      return NextResponse.json({
        valid: false,
        error: "يرجى إدخال Access Token صالح",
      });
    }

    const account = await validateDropboxAccessToken(token);
    // SQLite serializes writes. Keep credential updates sequential to avoid lock contention.
    await setIntegrationCredential("dropbox_access_token", token, auth.userId);
    if (account.teamMemberId) {
      await setIntegrationCredential("dropbox_team_member_id", account.teamMemberId, auth.userId);
    } else {
      await deleteIntegrationCredential("dropbox_team_member_id");
    }
    await createAuditLog(
      auth.userId,
      "UPDATE_DROPBOX_TOKEN",
      "IntegrationCredential",
      "dropbox_access_token",
      `تحديث اتصال Dropbox${account.email ? ` للحساب ${account.email}` : ""}`
    );

    return NextResponse.json({
      valid: true,
      message: "تم فحص التوكن وحفظه بشكل مشفر",
      status: await getDropboxConnectionStatus(),
    });
  } catch (error) {
    if (error instanceof DropboxIntegrationError) {
      return NextResponse.json({
        valid: false,
        error: error.message,
      });
    }
    console.error("Save Dropbox token error:", error);
    const detail = error instanceof Error ? error.message : "";
    return NextResponse.json({
      valid: false,
      error: detail
        ? `تعذر حفظ توكن Dropbox: ${detail.slice(0, 240)}`
        : "تعذر حفظ توكن Dropbox بسبب خطأ داخلي غير معروف",
    });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireManager(request);
  if (auth instanceof NextResponse) return auth;

  await Promise.all([
    deleteIntegrationCredential("dropbox_access_token"),
    deleteIntegrationCredential("dropbox_team_member_id"),
  ]);
  await createAuditLog(
    auth.userId,
    "REMOVE_DROPBOX_TOKEN",
    "IntegrationCredential",
    "dropbox_access_token",
    "حذف توكن Dropbox المحفوظ من لوحة التحكم"
  );
  return NextResponse.json({
    message: "تم حذف التوكن المحفوظ",
    status: await getDropboxConnectionStatus(),
  });
}
