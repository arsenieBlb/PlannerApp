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
  extractCalendarEvent(content: EmailContent): Promise<CalendarEventSuggestion | null>;
  extractTasksAndDeadlines(content: EmailContent): Promise<TaskExtraction[]>;
}
