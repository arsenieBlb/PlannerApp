import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai/provider";
import { stringifyArray, parseJsonArray } from "@/lib/utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const email = await prisma.email.findFirst({
    where: { id, profileId: session.userId },
    include: {
      replySuggestions: true,
      calendarSuggestions: true,
      extractedTasks: true,
    },
  });

  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      ...email,
      toEmails: parseJsonArray(email.toEmails),
      ccEmails: parseJsonArray(email.ccEmails),
      labels: parseJsonArray(email.labels),
      aiTags: parseJsonArray(email.aiTags),
    },
  });
}

// POST /api/gmail/message/:id — perform AI action on email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { action: string; style?: string };

  const email = await prisma.email.findFirst({
    where: { id, profileId: session.userId },
  });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = await prisma.profile.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  });

  const ai = getAIProvider(profile?.settings?.aiProvider ?? "mock");
  const content = {
    subject: email.subject,
    from: email.fromEmail,
    bodyText: email.bodyText,
    snippet: email.snippet,
  };

  switch (body.action) {
    case "summarize": {
      const summary = await ai.summarizeEmail(content);
      await prisma.email.update({
        where: { id },
        data: { aiSummary: summary.summary, aiProcessedAt: new Date() },
      });
      return NextResponse.json({ data: summary });
    }

    case "classify": {
      const classification = await ai.classifyEmail(content);
      await prisma.email.update({
        where: { id },
        data: {
          aiCategory: classification.category,
          aiPriority: classification.priority,
          aiTags: stringifyArray(classification.tags),
          aiConfidence: classification.confidence,
          aiProcessedAt: new Date(),
        },
      });
      return NextResponse.json({ data: classification });
    }

    case "suggest_reply": {
      const style = (body.style ?? profile?.settings?.defaultReplyStyle ?? "normal") as
        | "concise"
        | "normal"
        | "formal";
      const suggestion = await ai.suggestReply(content, style);

      const draft = await prisma.replyDraft.create({
        data: {
          emailId: id,
          subject: suggestion.subject,
          body: suggestion.body,
          style,
          confidence: suggestion.confidence,
        },
      });

      // Add to approval queue
      await prisma.approvalItem.create({
        data: {
          profileId: session.userId,
          type: "reply",
          status: "pending",
          priority: email.aiPriority === "high" ? "high" : "normal",
          title: `Reply to: ${email.subject ?? email.fromEmail}`,
          description: `${style} style reply draft`,
          emailId: id,
          replyDraftId: draft.id,
        },
      });

      return NextResponse.json({ data: { draft, suggestion } });
    }

    case "extract_calendar": {
      const event = await ai.extractCalendarEvent(content);
      if (!event) return NextResponse.json({ data: null });

      const suggestion = await prisma.calendarSuggestion.create({
        data: {
          emailId: id,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          type: event.type,
          confidence: event.confidence,
        },
      });

      await prisma.approvalItem.create({
        data: {
          profileId: session.userId,
          type: "calendar_event",
          status: "pending",
          priority: "normal",
          title: `Add to calendar: ${event.title}`,
          emailId: id,
          calendarSuggestionId: suggestion.id,
        },
      });

      return NextResponse.json({ data: { suggestion, event } });
    }

    case "no_reply": {
      const currentTags = parseJsonArray<string>(email.aiTags);
      const newTags = [
        ...currentTags.filter((t) => t !== "needs_reply"),
        "no_reply_needed",
      ];
      await prisma.email.update({
        where: { id },
        data: { aiTags: stringifyArray(newTags) },
      });
      return NextResponse.json({ data: { ok: true } });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
