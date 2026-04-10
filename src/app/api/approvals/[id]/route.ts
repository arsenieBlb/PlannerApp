import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApprovalActionSchema } from "@/lib/validations";
import { approveCalendarSuggestion } from "@/lib/calendar/client";
import { sendGmailReply } from "@/lib/gmail/sync";
import { addMinutes } from "date-fns";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = ApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action, editedContent, snoozeDuration } = parsed.data;

  const item = await prisma.approvalItem.findFirst({
    where: { id, profileId: session.userId },
    include: {
      replyDraft: true,
      calendarSuggestion: true,
      task: true,
      email: true,
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = await prisma.profile.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  });

  switch (action) {
    case "approve": {
      // Handle type-specific approval logic
      if (item.type === "reply" && item.replyDraft) {
        const draft = item.replyDraft;
        const bodyToSend = editedContent ?? draft.editedBody ?? draft.body;

        if (profile?.settings?.autoSendReplies && session.accessToken && item.email) {
          // Auto-send mode: send immediately
          const sentId = await sendGmailReply(
            session.accessToken,
            item.email.threadId ?? item.emailId ?? "",
            item.email.fromEmail,
            draft.subject ?? `Re: ${item.email.subject}`,
            bodyToSend
          );
          await prisma.replyDraft.update({
            where: { id: draft.id },
            data: { status: "sent", editedBody: editedContent ?? undefined, sentAt: new Date() },
          });
          await prisma.auditLog.create({
            data: {
              profileId: session.userId,
              action: "reply_sent",
              entityType: "reply",
              entityId: draft.id,
              details: JSON.stringify({ sentId }),
            },
          });
        } else {
          // Mark as approved (user needs to manually send or it goes to Gmail drafts)
          await prisma.replyDraft.update({
            where: { id: draft.id },
            data: { status: "approved", editedBody: editedContent ?? undefined },
          });
        }
      } else if (item.type === "calendar_event" && item.calendarSuggestion) {
        if (session.accessToken) {
          await approveCalendarSuggestion(
            session.userId,
            item.calendarSuggestion.id,
            session.accessToken
          );
        } else {
          await prisma.calendarSuggestion.update({
            where: { id: item.calendarSuggestion.id },
            data: { status: "approved" },
          });
        }
      } else if (item.type === "task" && item.task) {
        // Task approved — mark as acknowledged
        await prisma.task.update({
          where: { id: item.task.id },
          data: { status: "pending" }, // stays pending — user will mark done later
        });
      }

      await prisma.approvalItem.update({
        where: { id },
        data: { status: "approved", processedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          profileId: session.userId,
          action: `${item.type}_approved`,
          entityType: item.type,
          entityId: id,
        },
      });

      break;
    }

    case "edit": {
      if (item.type === "reply" && item.replyDraft && editedContent) {
        await prisma.replyDraft.update({
          where: { id: item.replyDraft.id },
          data: { editedBody: editedContent, status: "edited" },
        });
      }
      // Leave approval item as pending after edit so user can approve after reviewing
      break;
    }

    case "reject": {
      await prisma.approvalItem.update({
        where: { id },
        data: { status: "rejected", processedAt: new Date() },
      });

      if (item.type === "reply" && item.replyDraft) {
        await prisma.replyDraft.update({ where: { id: item.replyDraft.id }, data: { status: "rejected" } });
      } else if (item.type === "calendar_event" && item.calendarSuggestion) {
        await prisma.calendarSuggestion.update({ where: { id: item.calendarSuggestion.id }, data: { status: "rejected" } });
      }

      break;
    }

    case "snooze": {
      const minutes = snoozeDuration ?? 60;
      await prisma.approvalItem.update({
        where: { id },
        data: { status: "snoozed", snoozedUntil: addMinutes(new Date(), minutes) },
      });
      break;
    }
  }

  return NextResponse.json({ data: { ok: true, action } });
}
