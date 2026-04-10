import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApprovalActionSchema } from "@/lib/validations";
import { sendGmailReply } from "@/lib/gmail/sync";
import { buildReplyOutboundPayload } from "@/lib/gmail/reply-outbound-payload";
import type { ReplyOutboundPayload } from "@/types/reply-outbound";
import { addMinutes } from "date-fns";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = ApprovalActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { action, editedContent, snoozeDuration, sendViaGmail } = parsed.data;

    const item = await prisma.approvalItem.findFirst({
      where: { id, profileId: session.userId },
      include: {
        replyDraft: true,
        calendarSuggestion: true,
        task: true,
        email: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: session.userId },
      include: { settings: true },
    });

    const warnings: string[] = [];
    let replyOutbound: ReplyOutboundPayload | undefined;
    let sentReplyViaGmail = false;

    switch (action) {
      case "approve": {
        // ── Reply draft ─────────────────────────────────────────────────────
        if (item.type === "reply" && item.replyDraft) {
          const draft = item.replyDraft;
          const bodyToSend = editedContent ?? draft.editedBody ?? draft.body;
          const email = item.email;
          const subjectLine =
            draft.subject ?? `Re: ${email?.subject ?? "your message"}`;

          const accessToken = session.accessToken;
          const wantsGmailSend =
            profile?.settings?.autoSendReplies === true || sendViaGmail === true;
          const tokenOk = !!accessToken && session.error !== "RefreshAccessTokenError";
          const tryAutoSend = wantsGmailSend && tokenOk && !!email;

          if (tryAutoSend && email && accessToken) {
            try {
              const sentId = await sendGmailReply(
                accessToken,
                email.threadId,
                email.fromEmail,
                subjectLine,
                bodyToSend,
                { gmailId: email.gmailId }
              );
              await prisma.replyDraft.update({
                where: { id: draft.id },
                data: {
                  status: "sent",
                  editedBody: editedContent ?? undefined,
                  sentAt: new Date(),
                  outboundPayload: Prisma.DbNull,
                },
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
              sentReplyViaGmail = true;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[Approvals] Gmail send failed:", err);
              if (msg === "DEMO_EMAIL") {
                warnings.push(
                  "This email is demo/seed data — Gmail cannot send it. Structured reply (JSON-LD + MIME) is saved — use Copy below."
                );
              } else {
                warnings.push(
                  "Gmail could not send this reply. Draft is approved with structured payload (JSON-LD + MIME) for manual send."
                );
              }
              const payload = await buildReplyOutboundPayload(session.accessToken, {
                gmailId: email.gmailId,
                threadId: email.threadId,
                toEmail: email.fromEmail,
                subject: subjectLine,
                bodyText: bodyToSend,
              });
              replyOutbound = payload;
              await prisma.replyDraft.update({
                where: { id: draft.id },
                data: {
                  status: "approved",
                  editedBody: editedContent ?? undefined,
                  outboundPayload: payload as Prisma.InputJsonValue,
                },
              });
            }
          } else if (email) {
            if (wantsGmailSend && !tokenOk) {
              warnings.push(
                "Could not send via Gmail — sign in again or check Google connection. Reply saved with copy/paste payload."
              );
            }
            const payload = await buildReplyOutboundPayload(session.accessToken, {
              gmailId: email.gmailId,
              threadId: email.threadId,
              toEmail: email.fromEmail,
              subject: subjectLine,
              bodyText: bodyToSend,
            });
            replyOutbound = payload;
            await prisma.replyDraft.update({
              where: { id: draft.id },
              data: {
                status: "approved",
                editedBody: editedContent ?? undefined,
                outboundPayload: payload as Prisma.InputJsonValue,
              },
            });
          } else {
            await prisma.replyDraft.update({
              where: { id: draft.id },
              data: { status: "approved", editedBody: editedContent ?? undefined },
            });
          }
        }

        // ── Calendar event ──────────────────────────────────────────────────
        else if (item.type === "calendar_event" && item.calendarSuggestion) {
          let googleEventId: string | null = null;

          if (session.accessToken && profile?.settings?.calendarSyncEnabled) {
            try {
              // Lazy import so a missing token doesn't crash the whole route
              const { createCalendarEvent } = await import("@/lib/calendar/client");
              const suggestion = item.calendarSuggestion;
              googleEventId = await createCalendarEvent(session.accessToken, {
                title: suggestion.title,
                description: suggestion.description,
                startTime: suggestion.startTime,
                endTime: suggestion.endTime,
                location: suggestion.location,
              });
            } catch (err) {
              console.error("[Approvals] Google Calendar create failed:", err);
              warnings.push(
                "Could not create event in Google Calendar — it may not be enabled or connected. Event marked approved locally."
              );
            }
          } else if (!profile?.settings?.calendarSyncEnabled) {
            warnings.push("Google Calendar sync is off. Event approved locally only. Enable it in Settings.");
          }

          await prisma.calendarSuggestion.update({
            where: { id: item.calendarSuggestion.id },
            data: {
              status: googleEventId ? "created" : "approved",
              googleEventId: googleEventId ?? undefined,
            },
          });

          await prisma.auditLog.create({
            data: {
              profileId: session.userId,
              action: "event_created",
              entityType: "calendar_suggestion",
              entityId: item.calendarSuggestion.id,
              details: JSON.stringify({ googleEventId, title: item.calendarSuggestion.title }),
            },
          });
        }

        // ── Task ────────────────────────────────────────────────────────────
        else if (item.type === "task" && item.task) {
          await prisma.task.update({
            where: { id: item.task.id },
            data: { status: "pending" },
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
        // Leave approval item as pending so user can approve after reviewing
        break;
      }

      case "reject": {
        await prisma.approvalItem.update({
          where: { id },
          data: { status: "rejected", processedAt: new Date() },
        });

        if (item.type === "reply" && item.replyDraft) {
          await prisma.replyDraft.update({
            where: { id: item.replyDraft.id },
            data: { status: "rejected" },
          });
        } else if (item.type === "calendar_event" && item.calendarSuggestion) {
          await prisma.calendarSuggestion.update({
            where: { id: item.calendarSuggestion.id },
            data: { status: "rejected" },
          });
        } else if (item.type === "task" && item.task) {
          await prisma.task.update({
            where: { id: item.task.id },
            data: { status: "cancelled" },
          });
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

    return NextResponse.json({
      data: { ok: true, action },
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(replyOutbound ? { outboundEmail: replyOutbound } : {}),
      ...(sentReplyViaGmail ? { sentReplyViaGmail: true } : {}),
    });
  } catch (err) {
    console.error("[Approvals PATCH] Unhandled error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred", detail: String(err) },
      { status: 500 }
    );
  }
}
