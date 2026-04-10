/**
 * Parses raw Gmail API message payloads into clean structured data.
 */

import type { gmail_v1 } from "googleapis";

export interface ParsedGmailMessage {
  gmailId: string;
  threadId: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractPartsRecursive(
  parts: gmail_v1.Schema$MessagePart[],
  acc: { text: string | null; html: string | null }
): void {
  for (const part of parts) {
    const mime = part.mimeType ?? "";
    const data = part.body?.data;

    if (mime === "text/plain" && data && !acc.text) {
      acc.text = decodeBase64Url(data);
    } else if (mime === "text/html" && data && !acc.html) {
      acc.html = decodeBase64Url(data);
    } else if (part.parts) {
      extractPartsRecursive(part.parts, acc);
    }
  }
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string | null {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

function parseEmailAddress(raw: string): { name: string | null; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, "") || null,
      email: match[2].trim(),
    };
  }
  return { name: null, email: raw.trim() };
}

function parseEmailList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseEmailAddress(s.trim()).email)
    .filter(Boolean);
}

export function parseGmailMessage(
  msg: gmail_v1.Schema$Message
): ParsedGmailMessage {
  const payload = msg.payload ?? {};
  const headers = payload.headers ?? [];

  const subject = getHeader(headers, "subject");
  const fromRaw = getHeader(headers, "from") ?? "";
  const toRaw = getHeader(headers, "to");
  const ccRaw = getHeader(headers, "cc");
  const dateRaw = getHeader(headers, "date");

  const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);

  const bodyAcc: { text: string | null; html: string | null } = {
    text: null,
    html: null,
  };

  if (payload.body?.data) {
    const mime = payload.mimeType ?? "";
    if (mime === "text/plain") bodyAcc.text = decodeBase64Url(payload.body.data);
    if (mime === "text/html") bodyAcc.html = decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    extractPartsRecursive(payload.parts, bodyAcc);
  }

  const labels = msg.labelIds ?? [];
  const isRead = !labels.includes("UNREAD");
  const isStarred = labels.includes("STARRED");

  const receivedAt = dateRaw
    ? new Date(dateRaw)
    : msg.internalDate
    ? new Date(parseInt(msg.internalDate))
    : new Date();

  return {
    gmailId: msg.id!,
    threadId: msg.threadId!,
    subject,
    fromName,
    fromEmail,
    toEmails: parseEmailList(toRaw),
    ccEmails: parseEmailList(ccRaw),
    snippet: msg.snippet ?? null,
    bodyText: bodyAcc.text,
    bodyHtml: bodyAcc.html,
    receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    isRead,
    isStarred,
    labels,
  };
}
