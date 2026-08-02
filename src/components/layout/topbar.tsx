"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { MenuIcon } from "@/components/icons";
import NotificationCenter from "@/components/layout/notification-center";

const pageNames: Record<string, string> = {
  "/my-day": "يومي",
  "/tasks": "المهام",
  "/projects": "المشاريع",
  "/overview": "نظرة عامة",
  "/employees": "الموظفون",
  "/reports": "التقارير",
  "/requests": "الطلبات",
  "/settings": "الإعدادات",
  "/submissions": "تسليم الملفات",
};

export default function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const pageName = pageNames[pathname] || "لوحة التحكم";
  const initial = user?.name?.trim().charAt(0) || "؟";

  return (
    <header className="sticky top-0 z-30 border-b border-navy/5 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="فتح القائمة الرئيسية"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-tint-200 bg-white text-navy transition-colors hover:border-teal/30 hover:bg-tint lg:hidden"
          >
            <MenuIcon size={21} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted">
              <span>InterVia</span>
              <span className="text-navy-100">/</span>
              <span className="truncate text-teal">{pageName}</span>
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold text-navy sm:hidden">{pageName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationCenter />
          <div className="hidden h-7 w-px bg-tint-200 sm:block" />
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-teal-700 text-sm font-bold text-white shadow-soft">
              {initial}
            </div>
            <div className="hidden max-w-40 sm:block">
              <p className="truncate text-xs font-semibold text-navy">{user?.name || "المستخدم"}</p>
              <p className="truncate text-[10px] text-muted">
                {user?.role === "ADMIN" ? "مدير النظام" : user?.role === "MANAGER" ? "مدير" : "موظف"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
