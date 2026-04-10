import { z } from "zod";

// ─── Email actions ─────────────────────────────────────────────────────────

export const SummarizeEmailSchema = z.object({
  emailId: z.string().cuid(),
});

export const SuggestReplySchema = z.object({
  emailId: z.string().cuid(),
  style: z.enum(["concise", "normal", "formal"]).default("normal"),
});

export const EmailActionSchema = z.object({
  emailId: z.string().cuid(),
  action: z.enum(["summarize", "classify", "suggest_reply", "no_reply", "create_task"]),
  payload: z.record(z.unknown()).optional(),
});

// ─── Approval actions ─────────────────────────────────────────────────────

export const ApprovalActionSchema = z.object({
  action: z.enum(["approve", "reject", "snooze", "edit"]),
  editedContent: z.string().optional(),
  snoozeDuration: z.number().int().positive().optional(), // minutes
  /** Approve reply only: send through Gmail API (in addition to Settings → auto-send) */
  sendViaGmail: z.boolean().optional(),
});

// ─── Calendar / Planner ────────────────────────────────────────────────────

export const CreatePlannerItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["event", "task", "reminder", "deadline", "block"]),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  tags: z.array(z.string()).default([]),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  isAllDay: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  recurringRule: z.string().optional(),
});

export const UpdatePlannerItemSchema = CreatePlannerItemSchema.partial().extend({
  status: z.enum(["pending", "done", "cancelled"]).optional(),
});

// ─── Push notifications ────────────────────────────────────────────────────

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

// ─── Settings ─────────────────────────────────────────────────────────────

export const UpdateSettingsSchema = z.object({
  aiProvider: z.enum(["mock", "openai", "anthropic"]).optional(),
  defaultReplyStyle: z.enum(["concise", "normal", "formal"]).optional(),
  autoProcessEmails: z.boolean().optional(),
  autoSendReplies: z.boolean().optional(),
  autoCreateEvents: z.boolean().optional(),
  notifyNewEmails: z.boolean().optional(),
  notifyDrafts: z.boolean().optional(),
  notifyMeetings: z.boolean().optional(),
  notifyDeadlines: z.boolean().optional(),
  notifyReminders: z.boolean().optional(),
  trustedSenders: z.array(z.string().email()).optional(),
  trustedDomains: z.array(z.string()).optional(),
  gmailSyncEnabled: z.boolean().optional(),
  calendarSyncEnabled: z.boolean().optional(),
});
