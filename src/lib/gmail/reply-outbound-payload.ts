import type { ReplyOutboundPayload } from "@/types/reply-outbound";
import {
  buildMimePlainReply,
  isDemoGmailId,
  resolveGmailReplyThreading,
} from "./sync";

export async function buildReplyOutboundPayload(
  accessToken: string | null | undefined,
  input: {
    gmailId: string;
    threadId: string;
    toEmail: string;
    subject: string;
    bodyText: string;
  }
): Promise<ReplyOutboundPayload> {
  const demo = isDemoGmailId(input.gmailId);
  const threading =
    accessToken && !demo
      ? await resolveGmailReplyThreading(accessToken, input.gmailId)
      : { inReplyTo: null as string | null, references: null as string | null };

  const threadingBlock = threading.inReplyTo ? threading : undefined;
  const mimeDraft = buildMimePlainReply(
    input.toEmail,
    input.subject,
    input.bodyText,
    threadingBlock
  );

  const schemaOrgEmailMessage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "EmailMessage",
    name: input.subject,
    text: input.bodyText,
    recipient: {
      "@type": "Person",
      email: input.toEmail,
    },
    ...(threading.inReplyTo
      ? {
          /** RFC Message-ID of the message being replied to */
          identifier: threading.inReplyTo,
        }
      : {}),
    ...(demo
      ? {
          disambiguatingDescription:
            "Demo or seed inbox row — not a real Gmail message; send manually from your client.",
        }
      : {}),
  };

  return {
    version: 1,
    to: input.toEmail,
    subject: input.subject,
    bodyText: input.bodyText,
    gmail: { threadId: input.threadId, messageId: input.gmailId },
    ...(threadingBlock ? { threading: threadingBlock } : {}),
    schemaOrgEmailMessage,
    mimeDraft,
    flags: { demoInboxData: demo },
  };
}
