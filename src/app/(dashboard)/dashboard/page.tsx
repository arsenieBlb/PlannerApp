import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/layout/app-header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { format } from "date-fns";
import { parseJsonArray } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.userId) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const in7Days = new Date(today.getTime() + 7 * 86400000);

  const [pendingApprovals, importantEmails, todayItems, settings] = await Promise.all([
    prisma.approvalItem.findMany({
      where: { profileId: session.userId, status: "pending" },
      include: {
        email: { select: { subject: true, fromEmail: true, fromName: true } },
        replyDraft: { select: { style: true, confidence: true } },
        calendarSuggestion: { select: { title: true, startTime: true, type: true } },
        task: { select: { title: true, dueDate: true, priority: true } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.email.findMany({
      where: {
        profileId: session.userId,
        OR: [
          { aiPriority: "high" },
          { aiTags: { contains: "needs_reply" } },
        ],
        isRead: false,
      },
      orderBy: { receivedAt: "desc" },
      take: 5,
      select: {
        id: true,
        subject: true,
        fromEmail: true,
        fromName: true,
        snippet: true,
        receivedAt: true,
        aiCategory: true,
        aiPriority: true,
        aiTags: true,
      },
    }),
    prisma.plannerItem.findMany({
      where: {
        profileId: session.userId,
        status: "pending",
        startTime: { gte: startOfToday, lte: endOfToday },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.settings.findUnique({ where: { profileId: session.userId } }),
  ]);

  const upcomingItems = await prisma.plannerItem.findMany({
    where: {
      profileId: session.userId,
      status: "pending",
      startTime: { gte: endOfToday, lte: in7Days },
    },
    orderBy: { startTime: "asc" },
    take: 5,
  });

  const emailCount = await prisma.email.count({ where: { profileId: session.userId, isRead: false } });

  const importantEmailsParsed = importantEmails.map((e) => ({
    ...e,
    aiTags: parseJsonArray<string>(e.aiTags),
  }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        session={session as Parameters<typeof AppHeader>[0]["session"]}
        title="Dashboard"
        subtitle={format(today, "EEEE, MMMM d")}
      />
      <DashboardClient
        pendingApprovals={pendingApprovals}
        importantEmails={importantEmailsParsed}
        todayItems={todayItems}
        upcomingItems={upcomingItems}
        unreadCount={emailCount}
        lastSync={settings?.lastGmailSync ?? null}
        gmailEnabled={settings?.gmailSyncEnabled ?? false}
      />
    </div>
  );
}
