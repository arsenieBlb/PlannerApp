/**
 * Structured outbound reply when Gmail API send is skipped (manual send, demo data, or errors).
 * Safe to serialize to JSON for APIs and the DB `ReplyDraft.outboundPayload` field.
 */
export type ReplyOutboundPayload = {
  version: 1;
  to: string;
  subject: string;
  bodyText: string;
  gmail: {
    threadId: string;
    messageId: string;
  };
  threading?: {
    inReplyTo: string | null;
    references: string | null;
  };
  /** schema.org EmailMessage as JSON-LD (for structured consumers / future rich clients) */
  schemaOrgEmailMessage: Record<string, unknown>;
  /** RFC 5322-style headers + body; paste into some clients or debugging */
  mimeDraft: string;
  flags: {
    demoInboxData: boolean;
  };
};
