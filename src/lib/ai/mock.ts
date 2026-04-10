/**
 * Deterministic mock AI provider for development/demo mode.
 * Returns realistic outputs based on keyword detection — no API key required.
 */

import { addDays, addHours, startOfDay, setHours } from "date-fns";
import type { AIProvider } from "./types";
import type {
  EmailContent,
  EmailSummary,
  EmailClassification,
  ReplySuggestion,
  ReplyStyle,
  CalendarEventSuggestion,
  TaskExtraction,
  EmailCategory,
  EmailTag,
  EmailPriority,
} from "@/types";

function lower(text: string | null | undefined): string {
  return (text ?? "").toLowerCase();
}

function detect(content: EmailContent): {
  isMeeting: boolean;
  isDeadline: boolean;
  isNewsletter: boolean;
  isUrgent: boolean;
  isPersonal: boolean;
  isWork: boolean;
  isSchool: boolean;
  needsReply: boolean;
  combined: string;
} {
  const combined = [
    content.subject,
    content.bodyText,
    content.snippet,
    content.from,
  ]
    .map(lower)
    .join(" ");

  return {
    isMeeting:
      /\b(meeting|call|zoom|teams|interview|schedule|sync|standup|calendar|invite)\b/.test(combined),
    isDeadline:
      /\b(deadline|due|by (monday|tuesday|wednesday|thursday|friday|eod|eow)|urgent|asap|submit|submission)\b/.test(
        combined
      ),
    isNewsletter:
      /\b(unsubscribe|newsletter|digest|weekly|monthly|update)\b/.test(combined),
    isUrgent: /\b(urgent|asap|immediately|right away|critical|emergency)\b/.test(combined),
    isPersonal: /\b(mom|dad|family|friend|personal|birthday|party|dinner)\b/.test(combined),
    isWork:
      /\b(project|report|client|invoice|meeting|budget|sprint|pr|pull request|ticket|jira)\b/.test(
        combined
      ),
    isSchool:
      /\b(assignment|homework|exam|quiz|grade|professor|lecture|university|college|class|course)\b/.test(
        combined
      ),
    needsReply:
      /\b(please reply|let me know|respond|can you|could you|what do you|confirm|rsvp|\?)\b/.test(
        combined
      ),
    combined,
  };
}

function extractDateFromText(text: string): Date | null {
  const tomorrow = /\b(tomorrow)\b/i;
  const dayNames = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;

  if (tomorrow.test(text)) return addDays(new Date(), 1);
  if (dayNames.test(text)) return addDays(new Date(), 2);
  const m = text.match(datePattern);
  if (m) {
    const d = new Date();
    d.setMonth(parseInt(m[1]) - 1);
    d.setDate(parseInt(m[2]));
    return d;
  }
  return null;
}

export class MockAIProvider implements AIProvider {
  name = "mock";

  async summarizeEmail(content: EmailContent): Promise<EmailSummary> {
    const d = detect(content);
    const subject = content.subject ?? "No subject";

    let summary = `Email from ${content.from} regarding "${subject}".`;
    const keyPoints: string[] = [];
    const actionItems: string[] = [];

    if (d.isMeeting) {
      summary += " Contains a meeting request or calendar invite.";
      keyPoints.push("Meeting or call is being requested");
      actionItems.push("Confirm attendance or suggest alternate time");
    }
    if (d.isDeadline) {
      summary += " Mentions a deadline or time-sensitive item.";
      keyPoints.push("There is a deadline mentioned");
      actionItems.push("Note the deadline and plan accordingly");
    }
    if (d.needsReply) {
      keyPoints.push("A response is expected");
      actionItems.push("Draft and send a reply");
    }
    if (d.isNewsletter) {
      summary = `Newsletter or digest from ${content.from}.`;
      keyPoints.push("Informational content, likely no reply needed");
    }
    if (keyPoints.length === 0) {
      keyPoints.push("General correspondence");
    }

    return {
      summary,
      keyPoints,
      actionItems,
      confidence: 0.72,
    };
  }

