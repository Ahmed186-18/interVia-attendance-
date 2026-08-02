import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

export interface AuthUser {
  userId: string;
  role: string;
}

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, jwtSecret()) as AuthUser;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get("token")?.value || null;
}

export function getUserFromRequest(request: NextRequest): AuthUser | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(request: NextRequest): NextResponse | AuthUser {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  return user;
}

export function requireManager(request: NextRequest): NextResponse | AuthUser {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;
  if (user.role !== "MANAGER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "غير مصرح — صلاحيات المدير مطلوبة" }, { status: 403 });
  }
  return user;
}

export function requireEmployee(request: NextRequest): NextResponse | AuthUser {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;
  if (user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "نظام الحضور للموظفين فقط" }, { status: 403 });
  }
  return user;
}
