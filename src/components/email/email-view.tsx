"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles, Reply, Calendar, CheckCheck, ClipboardList,
  Loader2, ChevronDown, ChevronUp, User, Send, Pencil,
  RefreshCw, CheckCircle, Tags, ListTodo, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatFullDate, confidenceLabel, confidenceColor } from "@/lib/utils";
import { sanitizeEmailHtml } from "@/lib/sanitize-email-html";
import type { ParsedEmail, ReplyStyle } from "@/types";

interface EmailViewProps {
  email: ParsedEmail;
  onClose: () => void;
  onAction: () => void;
}

interface DraftResult {
  id: string;
  subject: string | null;
  body: string;
  style: string;
  confidence: number;
}

async function emailAction(emailId: string, action: string, payload?: Record<string, unknown>) {
  const res = await fetch(`/api/gmail/message/${emailId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Action failed");
  return data.data;
}

// ─── Quick reply chips ────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: "✅  Yes, works for me", value: "Yes, that works perfectly for me." },
  { label: "❌  No, can't make it", value: "Unfortunately I won't be able to make it." },
  { label: "⏰  Need more time", value: "I need a bit more time, I'll get back to you shortly." },
  { label: "🔄  Suggest alternative", value: "I can't make that time — could we reschedule?" },
  { label: "❓  Need more details", value: "Could you share more details before I confirm?" },
  { label: "👀  On it", value: "On it — I'll take care of this right away." },
  { label: "📅  Let's meet", value: "Happy to meet! When works best for you?" },
  { label: "🙏  Thank you", value: "Thank you for letting me know." },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function EmailView({ email, onClose: _onClose, onAction }: EmailViewProps) {
  const { toast } = useToast();

  // Summary state
  const [summary, setSummary] = useState<{
    summary: string; keyPoints: string[]; actionItems: string[];
  } | null>(email.aiSummary ? { summary: email.aiSummary, keyPoints: [], actionItems: [] } : null);

  // Reply composer state
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>("normal");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftSentToQueue, setDraftSentToQueue] = useState(false);

  // Other state
  const [calendarEvent, setCalendarEvent] = useState<{ title: string; startTime: string; type: string } | null>(null);
  const [showBody, setShowBody] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const summarizeMut = useMutation({
    mutationFn: () => emailAction(email.id, "summarize"),
    onSuccess: (data) => {
      setSummary(data);
      toast({ title: "Summary ready", variant: "success" });
    },
    onError: (e) => toast({ title: "Summarize failed", description: (e as Error).message, variant: "destructive" }),
  });

  const draftMut = useMutation({
    mutationFn: () =>
      emailAction(email.id, "draft_from_instruction", {
        instruction: instruction.trim() || "Write a helpful reply",
        style: replyStyle,
      }),
    onSuccess: (data) => {
      setDraft(data.draft);
      setEditedBody(data.draft.body);
      setIsEditingDraft(false);
      setDraftSentToQueue(false);
      onAction();
    },
    onError: (e) => toast({ title: "Draft failed", description: (e as Error).message, variant: "destructive" }),
  });

  const calendarMut = useMutation({
    mutationFn: () => emailAction(email.id, "extract_calendar"),
    onSuccess: (data) => {
      if (data?.suggestion) {
        setCalendarEvent(data.suggestion);
        onAction();
        toast({ title: "Calendar suggestion added to queue", variant: "success" });
      } else {
        toast({ title: "No event detected", description: "This email doesn't seem to contain meeting/deadline info." });
      }
    },
    onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const noReplyMut = useMutation({
    mutationFn: () => emailAction(email.id, "no_reply"),
    onSuccess: () => { onAction(); toast({ title: "Marked as no reply needed", variant: "success" }); },
    onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const classifyMut = useMutation({
    mutationFn: () => emailAction(email.id, "classify"),
    onSuccess: () => {
      onAction();
      toast({ title: "Email classified", description: "Tags and category updated.", variant: "success" });
    },
    onError: (e) => toast({ title: "Classify failed", description: (e as Error).message, variant: "destructive" }),
  });

  const suggestReplyMut = useMutation({
    mutationFn: () => emailAction(email.id, "suggest_reply", { style: replyStyle }),
    onSuccess: () => {
      onAction();
      toast({
        title: "Reply draft added",
        description: "Open the Review queue to approve or edit.",
        variant: "success",
      });
    },
    onError: (e) => toast({ title: "Suggest reply failed", description: (e as Error).message, variant: "destructive" }),
  });

  const createTaskMut = useMutation({
    mutationFn: () => emailAction(email.id, "create_task") as Promise<{ tasks?: unknown[]; count?: number; message?: string }>,
    onSuccess: (data) => {
      onAction();
      const n = data?.count ?? (Array.isArray(data?.tasks) ? data.tasks.length : 0);
      if (n === 0) {
        toast({ title: "No tasks found", description: data?.message ?? "Try another email.", variant: "default" });
      } else {
        toast({
          title: `${n} task${n === 1 ? "" : "s"} added to queue`,
          description: "Review them under Queue → Tasks.",
          variant: "success",
        });
      }
    },
    onError: (e) => toast({ title: "Extract tasks failed", description: (e as Error).message, variant: "destructive" }),
  });

  // Send edited draft to queue (updates the draft body via approval edit)
  const sendToQueueMut = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("No draft to save");
      if (editedBody !== draft.body) {
        const approvalsRes = await fetch(`/api/approvals?status=pending`);
        if (!approvalsRes.ok) throw new Error("Could not load the review queue");
        const approvals = await approvalsRes.json();
        const item = approvals.data?.find(
          (a: { type: string; replyDraft?: { id: string } }) =>
            a.type === "reply" && a.replyDraft?.id === draft.id
        );
        if (!item) {
          throw new Error(
            "No matching queue item found. Generate the draft again, then save to the queue."
          );
        }
        const patchRes = await fetch(`/api/approvals/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", editedContent: editedBody }),
        });
        if (!patchRes.ok) throw new Error("Could not save your edits to the queue");
      }
    },
    onSuccess: () => {
      setDraftSentToQueue(true);
      toast({ title: "Draft saved to Review Queue", variant: "success" });
    },
    onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
  });

  const safeBodyHtml = useMemo(
    () => (email.bodyHtml ? sanitizeEmailHtml(email.bodyHtml) : null),
    [email.bodyHtml]
  );

  const tags = email.aiTags ?? [];

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 sm:p-6 space-y-5 max-w-2xl">

        {/* ── Email header ── */}
        <div>
          <h2 className="text-lg font-semibold leading-tight mb-2">
            {email.subject ?? "(no subject)"}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
            </span>
            <span>{formatFullDate(new Date(email.receivedAt))}</span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={
                    (["meeting","deadline","personal","work","school","urgent","newsletter"] as string[]).includes(tag)
                      ? (tag as "meeting")
                      : "outline"
                  }
                  className="text-xs"
                >
                  {tag.replace(/_/g, " ")}
                </Badge>
              ))}
              {email.aiConfidence > 0 && (
                <span className={`text-xs ${confidenceColor(email.aiConfidence)}`}>
                  {confidenceLabel(email.aiConfidence)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Quick action bar ── */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => summarizeMut.mutate()}
            disabled={summarizeMut.isPending}
          >
            {summarizeMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-500" />}
            {summary ? "Re-summarize" : "Summarize"}
          </Button>

          <Button
            size="sm" variant="outline"
            onClick={() => calendarMut.mutate()}
            disabled={calendarMut.isPending}
          >
            {calendarMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Calendar className="h-3.5 w-3.5 mr-1.5 text-blue-500" />}
            Detect Event
          </Button>

          <Button
            size="sm" variant="ghost"
            onClick={() => noReplyMut.mutate()}
            disabled={noReplyMut.isPending}
            className="text-muted-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            No Reply Needed
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => classifyMut.mutate()}
            disabled={classifyMut.isPending}
          >
            {classifyMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Tags className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
            )}
            Classify
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => suggestReplyMut.mutate()}
            disabled={suggestReplyMut.isPending}
          >
            {suggestReplyMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
            )}
            Quick draft
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => createTaskMut.mutate()}
            disabled={createTaskMut.isPending}
          >
            {createTaskMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <ListTodo className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
            )}
            Extract tasks
          </Button>
        </div>

        <Separator />

        {/* ── AI Summary ── */}
        {summary && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-1.5 text-amber-800">
                <Sparkles className="h-4 w-4" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <p className="text-sm">{summary.summary}</p>
              {summary.keyPoints.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Key points</p>
                  <ul className="space-y-1">
                    {summary.keyPoints.map((p, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <span className="text-amber-400 shrink-0">•</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Action items</p>
                  <ul className="space-y-1">
                    {summary.actionItems.map((a, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <ClipboardList className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── AI Reply Composer ── */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Reply className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">AI Reply Composer</span>
            </div>
            <Select value={replyStyle} onValueChange={(v) => setReplyStyle(v as ReplyStyle)}>
              <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">✂️ Concise</SelectItem>
                <SelectItem value="normal">💬 Normal</SelectItem>
                <SelectItem value="formal">🎩 Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 space-y-3">
            {/* Instruction input */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                What do you want to say? (or pick a quick reply below)
              </label>
              <Textarea
                placeholder={`e.g. "yes, Saturday 10am works for me" or "decline, suggest next Thursday at 2pm" or "ask for more details about the budget"`}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                className="resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!draftMut.isPending) draftMut.mutate();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Tip: Ctrl+Enter to generate</p>
            </div>

            {/* Quick reply chips */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => setInstruction(chip.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary ${
                    instruction === chip.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Generate button */}
            <Button
              className="w-full gap-2"
              onClick={() => draftMut.mutate()}
              disabled={draftMut.isPending}
            >
              {draftMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating draft…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {draft ? "Regenerate Draft" : "Generate Draft"}
                </>
              )}
            </Button>
          </div>

          {/* ── Draft result ── */}
          {draft && (
            <div className="border-t">
              <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">Draft ready</span>
                  <span className={`text-xs ml-1 ${confidenceColor(draft.confidence)}`}>
                    · {confidenceLabel(draft.confidence)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-emerald-700"
                    onClick={() => setIsEditingDraft(!isEditingDraft)}
                  >
                    <Pencil className="h-3 w-3" />
                    {isEditingDraft ? "Done" : "Edit"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => draftMut.mutate()}
                    disabled={draftMut.isPending}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Redo
                  </Button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Subject line */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Subject</p>
                  <p className="text-sm text-muted-foreground">{draft.subject}</p>
                </div>

                {/* Body — editable or read-only */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Body</p>
                  {isEditingDraft ? (
                    <Textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      rows={10}
                      className="text-sm font-mono leading-relaxed resize-none"
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-muted/20 rounded-lg p-3 border">
                      {editedBody}
                    </pre>
                  )}
                </div>

                {/* Send to queue / status */}
                {draftSentToQueue ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-800">
                      Saved to Review Queue — go to <strong>Queue</strong> to approve and send.
                    </p>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => sendToQueueMut.mutate()}
                    disabled={sendToQueueMut.isPending}
                  >
                    {sendToQueueMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send to Review Queue
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Calendar suggestion ── */}
        {calendarEvent && (
          <Card className="border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-1.5 text-blue-800">
                <Calendar className="h-4 w-4" /> Calendar Suggestion → Review Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-sm font-medium">{calendarEvent.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {calendarEvent.startTime
                  ? formatFullDate(new Date(calendarEvent.startTime))
                  : "Time TBD"}{" "}
                · <Badge variant="outline" className="text-xs">{calendarEvent.type}</Badge>
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Original email body ── */}
        <div>
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            onClick={() => setShowBody(!showBody)}
          >
            {showBody ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showBody ? "Hide" : "Show"} original email
          </button>
          {showBody && (
            <div className="rounded-lg border bg-muted/20 p-4">
              {safeBodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {email.bodyText ?? email.snippet ?? "(no content)"}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
