"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isToday } from "date-fns";
import { Mail, Calendar, CheckSquare, RefreshCw, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeDate } from "@/lib/utils";
import type { PlannerItem } from "@prisma/client";

interface DashboardClientProps {
  pendingApprovals: Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    description: string | null;
    email?: { subject: string | null; fromEmail: string; fromName: string | null } | null;
    replyDraft?: { style: string; confidence: number } | null;
    calendarSuggestion?: { title: string; startTime: Date; type: string } | null;
    task?: { title: string; dueDate: Date | null; priority: string } | null;
  }>;
  importantEmails: Array<{
    id: string;
    subject: string | null;
    fromEmail: string;
    fromName: string | null;
    snippet: string | null;
    receivedAt: Date;
    aiCategory: string | null;
    aiPriority: string;
    aiTags: string[];
  }>;
  todayItems: PlannerItem[];
  upcomingItems: PlannerItem[];
  unreadCount: number;
  lastSync: Date | null;
  gmailEnabled: boolean;
}

export function DashboardClient({
  pendingApprovals,
  importantEmails,
  todayItems,
  upcomingItems,
  unreadCount,
  lastSync,
  gmailEnabled,
}: DashboardClientProps) {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({
        title: "Sync complete",
        description: `Synced ${data.data.synced} new messages`,
        variant: "success",
      });
      window.location.reload();
    } catch (err) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const approvalCount = pendingApprovals.length;
  const highPriorityCount = pendingApprovals.filter((a) => a.priority === "high").length;

  return (
    <ScrollArea className="flex-1 p-4 sm:p-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <StatCard icon={Mail} label="Unread emails" value={unreadCount} color="blue" href="/inbox" />
        <StatCard icon={CheckSquare} label="Pending approvals" value={approvalCount} color={approvalCount > 0 ? "amber" : "green"} href="/queue" />
        <StatCard icon={Calendar} label="Today's items" value={todayItems.length} color="purple" href="/calendar" />
        <StatCard icon={Clock} label="High priority" value={highPriorityCount} color={highPriorityCount > 0 ? "red" : "green"} href="/queue" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Sync + Gmail status */}
        <Card className="lg:col-span-2 xl:col-span-3">
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {lastSync
                ? `Last synced ${formatRelativeDate(new Date(lastSync))}`
                : gmailEnabled
                ? "Not yet synced"
                : "Gmail not connected — go to Settings"}
            </div>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || !gmailEnabled}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </CardContent>
        </Card>

        {/* Pending approvals */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-amber-500" />
                Pending Approvals
                {approvalCount > 0 && (
                  <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1.5">{approvalCount}</Badge>
                )}
              </CardTitle>
              <Link href="/queue" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">All clear — no pending items.</p>
            ) : (
              pendingApprovals.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href="/queue"
                  className="block rounded-lg border p-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <ApprovalTypeIcon type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-xs">{item.title}</p>
                      {item.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                    {item.priority === "high" && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Important emails */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-blue-500" />
                Important Emails
              </CardTitle>
              <Link href="/inbox" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Inbox <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {importantEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No important emails right now.</p>
            ) : (
              importantEmails.map((email) => (
                <Link
                  key={email.id}
                  href={`/inbox?emailId=${email.id}`}
                  className="block rounded-lg border p-2.5 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{email.fromName ?? email.fromEmail}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {email.subject ?? "(no subject)"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {format(new Date(email.receivedAt), "h:mm a")}
                    </span>
                  </div>
                  {email.aiTags.includes("needs_reply") && (
                    <Badge variant="meeting" className="mt-1.5 text-[10px] h-4 px-1.5">needs reply</Badge>
                  )}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Today's agenda */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-purple-500" />
                Today&apos;s Agenda
              </CardTitle>
              <Link href="/calendar" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Calendar <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {todayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nothing scheduled for today.</p>
            ) : (
              todayItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 rounded-lg border p-2.5">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${priorityDot(item.priority)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.title}</p>
                    {item.startTime && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isToday(new Date(item.startTime))
                          ? format(new Date(item.startTime), "h:mm a")
                          : format(new Date(item.startTime), "MMM d, h:mm a")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{item.type}</Badge>
                </div>
              ))
            )}

            {upcomingItems.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider pt-1">Upcoming</p>
                {upcomingItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-lg border p-2 opacity-75">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${priorityDot(item.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{item.title}</p>
                      {item.startTime && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(item.startTime), "EEE, MMM d")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "blue" | "amber" | "green" | "red" | "purple";
  href: string;
}) {
  const colorMap = {
    blue: "text-blue-600 bg-blue-50",
    amber: "text-amber-600 bg-amber-50",
    green: "text-emerald-600 bg-emerald-50",
    red: "text-red-600 bg-red-50",
    purple: "text-purple-600 bg-purple-50",
  };

  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ApprovalTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    reply: "💬",
    calendar_event: "📅",
    task: "✅",
    reminder: "🔔",
  };
  return <span className="text-sm shrink-0 mt-0.5">{icons[type] ?? "•"}</span>;
}

function priorityDot(priority: string): string {
  if (priority === "high") return "bg-red-500";
  if (priority === "low") return "bg-slate-300";
  return "bg-blue-400";
}
