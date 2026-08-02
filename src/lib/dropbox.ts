import { getIntegrationCredential } from "@/lib/integration-credentials";

const API_URL = "https://api.dropboxapi.com/2";

async function dropboxFetch(input: string, init: RequestInit, label = "Dropbox") {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "خطأ شبكة غير معروف";
  throw new DropboxIntegrationError(`تعذر الاتصال بخوادم ${label}. تحقق من اتصال الإنترنت وDNS ثم حاول مجدداً. (${detail})`, 502);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export type DropboxConnectionStatus = {
  configured: boolean;
  connected: boolean;
  mode: "refresh_token" | "access_token" | "dashboard_token" | "none";
  autoRefresh: boolean;
  accessTokenExpiresAt: string | null;
  tokenUpdatedAt: string | null;
  teamMemberId: string | null;
  accountName: string | null;
  accountEmail: string | null;
  error?: string;
};

export class DropboxIntegrationError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function normalizeDropboxAccessToken(value: string) {
  let token = value.trim().replace(/^\uFEFF/, "");
  token = token.replace(/^Bearer\s+/i, "").trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token.replace(/\s+/g, "");
}

export async function isDropboxConfigured() {
  if (
    process.env.DROPBOX_ACCESS_TOKEN ||
    (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN)
  ) return true;
  return Boolean(await getIntegrationCredential("dropbox_access_token"));
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!key || !secret || !refreshToken) {
    const storedCredential = await getIntegrationCredential("dropbox_access_token");
    const staticToken = process.env.DROPBOX_ACCESS_TOKEN || storedCredential?.value;
    if (staticToken) return staticToken;
    throw new DropboxIntegrationError("تكامل Dropbox غير مهيأ بعد", 503);
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: key,
    client_secret: secret,
  });
  const response = await dropboxFetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new DropboxIntegrationError("تعذر تجديد اتصال Dropbox");
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 14400) * 1000,
  };
  return cachedToken.value;
}

async function configuredTeamMemberId() {
  if (process.env.DROPBOX_TEAM_MEMBER_ID) return process.env.DROPBOX_TEAM_MEMBER_ID;
  return (await getIntegrationCredential("dropbox_team_member_id"))?.value || null;
}

export async function getDropboxConnectionStatus(): Promise<DropboxConnectionStatus> {
  const hasRefreshCredentials = Boolean(
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET &&
    process.env.DROPBOX_REFRESH_TOKEN
  );
  const hasStaticToken = Boolean(process.env.DROPBOX_ACCESS_TOKEN);
  const storedCredential = await getIntegrationCredential("dropbox_access_token");
  const teamMemberId = await configuredTeamMemberId();
  const mode = hasRefreshCredentials
    ? "refresh_token"
    : hasStaticToken
      ? "access_token"
      : storedCredential
        ? "dashboard_token"
        : "none";

  if (mode === "none") {
    return {
      configured: false,
      connected: false,
      mode,
      autoRefresh: false,
      accessTokenExpiresAt: null,
      tokenUpdatedAt: null,
      teamMemberId: null,
      accountName: null,
      accountEmail: null,
      error: "بيانات ربط Dropbox غير مضافة إلى بيئة تشغيل التطبيق",
    };
  }

  try {
    const account = await validateDropboxAccessToken(await accessToken(), teamMemberId);
    return {
      configured: true,
      connected: true,
      mode,
      autoRefresh: mode === "refresh_token",
      accessTokenExpiresAt:
        mode === "refresh_token" && cachedToken
          ? new Date(cachedToken.expiresAt).toISOString()
          : null,
      tokenUpdatedAt: storedCredential?.updatedAt.toISOString() || null,
      teamMemberId: account.teamMemberId || teamMemberId,
      accountName: account.name?.display_name || null,
      accountEmail: account.email || null,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      mode,
      autoRefresh: mode === "refresh_token",
      accessTokenExpiresAt: null,
      tokenUpdatedAt: storedCredential?.updatedAt.toISOString() || null,
      teamMemberId,
      accountName: null,
      accountEmail: null,
      error: error instanceof Error ? error.message : "تعذر التحقق من اتصال Dropbox",
    };
  }
}

function userAuthHeaders(
  token: string,
  teamMemberId?: string | null,
  rootNamespaceId?: string | null
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (teamMemberId) headers["Dropbox-API-Select-User"] = teamMemberId;
  if (rootNamespaceId) {
    headers["Dropbox-API-Path-Root"] = JSON.stringify({
      ".tag": "root",
      root: rootNamespaceId,
    });
  }
  return headers;
}

