"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles, Reply, Calendar, CheckCheck, ClipboardList,
  Loader2, ChevronDown, ChevronUp, User
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
import type { ParsedEmail, ReplyStyle } from "@/types";

interface EmailViewProps {
  email: ParsedEmail;
  onClose: () => void;
  onAction: () => void;
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

export function EmailView({ email, onClose: _onClose, onAction }: EmailViewProps) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<{ summary: string; keyPoints: string[]; actionItems: string[] } | null>(
    email.aiSummary ? { summary: email.aiSummary, keyPoints: [], actionItems: [] } : null
  );
  const [replyDraft, setReplyDraft] = useState<{ subject: string; body: string; confidence: number; style: string } | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>("normal");
  const [showBody, setShowBody] = useState(false);
  const [calendarEvent, setCalendarEvent] = useState<{ title: string; startTime: string; type: string } | null>(null);

  const summarizeMut = useMutation({
    mutationFn: () => emailAction(email.id, "summarize"),
    onSuccess: (data) => { setSummary(data); toast({ title: "Summary ready", variant: "success" }); },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const replyMut = useMutation({
    mutationFn: () => emailAction(email.id, "suggest_reply", { style: replyStyle }),
    onSuccess: (data) => {
      setReplyDraft(data.draft);
      setEditedReply(data.draft.body);
      onAction();
      toast({ title: "Reply draft added to queue", variant: "success" });
    },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const calendarMut = useMutation({
    mutationFn: () => emailAction(email.id, "extract_calendar"),
    onSuccess: (data) => {
      if (data?.suggestion) {
        setCalendarEvent(data.suggestion);
        onAction();
        toast({ title: "Calendar suggestion added to queue", variant: "success" });
      } else {
        toast({ title: "No event detected", description: "This email doesn't seem to contain an event." });
      }
    },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const noReplyMut = useMutation({
    mutationFn: () => emailAction(email.id, "no_reply"),
    onSuccess: () => { onAction(); toast({ title: "Marked as no reply needed", variant: "success" }); },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const tags = email.aiTags ?? [];

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold leading-tight mb-2">
            {email.subject ?? "(no subject)"}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
            </span>
            <span>{formatFullDate(new Date(email.receivedAt))}</span>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={
                    (["meeting", "deadline", "personal", "work", "school", "urgent", "newsletter"] as string[]).includes(tag)
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

        {/* AI action toolbar */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => summarizeMut.mutate()}
            disabled={summarizeMut.isPending}
          >
            {summarizeMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Summarize
          </Button>

          <div className="flex gap-1">
            <Select value={replyStyle} onValueChange={(v) => setReplyStyle(v as ReplyStyle)}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => replyMut.mutate()}
              disabled={replyMut.isPending}
            >
              {replyMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Reply className="h-3.5 w-3.5 mr-1.5" />}
              Draft Reply
            </Button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => calendarMut.mutate()}
            disabled={calendarMut.isPending}
          >
            {calendarMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
            Detect Event
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => noReplyMut.mutate()}
            disabled={noReplyMut.isPending}
            className="text-muted-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            No Reply
          </Button>
        </div>

        <Separator />

        {/* AI Summary */}
        {summary && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-1.5 text-blue-800">
                <Sparkles className="h-4 w-4" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <p className="text-sm">{summary.summary}</p>
              {summary.keyPoints.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">Key points</p>
                  <ul className="space-y-1">
                    {summary.keyPoints.map((p, i) => (
                      <li key={i} className="text-xs text-blue-900 flex gap-1.5">
                        <span className="text-blue-400 shrink-0">•</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">Action items</p>
                  <ul className="space-y-1">
                    {summary.actionItems.map((a, i) => (
                      <li key={i} className="text-xs text-blue-900 flex gap-1.5">
                        <ClipboardList className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reply draft preview */}
        {replyDraft && (
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between text-emerald-800">
                <span className="flex items-center gap-1.5">
                  <Reply className="h-4 w-4" />
                  Reply Draft ({replyDraft.style})
                </span>
                <span className={`text-xs font-normal ${confidenceColor(replyDraft.confidence)}`}>
                  {confidenceLabel(replyDraft.confidence)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">
                Added to Review Queue. Edit below to update, then approve from the Queue page.
              </p>
              <Textarea
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                rows={6}
                className="text-sm font-mono bg-white"
              />
            </CardContent>
          </Card>
        )}

        {/* Calendar suggestion */}
        {calendarEvent && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-1.5 text-amber-800">
                <Calendar className="h-4 w-4" /> Calendar Event Detected
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm font-medium">{calendarEvent.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {calendarEvent.startTime
                  ? formatFullDate(new Date(calendarEvent.startTime))
                  : "Time TBD"}{" "}
                · <Badge variant="outline" className="text-xs">{calendarEvent.type}</Badge>
              </p>
              <p className="text-xs text-amber-700 mt-2">
                Pending approval in the Review Queue →
              </p>
            </CardContent>
          </Card>
        )}

        {/* Email body toggle */}
        <div>
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            onClick={() => setShowBody(!showBody)}
          >
            {showBody ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showBody ? "Hide" : "Show"} email body
          </button>
          {showBody && (
            <div className="rounded-lg border bg-muted/30 p-4">
              {email.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap font-sans">{email.bodyText ?? email.snippet}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
