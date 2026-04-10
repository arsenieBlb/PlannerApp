/**
 * Gmail sync engine: fetches messages from Gmail API and upserts to local DB.
 * Also runs AI enrichment on new messages if enabled.
 */

import { prisma } from "@/lib/db";
import { getGmailClient } from "./client";
import { getGmailPartHeader, parseGmailMessage } from "./parser";
import { getAIProvider } from "@/lib/ai/provider";
import { stringifyArray } from "@/lib/utils";
import { sendPushToProfile } from "@/lib/push/server";
import type { PushPayload, ReplyStyle } from "@/types";

/** Gmail list API allows up to 500 per request; we paginate so mail below the first page still syncs. */
const LIST_PAGE_SIZE = 100;
const MAX_MESSAGES_LISTED_PER_SYNC = 500;

function normalizeReplyStyle(raw: string | undefined): ReplyStyle {
  return raw === "concise" || raw === "formal" ? raw : "normal";
}

/** Meeting invites and proposals usually expect a response even without a literal question mark. */
function withMeetingNeedsReplyTags(
  tags: string[],
  category: string
): string[] {
  const set = new Set(tags);
  if (
    (category === "meeting" || set.has("meeting")) &&
    !set.has("no_reply_needed")
  ) {
    set.add("needs_reply");
  }
  return Array.from(set);
}

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

  const maxListed =
    options.maxMessages ?? MAX_MESSAGES_LISTED_PER_SYNC;

  const labelIds = options.labelIds ?? ["INBOX"];
  const messageList: { id?: string | null }[] = [];
  let pageToken: string | undefined;

  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      labelIds,
      maxResults: Math.min(LIST_PAGE_SIZE, maxListed - messageList.length),
      pageToken,
    });
    const batch = listRes.data.messages ?? [];
    messageList.push(...batch);
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (
    pageToken &&
    messageList.length < maxListed
  );

  const listedGmailIds = messageList
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const existingIds = new Set(
    (
      await prisma.email.findMany({
        where: { profileId, gmailId: { in: listedGmailIds } },
        select: { gmailId: true },
      })
    ).map((e) => e.gmailId)
  );

  const newMessages = messageList.filter(
    (m) => m.id && !existingIds.has(m.id)
  );

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

        const finalTags = withMeetingNeedsReplyTags(
          classification.tags,
          classification.category
        );

        await prisma.email.update({
          where: { id: email.id },
          data: {
            aiCategory: classification.category,
            aiPriority: classification.priority,
            aiTags: stringifyArray(finalTags),
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

        if (finalTags.includes("needs_reply")) {
          const existingReply = await prisma.approvalItem.findFirst({
            where: {
              emailId: email.id,
              type: "reply",
              status: "pending",
            },
          });
          if (!existingReply) {
            try {
              const style = normalizeReplyStyle(
                profile.settings?.defaultReplyStyle
              );
              const replySuggestion = await ai.suggestReply(content, style);
              const draft = await prisma.replyDraft.create({
                data: {
                  emailId: email.id,
                  subject: replySuggestion.subject,
                  body: replySuggestion.body,
                  style,
                  confidence: replySuggestion.confidence,
                },
              });
              await prisma.approvalItem.create({
                data: {
                  profileId,
                  type: "reply",
                  status: "pending",
                  priority: classification.priority,
                  title: `Reply: ${email.subject ?? "email"}`,
                  description: `${style} style draft from auto-process`,
                  emailId: email.id,
                  replyDraftId: draft.id,
                },
              });
            } catch (err) {
              errors.push(
                `Reply draft queue failed for ${email.id}: ${String(err)}`
              );
            }
          }
        }

        // Push notification for high-priority emails needing reply
        if (
          classification.priority === "high" &&
          finalTags.includes("needs_reply") &&
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

/** Seeded / demo rows are not real Gmail messages — API send will always fail. */
export function isDemoGmailId(gmailId: string): boolean {
  return gmailId.startsWith("seed_") || gmailId.startsWith("demo_");
}

function normalizeMessageId(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.startsWith("<") ? t : `<${t}>`;
}

/** RFC 5322-style plain-text MIME body for replies (used by send + outbound payload). */
export function buildMimePlainReply(
  toEmail: string,
  subject: string,
  body: string,
  threading?: { inReplyTo: string | null; references: string | null }
): string {
  const lines: string[] = [`To: ${toEmail}`, `Subject: ${subject}`];
  if (threading?.inReplyTo) {
    lines.push(`In-Reply-To: ${threading.inReplyTo}`);
    lines.push(`References: ${threading.references ?? threading.inReplyTo}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(body.replace(/\r?\n/g, "\r\n"));
  return lines.join("\r\n");
}

export async function resolveGmailReplyThreading(
  accessToken: string,
  gmailId: string
): Promise<{ inReplyTo: string | null; references: string | null }> {
  if (isDemoGmailId(gmailId)) {
    return { inReplyTo: null, references: null };
  }
  const gmail = getGmailClient(accessToken);
  try {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: gmailId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References", "In-Reply-To"],
    });
    const headers = msg.data.payload?.headers;
    const origMid = normalizeMessageId(
      getGmailPartHeader(headers, "Message-ID") ?? undefined
    );
    const prevRefs =
      getGmailPartHeader(headers, "References") ?? undefined;
    const prevIrt =
      getGmailPartHeader(headers, "In-Reply-To") ?? undefined;

    if (origMid) {
      const inReplyTo = origMid;
      const references =
        [prevRefs, prevIrt, origMid].filter(Boolean).join(" ").trim() || origMid;
      return { inReplyTo, references };
    }
  } catch (e) {
    console.warn("[Gmail] Could not load Message-ID for reply; sending without thread headers:", e);
  }
  return { inReplyTo: null, references: null };
}

/**
 * Send a reply in-thread. Uses the original message's RFC Message-ID for
 * In-Reply-To / References (not Gmail threadId — that was causing send failures).
 */
export async function sendGmailReply(
  accessToken: string,
  threadId: string,
  toEmail: string,
  subject: string,
  body: string,
  options?: { gmailId?: string }
): Promise<string> {
  const gmailId = options?.gmailId;
  if (gmailId && isDemoGmailId(gmailId)) {
    throw new Error("DEMO_EMAIL");
  }

  const gmail = getGmailClient(accessToken);
  const threading =
    gmailId && !isDemoGmailId(gmailId)
      ? await resolveGmailReplyThreading(accessToken, gmailId)
      : { inReplyTo: null as string | null, references: null as string | null };

  const rawMessage = buildMimePlainReply(
    toEmail,
    subject,
    body,
    threading.inReplyTo ? threading : undefined
  );

  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      ...(threadId ? { threadId } : {}),
    },
  });

  return res.data.id!;
}
