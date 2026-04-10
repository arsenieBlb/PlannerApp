import type { ParsedEmail } from "@/types";

/** Map GET /api/gmail/message/:id (or similar) JSON into ParsedEmail. */
export function normalizeEmailFromApi(raw: Record<string, unknown>): ParsedEmail {
  return {
    id: raw.id as string,
    gmailId: raw.gmailId as string,
    threadId: raw.threadId as string,
    profileId: raw.profileId as string,
    subject: (raw.subject as string | null) ?? null,
    fromName: (raw.fromName as string | null) ?? null,
    fromEmail: raw.fromEmail as string,
    toEmails: Array.isArray(raw.toEmails) ? (raw.toEmails as string[]) : [],
    ccEmails: Array.isArray(raw.ccEmails) ? (raw.ccEmails as string[]) : [],
    snippet: (raw.snippet as string | null) ?? null,
    bodyText: (raw.bodyText as string | null) ?? null,
    bodyHtml: (raw.bodyHtml as string | null) ?? null,
    receivedAt: new Date(raw.receivedAt as string),
    isRead: Boolean(raw.isRead),
    isStarred: Boolean(raw.isStarred),
    labels: Array.isArray(raw.labels) ? (raw.labels as string[]) : [],
    aiSummary: (raw.aiSummary as string | null) ?? null,
    aiCategory: raw.aiCategory as ParsedEmail["aiCategory"],
    aiPriority: (raw.aiPriority as ParsedEmail["aiPriority"]) ?? "normal",
    aiTags: Array.isArray(raw.aiTags) ? (raw.aiTags as ParsedEmail["aiTags"]) : [],
    aiConfidence: Number(raw.aiConfidence ?? 0),
    aiProcessedAt: raw.aiProcessedAt ? new Date(raw.aiProcessedAt as string) : null,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  };
}
