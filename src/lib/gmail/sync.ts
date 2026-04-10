/**
 * Gmail sync engine: fetches messages from Gmail API and upserts to local DB.
 * Also runs AI enrichment on new messages if enabled.
 */

import { prisma } from "@/lib/db";
import { getGmailClient } from "./client";
import { parseGmailMessage } from "./parser";
import { getAIProvider } from "@/lib/ai/provider";
import { stringifyArray } from "@/lib/utils";
import { sendPushToProfile } from "@/lib/push/server";
import type { PushPayload } from "@/types";

const MAX_MESSAGES_PER_SYNC = 50;

export async function syncGmailForProfile(
  profileId: string,
  accessToken: string,
  options: { maxMessages?: number; labelIds?: string[] } = {}
): Promise<{ synced: number; errors: string[] }> {
  const gmail = getGmailClient(accessToken);
  const errors: string[] = [];
  let synced = 0;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { settings: true },
  });
  if (!profile) throw new Error("Profile not found");

  const maxMessages = options.maxMessages ?? MAX_MESSAGES_PER_SYNC;

  // List messages (inbox, unread first)
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: options.labelIds ?? ["INBOX"],
    maxResults: maxMessages,
  });

  const messageList = listRes.data.messages ?? [];

  // Fetch known Gmail IDs to skip already-processed
  const existingIds = new Set(
    (
      await prisma.email.findMany({
        where: { profileId, gmailId: { in: messageList.map((m) => m.id!) } },
        select: { gmailId: true },
      })
    ).map((e) => e.gmailId)
  );

  const newMessages = messageList.filter((m) => !existingIds.has(m.id!));

  for (const msgRef of newMessages) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id!,
        format: "full",
      });

      const parsed = parseGmailMessage(msgRes.data);

      await prisma.email.upsert({
        where: { gmailId: parsed.gmailId },
        create: {
          gmailId: parsed.gmailId,
          threadId: parsed.threadId,
          profileId,
          subject: parsed.subject,
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          toEmails: stringifyArray(parsed.toEmails),
          ccEmails: stringifyArray(parsed.ccEmails),
          snippet: parsed.snippet,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          receivedAt: parsed.receivedAt,
          isRead: parsed.isRead,
          isStarred: parsed.isStarred,
          labels: stringifyArray(parsed.labels),
        },
        update: {
          isRead: parsed.isRead,
          isStarred: parsed.isStarred,
          labels: stringifyArray(parsed.labels),
        },
      });

      synced++;
    } catch (err) {
      errors.push(`Failed to sync ${msgRef.id}: ${String(err)}`);
    }
  }

  // AI enrichment pass for new unprocessed emails
  if (profile.settings?.autoProcessEmails) {
    const unenriched = await prisma.email.findMany({
      where: { profileId, aiProcessedAt: null },
      take: 20,
      orderBy: { receivedAt: "desc" },
    });

    const ai = getAIProvider(profile.settings.aiProvider);

    for (const email of unenriched) {
      try {
        const content = {
          subject: email.subject,
          from: email.fromEmail,
          bodyText: email.bodyText,
          snippet: email.snippet,
        };

        const [classification, calendarEvent, tasks] = await Promise.all([
          ai.classifyEmail(content),
          ai.extractCalendarEvent(content),
          ai.extractTasksAndDeadlines(content),
        ]);

        await prisma.email.update({
          where: { id: email.id },
          data: {
            aiCategory: classification.category,
            aiPriority: classification.priority,
            aiTags: stringifyArray(classification.tags),
            aiConfidence: classification.confidence,
            aiProcessedAt: new Date(),
          },
        });

        // Create calendar suggestion if found
        if (calendarEvent) {
          const suggestion = await prisma.calendarSuggestion.create({
            data: {
              emailId: email.id,
              title: calendarEvent.title,
              description: calendarEvent.description,
              startTime: calendarEvent.startTime,
              endTime: calendarEvent.endTime,
              location: calendarEvent.location,
              type: calendarEvent.type,
              confidence: calendarEvent.confidence,
            },
          });

          await prisma.approvalItem.create({
            data: {
              profileId,
              type: "calendar_event",
              status: "pending",
              priority: "normal",
              title: `Add to calendar: ${calendarEvent.title}`,
              description: `Detected from: ${email.subject ?? "email"}`,
              emailId: email.id,
              calendarSuggestionId: suggestion.id,
            },
          });
        }

        // Create task approval items
        for (const task of tasks) {
          const createdTask = await prisma.task.create({
            data: {
              emailId: email.id,
              title: task.title,
              description: task.description,
              dueDate: task.dueDate,
              priority: task.priority,
            },
          });

          await prisma.approvalItem.create({
            data: {
              profileId,
              type: "task",
              status: "pending",
              priority: task.priority,
              title: task.title,
              description: task.description ?? undefined,
              emailId: email.id,
              taskId: createdTask.id,
            },
          });
        }

        // Push notification for high-priority emails needing reply
        if (
          classification.priority === "high" &&
          classification.tags.includes("needs_reply") &&
          profile.settings.notifyNewEmails
        ) {
          const payload: PushPayload = {
            type: "new_email",
            title: "Important email needs reply",
            body: email.subject ?? "New email",
            url: `/inbox?emailId=${email.id}`,
          };
          await sendPushToProfile(profileId, payload).catch(() => {});
        }
      } catch (err) {
        errors.push(`AI enrichment failed for ${email.id}: ${String(err)}`);
      }
    }
  }

  // Update last sync time
  await prisma.settings.updateMany({
    where: { profileId },
    data: { lastGmailSync: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      profileId,
      action: "email_synced",
      details: JSON.stringify({ synced, errors: errors.length }),
    },
  });

  return { synced, errors };
}

export async function sendGmailReply(
  accessToken: string,
  threadId: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<string> {
  const gmail = getGmailClient(accessToken);

  const rawMessage = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      threadId,
    },
  });

  return res.data.id!;
}
