"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, XCircle, Clock, Pencil, Reply, Calendar,
  ClipboardList, Bell, Loader2, Inbox, ChevronDown, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { confidenceLabel, confidenceColor, formatRelativeDate } from "@/lib/utils";
import { format } from "date-fns";
import type { ReplyOutboundPayload } from "@/types/reply-outbound";

type ApprovalActionResult = {
  data?: { ok: boolean; action: string };
  warnings?: string[];
  outboundEmail?: ReplyOutboundPayload;
  sentReplyViaGmail?: boolean;
};

interface ApprovalItem {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  createdAt: string;
  email?: { subject: string | null; fromEmail: string; fromName: string | null; snippet: string | null } | null;
  replyDraft?: { subject: string | null; body: string; editedBody: string | null; style: string; confidence: number } | null;
  calendarSuggestion?: { title: string; startTime: string; endTime: string | null; type: string; location: string | null; confidence: number } | null;
  task?: { title: string; description: string | null; dueDate: string | null; priority: string } | null;
}

async function fetchApprovals(tab?: string): Promise<{ data: ApprovalItem[] }> {
  const params = new URLSearchParams({ status: "pending" });
  if (tab && tab !== "all" && tab !== "reminder") {
    params.set("type", tab);
  } else if (tab === "reminder") {
    params.set("type", "calendar_event");
  }
  const res = await fetch(`/api/approvals?${params}`);
  const json = (await res.json()) as { data: ApprovalItem[] };
  let items = json.data ?? [];
  if (tab === "reminder") {
    items = items.filter((i) => i.calendarSuggestion?.type === "reminder");
  }
  return { data: items };
}

async function doAction(
  id: string,
  action: string,
  opts?: { editedContent?: string; snoozeDuration?: number; sendViaGmail?: boolean }
) {
  const { editedContent, snoozeDuration, sendViaGmail } = opts ?? {};
  const res = await fetch(`/api/approvals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      editedContent,
      snoozeDuration,
      ...(sendViaGmail !== undefined ? { sendViaGmail } : {}),
    }),
  });
  const data = (await res.json()) as ApprovalActionResult & { error?: unknown };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Server error ${res.status}`
    );
  }
  return data;
}