  async classifyEmail(content: EmailContent): Promise<EmailClassification> {
    const d = detect(content);
    const tagSet = new Set<EmailTag>();

    let category: EmailCategory = "other";
    let priority: EmailPriority = "normal";

    if (d.isNewsletter) {
      category = "newsletter";
      priority = "low";
    } else if (d.isMeeting) {
      category = "meeting";
      tagSet.add("meeting");
      if (d.needsReply) tagSet.add("needs_reply");
    } else if (d.isDeadline) {
      category = "deadline";
      tagSet.add("deadline");
      priority = d.isUrgent ? "high" : "normal";
    } else if (d.isPersonal) {
      category = "personal";
      tagSet.add("personal");
    } else if (d.isSchool) {
      category = "school";
      tagSet.add("school");
    } else if (d.isWork) {
      category = "work";
      tagSet.add("work");
    }

    if (d.isUrgent) {
      tagSet.add("urgent");
      priority = "high";
    }
    if (d.needsReply) {
      tagSet.add("needs_reply");
    }

    return {
      category,
      priority,
      tags: Array.from(tagSet),
      confidence: 0.68,
      reasoning: `Detected signals: ${Object.entries(d)
        .filter(([k, v]) => k !== "combined" && v === true)
        .map(([k]) => k)
        .join(", ") || "none"}`,
    };
  }

  async suggestReply(
    content: EmailContent,
    style: ReplyStyle
  ): Promise<ReplySuggestion> {
    const subject = content.subject ?? "your message";
    const fromName = content.from.split("<")[0].trim() || "there";
    const d = detect(content);

    const greetings: Record<ReplyStyle, string> = {
      concise: `Hi,`,
      normal: `Hi ${fromName},`,
      formal: `Dear ${fromName},`,
    };

    const closings: Record<ReplyStyle, string> = {
      concise: `Thanks`,
      normal: `Best regards`,
      formal: `Sincerely`,
    };

    let body: string;

    if (d.isMeeting) {
      body =
        style === "concise"
          ? `Confirmed, works for me. See you then.`
          : style === "formal"
          ? `Thank you for the meeting invitation. I confirm my availability and look forward to our discussion.`
          : `Thanks for reaching out! That time works for me. Looking forward to the meeting.`;
    } else if (d.isDeadline) {
      body =
        style === "concise"
          ? `Noted — I'll have it ready by the deadline.`
          : style === "formal"
          ? `Thank you for the reminder. I will ensure the deliverable is completed by the specified deadline.`
          : `Thanks for the heads-up! I'll make sure to have everything ready in time.`;
    } else if (d.needsReply) {
      body =
        style === "concise"
          ? `Thanks for your message. I'll follow up shortly.`
          : style === "formal"
          ? `Thank you for your correspondence. I will review the matter and respond in due course.`
          : `Thanks for reaching out! I'll take a look and get back to you soon.`;
    } else {
      body =
        style === "concise"
          ? `Thanks for the update.`
          : style === "formal"
          ? `Thank you for the information provided. I will keep this in mind going forward.`
          : `Thanks for the info — I'll keep that in mind!`;
    }

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const fullBody = `${greetings[style]}\n\n${body}\n\n${closings[style]}`;

    return {
      subject: replySubject,
      body: fullBody,
      style,
      confidence: 0.65,
      tone: style === "formal" ? "Professional" : style === "concise" ? "Brief" : "Friendly",
    };
  }