async function getDropboxRootNamespaceId(token: string, teamMemberId?: string | null) {
  const response = await dropboxFetch(`${API_URL}/users/get_current_account`, {
    method: "POST",
    headers: userAuthHeaders(token, teamMemberId),
    body: "null",
    cache: "no-store",
  });
  const responseText = await response.text();
  if (!response.ok) {
    if (responseText.includes("missing_scope")) {
      throw new DropboxIntegrationError(
        "يحتاج Dropbox إلى صلاحية account_info.read حتى يتمكن من البحث داخل مساحة الفريق. فعّلها ثم أنشئ توكن جديداً واحفظه من الإعدادات.",
        400
      );
    }
    return null;
  }
  const account = JSON.parse(responseText) as {
    root_info?: { root_namespace_id?: string };
  };
  return account.root_info?.root_namespace_id || null;
}

async function validateFileRequestAccess(token: string, teamMemberId?: string | null) {
  const response = await dropboxFetch(`${API_URL}/file_requests/list`, {
    method: "POST",
    headers: userAuthHeaders(token, teamMemberId),
    body: "null",
    cache: "no-store",
  });
  return { response, text: await response.text() };
}

export async function validateDropboxAccessToken(token: string, selectedTeamMemberId?: string | null) {
  let teamMemberId = selectedTeamMemberId || null;
  let validation = await validateFileRequestAccess(token, teamMemberId);

  if (
    !validation.response.ok &&
    !teamMemberId &&
    /entire Dropbox Business team|single Dropbox account/i.test(validation.text)
  ) {
    const adminResponse = await dropboxFetch(`${API_URL}/team/token/get_authenticated_admin`, {
      method: "POST",
      headers: userAuthHeaders(token),
      body: "null",
      cache: "no-store",
    });
    const adminText = await adminResponse.text();
    let adminData: {
      admin_profile?: {
        team_member_id?: string;
      };
      error_summary?: string;
    } = {};
    try {
      adminData = adminText ? JSON.parse(adminText) : {};
    } catch {
      adminData = {};
    }
    teamMemberId = adminData.admin_profile?.team_member_id || null;
    if (!adminResponse.ok || !teamMemberId) {
      throw new DropboxIntegrationError(
        adminData.error_summary?.includes("missing_scope")
          ? "التوكن Team Token ويحتاج صلاحية team_info.read لاكتشاف عضو الأدمن تلقائياً"
          : `تعذر تحديد عضو فريق Dropbox: ${adminData.error_summary || adminText || `HTTP ${adminResponse.status}`}`,
        400
      );
    }
    validation = await validateFileRequestAccess(token, teamMemberId);
  }

  const validationResponse = validation.response;
  const validationText = validation.text;
  let validationData: Record<string, unknown> = {};
  try {
    validationData = validationText ? JSON.parse(validationText) : {};
  } catch {
    validationData = {};
  }
  if (!validationResponse.ok) {
    const summary =
      typeof validationData.error_summary === "string" ? validationData.error_summary : "";
    const missingScope = summary.includes("missing_scope");
    const plainResponse = validationText
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    throw new DropboxIntegrationError(
      validationResponse.status === 401
        ? "التوكن غير صالح أو انتهت صلاحيته"
        : missingScope
          ? "التوكن لا يحتوي على صلاحية file_requests.read المطلوبة"
          : summary.includes("disabled_for_team")
            ? "ميزة File Requests معطلة في إعدادات فريق Dropbox"
            : `رفض Dropbox التوكن: ${summary || plainResponse || `HTTP ${validationResponse.status}`}`,
      400
    );
  }

  // Account details are optional because this route requires the extra account_info.read scope.
  const accountResponse = await dropboxFetch(`${API_URL}/users/get_current_account`, {
    method: "POST",
    headers: userAuthHeaders(token, teamMemberId),
    body: "null",
    cache: "no-store",
  });
  if (!accountResponse.ok) return { teamMemberId };
  return {
    ...await accountResponse.json() as { name?: { display_name?: string }; email?: string },
    teamMemberId,
  };
}

