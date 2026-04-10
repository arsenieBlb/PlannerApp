import type {
  EmailContent,
  EmailSummary,
  EmailClassification,
  ReplySuggestion,
  ReplyStyle,
  CalendarEventSuggestion,
  TaskExtraction,
} from "@/types";

export interface AIProvider {
  name: string;
  summarizeEmail(content: EmailContent): Promise<EmailSummary>;
  classifyEmail(content: EmailContent): Promise<EmailClassification>;
  suggestReply(content: EmailContent, style: ReplyStyle): Promise<ReplySuggestion>;
  /** Draft a reply from a user instruction, e.g. "yes works for me" or "decline, suggest next Thursday" */
  draftReplyFromInstruction(
    content: EmailContent,
    instruction: string,
    style: ReplyStyle
  ): Promise<ReplySuggestion>;
  extractCalendarEvent(content: EmailContent): Promise<CalendarEventSuggestion | null>;
  extractTasksAndDeadlines(content: EmailContent): Promise<TaskExtraction[]>;
}