  async draftReplyFromInstruction(
    content: EmailContent,
    instruction: string,
    style: ReplyStyle
  ): Promise<ReplySuggestion> {
    const subject = content.subject ?? "your message";
    const fromName = content.from.split("<")[0].trim() || "there";
    const inst = instruction.toLowerCase().trim();

    const greetings: Record<ReplyStyle, string> = {
      concise: `Hi,`,
      normal: `Hi ${fromName},`,
      formal: `Dear ${fromName},`,
    };
    const closings: Record<ReplyStyle, string> = {
      concise: `Thanks`,
      normal: `Best regards`,
      formal: `Sincerely`,
    };

    // Detect intent from instruction
    const isYes = /\b(yes|sure|ok|okay|works|confirm|accept|agree|fine|absolutely|definitely|of course)\b/.test(inst);
    const isNo = /\b(no|can'?t|cannot|decline|reject|unavailable|sorry|unfortunately|won'?t|won't)\b/.test(inst);
    const isDelay = /\b(later|postpone|reschedule|delay|next week|another time|not now|busy)\b/.test(inst);
    const isQuestion = /\?|more (info|detail|information)|clarif|what|when|where|how/.test(inst);

    let bodyCore = instruction; // fallback — use instruction as-is if nothing matches

    if (isYes && !isNo) {
      if (style === "concise") {
        bodyCore = `Confirmed — that works for me.`;
      } else if (style === "formal") {
        bodyCore = `Thank you for reaching out. I am happy to confirm and look forward to proceeding as discussed.`;
      } else {
        bodyCore = `Thanks for getting in touch! That works perfectly for me. Looking forward to it.`;
      }
      // Incorporate any specifics from the instruction
      const extras = instruction.replace(/yes|sure|ok|okay|works|confirm|accept|agree|fine|absolutely|definitely|of course/gi, "").trim();
      if (extras.length > 3) {
        bodyCore += ` ${extras.charAt(0).toUpperCase() + extras.slice(1)}.`;
      }
    } else if (isNo && !isYes) {
      if (style === "concise") {
        bodyCore = `Unfortunately I won't be able to make it. ${instruction}.`;
      } else if (style === "formal") {
        bodyCore = `Thank you for the invitation. Unfortunately, I will not be available. ${instruction}.`;
      } else {
        bodyCore = `Thanks for reaching out! Unfortunately I won't be able to join. ${instruction}.`;
      }
    } else if (isDelay) {
      if (style === "concise") {
        bodyCore = `Could we reschedule? ${instruction}.`;
      } else if (style === "formal") {
        bodyCore = `I appreciate the invitation, however I would like to request rescheduling. ${instruction}.`;
      } else {
        bodyCore = `Thanks for reaching out! I was wondering if we could find another time — ${instruction}.`;
      }
    } else if (isQuestion) {
      if (style === "concise") {
        bodyCore = `Quick question — ${instruction}`;
      } else if (style === "formal") {
        bodyCore = `Thank you for your message. I have a follow-up question: ${instruction}`;
      } else {
        bodyCore = `Thanks for your message! I just wanted to check — ${instruction}`;
      }
    } else {
      // Generic: wrap the instruction in the appropriate style
      if (style === "concise") {
        bodyCore = instruction;
      } else if (style === "formal") {
        bodyCore = `Thank you for your message. ${instruction.charAt(0).toUpperCase() + instruction.slice(1)}.`;
      } else {
        bodyCore = `Thanks for reaching out! ${instruction.charAt(0).toUpperCase() + instruction.slice(1)}.`;
      }
    }

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const fullBody = `${greetings[style]}\n\n${bodyCore}\n\n${closings[style]}`;

    return {
      subject: replySubject,
      body: fullBody,
      style,
      confidence: 0.80,
      tone: style === "formal" ? "Professional" : style === "concise" ? "Brief" : "Friendly",
    };
  }

  async extractCalendarEvent(
    content: EmailContent
  ): Promise<CalendarEventSuggestion | null> {
    const d = detect(content);
    if (!d.isMeeting && !d.isDeadline) return null;

    const subject = content.subject ?? "Event";
    const combined = d.combined;
    const detectedDate = extractDateFromText(combined);
    const baseDate = detectedDate ?? addDays(new Date(), 1);

    if (d.isMeeting) {
      const startTime = setHours(startOfDay(baseDate), 10);
      return {
        title: subject.replace(/^(re:|fwd:)\s*/i, ""),
        description: `Detected from email: "${content.snippet ?? subject}"`,
        startTime,
        endTime: addHours(startTime, 1),
        location: /zoom/.test(combined)
          ? "Zoom (link in email)"
          : /teams/.test(combined)
          ? "Microsoft Teams"
          : null,
        type: "meeting",
        confidence: 0.7,
      };
    }

    if (d.isDeadline) {
      const dueDate = setHours(startOfDay(baseDate), 17);
      return {
        title: `Deadline: ${subject.replace(/^(re:|fwd:)\s*/i, "")}`,
        description: `Deadline detected from email: "${content.snippet ?? subject}"`,
        startTime: dueDate,
        endTime: null,
        location: null,
        type: "deadline",
        confidence: 0.65,
      };
    }

    return null;
  }

  async extractTasksAndDeadlines(content: EmailContent): Promise<TaskExtraction[]> {
    const d = detect(content);
    const tasks: TaskExtraction[] = [];
    const combined = d.combined;

    if (d.isDeadline) {
      const dueDate = extractDateFromText(combined);
      tasks.push({
        title: `Action required: ${content.subject ?? "see email"}`,
        description: content.snippet ?? null,
        dueDate,
        priority: d.isUrgent ? "high" : "normal",
        confidence: 0.7,
      });
    }

    if (d.isMeeting && d.needsReply) {
      tasks.push({
        title: `Respond to meeting request: ${content.subject ?? ""}`,
        description: null,
        dueDate: addDays(new Date(), 1),
        priority: "normal",
        confidence: 0.65,
      });
    }

    return tasks;
  }
}