async function call<T>(
  endpoint: string,
  body: object,
  options?: { teamRoot?: boolean }
): Promise<T> {
  const token = await accessToken();
  const teamMemberId = await configuredTeamMemberId();
  const rootNamespaceId = options?.teamRoot
    ? await getDropboxRootNamespaceId(token, teamMemberId)
    : null;
  const response = await dropboxFetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    headers: userAuthHeaders(token, teamMemberId, rootNamespaceId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const summary = typeof data.error_summary === "string" ? data.error_summary : "";
    throw new DropboxIntegrationError(
      summary.includes("insufficient_space") ? "مساحة Dropbox غير كافية لاستقبال الملفات" : "تعذر تنفيذ العملية على Dropbox"
    );
  }
  return data as T;
}

export function safeDropboxSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "بدون اسم";
}

export async function ensureDropboxFolder(path: string) {
  try {
    await call("files/create_folder_v2", { path, autorename: false });
  } catch (error) {
    if (error instanceof DropboxIntegrationError) {
      // A file request can reuse a folder that already exists.
      return;
    }
    throw error;
  }
}

export async function createDropboxFileRequest(input: {
  title: string;
  destination: string;
  description?: string;
}) {
  await ensureDropboxFolder(input.destination);
  return call<{
    id: string;
    url: string;
    title: string;
    is_open: boolean;
    file_count: number;
    destination: string;
  }>("file_requests/create", {
    title: input.title,
    destination: input.destination,
    description: input.description || "",
    open: true,
  });
}

export function getDropboxFileRequest(id: string) {
  return call<{ id: string; is_open: boolean; file_count: number; destination?: string }>(
    "file_requests/get",
    { id }
  );
}

export function closeDropboxFileRequest(id: string) {
  return call("file_requests/update", { id, open: false });
}

export function deleteDropboxFile(path: string) {
  return call("files/delete_v2", { path });
}

export interface DropboxFile {
  id: string;
  name: string;
  path_lower: string;
  size: number;
  content_hash?: string;
  client_modified?: string;
}

export async function listDropboxFiles(path: string) {
  const files: DropboxFile[] = [];
  let result = await call<{ entries: Array<DropboxFile & { ".tag": string }>; cursor: string; has_more: boolean }>(
    "files/list_folder",
    { path, recursive: false, include_deleted: false }
  );
  files.push(...result.entries.filter((entry) => entry[".tag"] === "file"));
  while (result.has_more) {
    result = await call("files/list_folder/continue", { cursor: result.cursor });
    files.push(...result.entries.filter((entry) => entry[".tag"] === "file"));
  }
  return files;
}

export async function getDropboxTemporaryLink(path: string) {
  return call<{ metadata: DropboxFile; link: string }>("files/get_temporary_link", { path });
}

export interface DropboxSearchFile {
  id: string;
  name: string;
  path_display: string;
  server_modified?: string;
}

export async function findDropboxFileByName(name: string) {
  const result = await call<{
    matches: Array<{
      metadata?: {
        metadata?: DropboxSearchFile & { ".tag"?: string };
      } & DropboxSearchFile;
    }>;
  }>("files/search_v2", {
    query: name,
    options: {
      filename_only: true,
      max_results: 100,
    },
  }, { teamRoot: true });
  const files = result.matches
    .map((match) => match.metadata?.metadata || match.metadata)
    .filter((file): file is DropboxSearchFile => Boolean(file?.id && file.name))
    .filter((file) => {
      const expected = name.replace(/\.(xlsx|xlsm)$/i, "").trim().toLocaleLowerCase();
      const actual = file.name.replace(/\.(xlsx|xlsm)$/i, "").trim().toLocaleLowerCase();
      return expected === actual && /\.(xlsx|xlsm)$/i.test(file.name);
    });
  return files.sort((first, second) => {
    const firstPreferred = first.path_display?.includes("/04_All Projects/") ? 1 : 0;
    const secondPreferred = second.path_display?.includes("/04_All Projects/") ? 1 : 0;
    if (firstPreferred !== secondPreferred) return secondPreferred - firstPreferred;
    return String(second.server_modified || "").localeCompare(String(first.server_modified || ""));
  })[0] || null;
}

export async function downloadDropboxFile(fileId: string) {
  const token = await accessToken();
  const teamMemberId = await configuredTeamMemberId();
  const rootNamespaceId = await getDropboxRootNamespaceId(token, teamMemberId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
  };
  if (teamMemberId) headers["Dropbox-API-Select-User"] = teamMemberId;
  if (rootNamespaceId) {
    headers["Dropbox-API-Path-Root"] = JSON.stringify({
      ".tag": "root",
      root: rootNamespaceId,
    });
  }
  const response = await dropboxFetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new DropboxIntegrationError(
      `تعذر تنزيل ملف المشاريع من Dropbox: ${message.slice(0, 180)}`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}
