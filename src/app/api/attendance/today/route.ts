import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTodayAttendance } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const userOrResponse = requireAuth(request);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  try {
    const attendance = await getTodayAttendance(userOrResponse.userId);

    return NextResponse.json({ attendance });
  } catch (error) {
    console.error("Get today attendance error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في جلب بيانات الحضور" },
      { status: 500 }
    );
  }
}
