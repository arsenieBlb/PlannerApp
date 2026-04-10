/**
 * OpenAI-backed AI provider.
 * Used when OPENAI_API_KEY is set in environment.
 */

import OpenAI from "openai";
import { addHours } from "date-fns";
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
  EmailPriority,
  EmailTag,
} from "@/types";

const MODEL = "gpt-4o-mini";

function getClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function jsonCompletion<T>(
  prompt: string,
  systemPrompt: string
): Promise<T> {
  const client = getClient();
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  return JSON.parse(res.choices[0].message.content ?? "{}") as T;
}

function emailContextStr(content: EmailContent): string {
  return [
    `Subject: ${content.subject ?? "(none)"}`,
    `From: ${content.from}`,
    `Body: ${content.bodyText?.slice(0, 2000) ?? content.snippet ?? "(empty)"}`,
    content.threadContext ? `Thread context:\n${content.threadContext.slice(0, 1000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export class OpenAIProvider implements AIProvider {
  name = "openai";

  async summarizeEmail(content: EmailContent): Promise<EmailSummary> {
    const result = await jsonCompletion<EmailSummary>(
      emailContextStr(content),
      `You are an email assistant. Analyze this email and return JSON with:
{ "summary": string, "keyPoints": string[], "actionItems": string[], "confidence": number (0-1) }
Be concise. confidence reflects your certainty about the summary.`
    );
    return result;
  }

  async classifyEmail(content: EmailContent): Promise<EmailClassification> {
    const result = await jsonCompletion<{
      category: EmailCategory;
      priority: EmailPriority;
      tags: EmailTag[];
      confidence: number;
      reasoning: string;
    }>(
      emailContextStr(content),
      `Classify this email. Return JSON:
{ "category": "meeting"|"deadline"|"personal"|"work"|"school"|"newsletter"|"other",
  "priority": "high"|"normal"|"low",
  "tags": array of: "needs_reply"|"meeting"|"deadline"|"urgent"|"personal"|"work"|"school"|"action_required"|"no_reply_needed",
  "confidence": number (0-1),
  "reasoning": string (one sentence) }`
    );
    return result;
  }

  async suggestReply(
    content: EmailContent,
    style: ReplyStyle
  ): Promise<ReplySuggestion> {
    const styleGuide = {
      concise: "Brief and to the point, 2-3 sentences max.",
      normal: "Friendly and professional, natural tone.",
      formal: "Formal and professional language.",
    };

    const result = await jsonCompletion<{
      subject: string;
      body: string;
      tone: string;
      confidence: number;
    }>(
      emailContextStr(content),
      `Draft a reply to this email. Style: ${styleGuide[style]}
Return JSON: { "subject": string, "body": string, "tone": string, "confidence": number (0-1) }
The body should be a complete email reply with greeting and sign-off.`
    );

    return { ...result, style };
  }

  async draftReplyFromInstruction(
    content: EmailContent,
    instruction: string,
    style: ReplyStyle
  ): Promise<ReplySuggestion> {
    const styleGuide = {
      concise: "Brief and to the point, 2-3 sentences max.",
      normal: "Friendly and professional, natural tone.",
      formal: "Formal and professional language, full sentences.",
    };

    const result = await jsonCompletion<{
      subject: string;
      body: string;
      tone: string;
      confidence: number;
    }>(
      `Original email:\n${emailContextStr(content)}\n\nUser's reply intent: "${instruction}"`,
      `Draft a reply email based on the user's intent.
Style: ${styleGuide[style]}
The body should be a complete email reply with greeting and sign-off.
Incorporate the user's exact intent naturally into the reply — do not ignore it.
Return JSON: { "subject": string, "body": string, "tone": string, "confidence": number (0-1) }`
    );

    return { ...result, style };
  }

  async extractCalendarEvent(
    content: EmailContent
  ): Promise<CalendarEventSuggestion | null> {
    const result = await jsonCompletion<{
      found: boolean;
      title?: string;
      description?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      type?: string;
      confidence?: number;
    }>(
      emailContextStr(content),
      `Extract calendar event info from this email if present.
Return JSON: { "found": boolean, "title"?: string, "description"?: string,
"startTime"?: ISO8601, "endTime"?: ISO8601, "location"?: string,
"type"?: "event"|"deadline"|"reminder"|"meeting", "confidence"?: number }
If no event, return { "found": false }.`
    );

    if (!result.found || !result.startTime) return null;

    return {
      title: result.title ?? content.subject ?? content.from ?? "Event",
      description: result.description ?? null,
      startTime: new Date(result.startTime),
      endTime: result.endTime ? new Date(result.endTime) : addHours(new Date(result.startTime), 1),
      location: result.location ?? null,
      type: (result.type as CalendarEventSuggestion["type"]) ?? "event",
      confidence: result.confidence ?? 0.7,
    };
  }

  async extractTasksAndDeadlines(content: EmailContent): Promise<TaskExtraction[]> {
    const result = await jsonCompletion<{
      tasks: Array<{
        title: string;
        description?: string;
        dueDate?: string;
        priority: EmailPriority;
        confidence: number;
      }>;
    }>(
      emailContextStr(content),
      `Extract action items, tasks, and deadlines from this email.
Return JSON: { "tasks": [{ "title": string, "description"?: string,
"dueDate"?: ISO8601, "priority": "high"|"normal"|"low", "confidence": number }] }`
    );

    return (result.tasks ?? []).map((t) => ({
      title: t.title,
      description: t.description ?? null,
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      priority: t.priority,
      confidence: t.confidence,
    }));
  }
}
