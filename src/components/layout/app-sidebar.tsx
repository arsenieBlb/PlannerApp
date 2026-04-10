"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Mail,
  CheckSquare,
  Calendar,
  Settings,
  Bell,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/inbox", icon: Mail, label: "Inbox" },
  { href: "/queue", icon: CheckSquare, label: "Queue" },
  { href: "/calendar", icon: Calendar, label: "Calendar" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-full w-16 flex-col border-r bg-background flex items-center py-4 gap-1">
      {/* Logo */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Zap className="h-5 w-5" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 items-center">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href="/settings"
        title="Notifications"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
      </Link>
    </aside>
  );
}