export function ReviewQueueClient() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  const [editingItem, setEditingItem] = useState<ApprovalItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [outboundDialog, setOutboundDialog] = useState<ReplyOutboundPayload | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", activeTab],
    queryFn: () => fetchApprovals(activeTab === "all" ? undefined : activeTab),
    refetchInterval: 30000,
  });

  const { data: settingsPayload } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("settings");
      return res.json() as Promise<{ data: { settings: { autoSendReplies: boolean } | null } }>;
    },
  });

  const autoSendReplies = settingsPayload?.data?.settings?.autoSendReplies ?? false;

  const items = data?.data ?? [];

  const actionMut = useMutation({
    mutationFn: ({
      id,
      action,
      editedContent,
      snoozeDuration,
      sendViaGmail,
    }: {
      id: string;
      action: string;
      editedContent?: string;
      snoozeDuration?: number;
      sendViaGmail?: boolean;
    }) => doAction(id, action, { editedContent, snoozeDuration, sendViaGmail }),
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      const labels: Record<string, string> = {
        approve: "Approved ✓",
        reject: "Rejected",
        edit: "Saved",
      };
      if (result?.outboundEmail) {
        setOutboundDialog(result.outboundEmail);
      }
      if (result?.sentReplyViaGmail) {
        qc.invalidateQueries({ queryKey: ["emails"] });
        toast({
          title: "Reply sent via Gmail",
          description: "Check your Sent folder in Gmail.",
          variant: "success",
        });
      } else if (vars.action === "snooze") {
        const m = vars.snoozeDuration ?? 60;
        const desc =
          m >= 60 && m % 60 === 0
            ? `${m / 60} hour${m === 60 ? "" : "s"}`
            : `${m} minutes`;
        toast({ title: "Snoozed", description: `We’ll surface this again in ${desc}.`, variant: "success" });
      } else if (result?.warnings?.length) {
        toast({
          title: labels[vars.action] ?? "Done",
          description: result.warnings[0],
          variant: "default",
        });
      } else {
        toast({ title: labels[vars.action] ?? "Done", variant: "success" });
      }
      if (editingItem) setEditingItem(null);
    },
    onError: (e) => toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" }),
  });

  const tabs = [
    { key: "all", label: "All", icon: Inbox },
    { key: "reply", label: "Replies", icon: Reply },
    { key: "calendar_event", label: "Events", icon: Calendar },
    { key: "task", label: "Tasks", icon: ClipboardList },
    { key: "reminder", label: "Reminders", icon: Bell },
  ];

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b px-4 pt-3">
          <TabsList className="h-8">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs gap-1.5 px-3">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {t.key === "all" && items.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{items.length}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <CheckCircle className="h-12 w-12 text-emerald-400 mb-3" />
              <p className="text-sm font-medium">All clear!</p>
              <p className="text-xs text-muted-foreground mt-1">No pending items in this category.</p>
            </div>
          ) : (
            <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <ApprovalCard
                  key={item.id}
                  item={item}
                  autoSendReplies={autoSendReplies}
                  actionLoading={actionMut.isPending && actionMut.variables?.id === item.id}
                  onApprove={(opts) =>
                    actionMut.mutate({
                      id: item.id,
                      action: "approve",
                      ...(opts?.sendViaGmail !== undefined ? { sendViaGmail: opts.sendViaGmail } : {}),
                    })
                  }
                  onReject={() => actionMut.mutate({ id: item.id, action: "reject" })}
                  onSnooze={() => actionMut.mutate({ id: item.id, action: "snooze", snoozeDuration: 60 })}
                  onEdit={() => {
                    setEditingItem(item);
                    setEditContent(
                      item.replyDraft?.editedBody ?? item.replyDraft?.body ?? item.task?.description ?? ""
                    );
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </Tabs>

      {/* Structured outbound reply (when Gmail did not send) */}
      <Dialog open={!!outboundDialog} onOpenChange={(open) => !open && setOutboundDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Structured email payload</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal">
              schema.org JSON-LD plus an RFC-style MIME draft you can paste into a client or tooling.
              {outboundDialog?.flags.demoInboxData && (
                <span className="block mt-1 text-amber-700 dark:text-amber-400">
                  Demo/seed thread — threading headers may be empty; use To / Subject / body in your mail app.
                </span>
              )}
            </p>
          </DialogHeader>
          {outboundDialog && (
            <Tabs defaultValue="schema" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="h-8 shrink-0">
                <TabsTrigger value="schema" className="text-xs">
                  Schema.org (JSON-LD)
                </TabsTrigger>
                <TabsTrigger value="mime" className="text-xs">
                  MIME draft
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">
                  Full JSON
                </TabsTrigger>
              </TabsList>
              <TabsContent value="schema" className="flex-1 min-h-0 mt-2 space-y-2 data-[state=inactive]:hidden">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        JSON.stringify(outboundDialog.schemaOrgEmailMessage, null, 2)
                      );
                      toast({ title: "Copied JSON-LD" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded-md border p-3 max-h-[45vh] overflow-auto">
                  {JSON.stringify(outboundDialog.schemaOrgEmailMessage, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="mime" className="flex-1 min-h-0 mt-2 space-y-2 data-[state=inactive]:hidden">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(outboundDialog.mimeDraft);
                      toast({ title: "Copied MIME draft" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded-md border p-3 max-h-[45vh] overflow-auto">
                  {outboundDialog.mimeDraft}
                </pre>
              </TabsContent>
              <TabsContent value="all" className="flex-1 min-h-0 mt-2 space-y-2 data-[state=inactive]:hidden">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(outboundDialog, null, 2));
                      toast({ title: "Copied full payload" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded-md border p-3 max-h-[45vh] overflow-auto">
                  {JSON.stringify(outboundDialog, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOutboundDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit before approving</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingItem?.email && (
              <div className="text-sm text-muted-foreground rounded-md border p-3 bg-muted/30">
                <p className="font-medium text-foreground">{editingItem.email.subject ?? "(no subject)"}</p>
                <p className="text-xs mt-0.5">From: {editingItem.email.fromName ?? editingItem.email.fromEmail}</p>
              </div>
            )}
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder="Edit the content here…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingItem) {
                  actionMut.mutate({
                    id: editingItem.id,
                    action: "edit",
                    editedContent: editContent,
                  });
                  // Don't close — user can now approve
                  toast({ title: "Content updated", description: "Now you can approve the item." });
                  setEditingItem(null);
                }
              }}
              disabled={actionMut.isPending}
            >
              Save &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ApprovalCardProps {
  item: ApprovalItem;
  autoSendReplies: boolean;
  actionLoading: boolean;
  onApprove: (opts?: { sendViaGmail?: boolean }) => void;
  onReject: () => void;
  onSnooze: () => void;
  onEdit: () => void;
}

function ApprovalCard({
  item,
  autoSendReplies,
  actionLoading,
  onApprove,
  onReject,
  onSnooze,
  onEdit,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sendViaGmailOnce, setSendViaGmailOnce] = useState(false);

  const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
    reply: { icon: Reply, color: "text-blue-600", label: "Reply Draft" },
    calendar_event: { icon: Calendar, color: "text-amber-600", label: "Calendar Event" },
    task: { icon: ClipboardList, color: "text-green-600", label: "Task" },
    reminder: { icon: Bell, color: "text-purple-600", label: "Reminder" },
  };

  const tc = typeConfig[item.type] ?? { icon: Inbox, color: "text-slate-600", label: item.type };
  const Icon = tc.icon;

  return (
    <Card className={`${item.priority === "high" ? "border-red-200" : ""}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-start gap-2">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tc.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground">{tc.label}</span>
              {item.priority === "high" && <Badge variant="urgent" className="text-[10px] h-4 px-1.5">high priority</Badge>}
            </div>
            <p className="text-sm font-medium mt-0.5 leading-tight">{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-2 space-y-2">
        {/* Email context */}
        {item.email && (
          <div className="rounded-md bg-muted/40 p-2 text-xs">
            <span className="text-muted-foreground">From: </span>
            {item.email.fromName ?? item.email.fromEmail}
            {item.email.snippet && (
              <p className="text-muted-foreground mt-1 truncate">{item.email.snippet}</p>
            )}
          </div>
        )}

        {/* Reply draft preview */}
        {item.replyDraft && (
          <div>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Hide" : "Show"} draft
              <span className={`ml-auto ${confidenceColor(item.replyDraft.confidence)}`}>
                {confidenceLabel(item.replyDraft.confidence)}
              </span>
            </button>
            {expanded && (
              <pre className="mt-2 text-xs whitespace-pre-wrap font-sans bg-muted/30 rounded p-2 border leading-relaxed">
                {item.replyDraft.editedBody ?? item.replyDraft.body}
              </pre>
            )}
          </div>
        )}

        {/* Calendar event details */}
        {item.calendarSuggestion && (
          <div className="text-xs space-y-0.5">
            <p className="font-medium">{item.calendarSuggestion.title}</p>
            <p className="text-muted-foreground">
              {format(new Date(item.calendarSuggestion.startTime), "EEE, MMM d · h:mm a")}
              {item.calendarSuggestion.endTime && ` – ${format(new Date(item.calendarSuggestion.endTime), "h:mm a")}`}
            </p>
            {item.calendarSuggestion.location && (
              <p className="text-muted-foreground">{item.calendarSuggestion.location}</p>
            )}
            <span className={`${confidenceColor(item.calendarSuggestion.confidence)}`}>
              {confidenceLabel(item.calendarSuggestion.confidence)}
            </span>
          </div>
        )}

        {/* Task details */}
        {item.task && (
          <div className="text-xs space-y-0.5">
            {item.task.dueDate && (
              <p className="text-muted-foreground">Due: {format(new Date(item.task.dueDate), "EEE, MMM d")}</p>
            )}
            {item.task.description && <p className="text-muted-foreground">{item.task.description}</p>}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">{formatRelativeDate(new Date(item.createdAt))}</p>

        {item.type === "reply" && (
          <div className="rounded-md border border-border/80 bg-muted/20 px-2 py-1.5">
            {autoSendReplies ? (
              <p className="text-[10px] text-muted-foreground leading-snug">
                Auto-send is on — this reply will be sent through Gmail when you approve (real inbox threads only; demo seed data cannot send).
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Switch
                  id={`gmail-send-${item.id}`}
                  checked={sendViaGmailOnce}
                  onCheckedChange={setSendViaGmailOnce}
                  className="scale-90 origin-left"
                />
                <Label
                  htmlFor={`gmail-send-${item.id}`}
                  className="text-[10px] leading-snug cursor-pointer font-normal text-muted-foreground"
                >
                  Send via Gmail when I approve
                </Label>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-3 pt-0 gap-1.5 flex-wrap">
        <Button
          size="sm"
          className="h-7 text-xs gap-1 flex-1"
          disabled={actionLoading}
          onClick={() =>
            onApprove(
              item.type === "reply"
                ? { sendViaGmail: autoSendReplies || sendViaGmailOnce }
                : undefined
            )
          }
        >
          {actionLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5" />
          )}
          Approve
        </Button>
        {(item.type === "reply" || item.type === "task") && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={actionLoading}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={actionLoading} onClick={onSnooze}>
          <Clock className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={actionLoading}
          onClick={onReject}
        >
          <XCircle className="h-3.5 w-3.5" /> Reject
        </Button>
      </CardFooter>
    </Card>
  );
}
