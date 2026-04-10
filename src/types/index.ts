// ─── Core domain types ──────────────────────────────────────────────────────

export type EmailCategory =
  | "meeting"
  | "deadline"
  | "personal"
  | "work"
  | "school"
  | "newsletter"
  | "other";

export type EmailPriority = "high" | "normal" | "low";

export type EmailTag =
  | "needs_reply"
  | "meeting"
  | "deadline"
  | "urgent"
  | "personal"
  | "work"
  | "school"
  | "action_required"
  | "no_reply_needed";

export type ReplyStyle = "concise" | "normal" | "formal";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "snoozed"
  | "done";

export type ApprovalType = "reply" | "calendar_event" | "task" | "reminder";

export type PlannerItemType =
  | "event"
  | "task"
  | "reminder"
  | "deadline"
  | "block";

export type CalendarEventType = "event" | "deadline" | "reminder" | "meeting";

// ─── Enriched email (from DB + parsed JSON fields) ──────────────────────────

export interface ParsedEmail {
  id: string;
  gmailId: string;
  threadId: string;
  profileId: string;
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
  aiSummary: string | null;
  aiCategory: EmailCategory | null;
  aiPriority: EmailPriority;
  aiTags: EmailTag[];
  aiConfidence: number;
  aiProcessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI provider types ────────────────────────────────────────────────────────

export interface EmailContent {
  subject: string | null;
  from: string;
  bodyText: string | null;
  snippet: string | null;
  threadContext?: string; // previous messages in thread
}

export interface EmailSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  confidence: number;
}

export interface EmailClassification {
  category: EmailCategory;
  priority: EmailPriority;
  tags: EmailTag[];
  confidence: number;
  reasoning: string;
}

export interface ReplySuggestion {
  subject: string;
  body: string;
  style: ReplyStyle;
  confidence: number;
  tone: string;
}

export interface CalendarEventSuggestion {
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  type: CalendarEventType;
  confidence: number;
}

export interface TaskExtraction {
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: EmailPriority;
  confidence: number;
}

// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationType =
  | "new_email"
  | "draft_ready"
  | "meeting_detected"
  | "deadline_detected"
  | "upcoming_event"
  | "approval_pending";

export interface PushPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
