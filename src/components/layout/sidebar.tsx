"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import BrandLogo from "@/components/brand-logo";
import {
  CalendarIcon,
  CheckSquareIcon,
  FolderIcon,
  BarChartIcon,
  TrendingUpIcon,
  LogOutIcon,
  SettingsIcon,
  UsersIcon,
  XIcon,
  ClockIcon,
  FileTextIcon,
} from "@/components/icons";

const navItems = [
  { href: "/tasks", label: "المهام", sublabel: "Tasks", icon: CheckSquareIcon },
  { href: "/projects", label: "المشاريع", sublabel: "Projects", icon: FolderIcon },
  { href: "/requests", label: "الطلبات", sublabel: "Requests", icon: ClockIcon },
  { href: "/submissions", label: "التسليمات", sublabel: "Submissions", icon: FileTextIcon },
];

const employeeNavItems = [
  { href: "/my-day", label: "يومي", sublabel: "My Day", icon: CalendarIcon },
];

const managerNavItems = [
  { href: "/overview", label: "نظرة عامة", sublabel: "Overview", icon: BarChartIcon },
  { href: "/employees", label: "الموظفين", sublabel: "Employees", icon: UsersIcon },
  { href: "/reports", label: "التقارير", sublabel: "Reports", icon: TrendingUpIcon },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const allNavItems = isManager
    ? [...navItems, ...managerNavItems]
    : [...employeeNavItems, ...navItems];

  return (
    <>
      <button
        type="button"
        aria-label="إغلاق القائمة"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-navy/35 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex min-h-screen w-[min(18rem,88vw)] flex-col border-l border-tint-200 bg-white shadow-soft-lg transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-40 lg:w-72 lg:flex-shrink-0 lg:translate-x-0 lg:shadow-soft ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
      <div className="p-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <BrandLogo size="md" className="border border-tint-200 shadow-soft" />
          <div>
            <h2 className="text-lg font-bold text-navy tracking-tight leading-none">
              InterVia
            </h2>
            <p className="text-xs text-muted mt-0.5">نظام إدارة الحضور</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="mr-auto flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-tint hover:text-navy lg:hidden"
          >
            <XIcon size={19} />
          </button>
        </div>
      </div>

      <div className="px-4 mt-4 mb-2">
        <div className="h-px bg-gradient-to-l from-transparent via-tint-200 to-transparent" />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {allNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`
                group flex items-center gap-3 px-4 py-3 rounded-xl
                transition-all duration-200 ease-out relative
                ${
                  isActive
                    ? "bg-teal text-white shadow-soft-md"
                    : "text-navy-400 hover:bg-tint hover:text-navy"
                }
              `}
            >
              <Icon
                size={20}
                className={`flex-shrink-0 transition-colors ${
                  isActive ? "text-white" : "text-muted group-hover:text-teal"
                }`}
              />
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {item.label}
                </span>
                <span
                  className={`block text-[10px] mt-0.5 tracking-wide ${
                    isActive ? "text-white/70" : "text-muted/60"
                  }`}
                >
                  {item.sublabel}
                </span>
              </div>
              {isActive && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-white rounded-l-full shadow-soft" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 mb-2">
        <div className="h-px bg-gradient-to-l from-transparent via-tint-200 to-transparent" />
      </div>

      <div className="px-3 pb-4 space-y-1">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-tint/50 mb-2">
          <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
            <span className="text-teal font-bold text-sm">
              {user?.name?.charAt(0) || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-navy truncate">{user?.name}</p>
            <p className="text-[10px] text-muted truncate">{user?.email}</p>
          </div>
        </div>

        <Link
          href="/settings"
          onClick={onClose}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm ${
            pathname === "/settings" ? "bg-teal/10 text-teal" : "text-muted hover:bg-tint hover:text-navy"
          }`}
        >
          <SettingsIcon size={18} />
          <span>الإعدادات</span>
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-danger/70 hover:bg-danger/5 hover:text-danger transition-all duration-200 text-sm"
        >
          <LogOutIcon size={18} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
      </aside>
    </>
  );
}
