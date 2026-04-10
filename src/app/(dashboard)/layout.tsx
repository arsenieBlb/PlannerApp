import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PushManager } from "@/components/notifications/push-manager";
import { GmailBootstrapSync } from "@/components/gmail/gmail-bootstrap-sync";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.userId) redirect("/login");

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 pl-16">
        <main className="h-full">{children}</main>
      </div>
      <PushManager />
      <GmailBootstrapSync />
    </div>
  );
}
