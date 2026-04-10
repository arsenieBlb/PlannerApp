/**
 * Google Calendar integration: list events and create events with conflict detection.
 */

import { getCalendarClient } from "@/lib/gmail/client";
import { prisma } from "@/lib/db";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  isAllDay: boolean;
  htmlLink: string | null;
}

export async function listCalendarEvents(
  accessToken: string,
  options: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  } = {}
): Promise<GoogleCalendarEvent[]> {
  const calendar = getCalendarClient(accessToken);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: (options.timeMin ?? new Date()).toISOString(),
    timeMax: options.timeMax?.toISOString(),
    maxResults: options.maxResults ?? 50,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? []).map((e) => {
    const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
    const startTime = isAllDay
      ? new Date(e.start!.date!)
      : new Date(e.start!.dateTime!);
    const endTime = e.end
      ? isAllDay
        ? new Date(e.end.date!)
        : new Date(e.end.dateTime!)
      : null;

    return {
      id: e.id!,
      title: e.summary ?? "Untitled",
      description: e.description ?? null,
      startTime,
      endTime,
      location: e.location ?? null,
      isAllDay,
      htmlLink: e.htmlLink ?? null,
    };
  });
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    title: string;
    description?: string | null;
    startTime: Date;
    endTime?: Date | null;
    location?: string | null;
    isAllDay?: boolean;
  }
): Promise<string> {
  const calendar = getCalendarClient(accessToken);

  const startEnd = event.isAllDay
    ? {
        start: { date: event.startTime.toISOString().split("T")[0] },
        end: {
          date: (event.endTime ?? event.startTime).toISOString().split("T")[0],
        },
      }
    : {
        start: { dateTime: event.startTime.toISOString() },
        end: {
          dateTime: (event.endTime ?? new Date(event.startTime.getTime() + 3600000)).toISOString(),
        },
      };

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      ...startEnd,
    },
  });

  return res.data.id!;
}

export async function checkCalendarConflicts(
  accessToken: string,
  startTime: Date,
  endTime: Date
): Promise<GoogleCalendarEvent[]> {
  const calendar = getCalendarClient(accessToken);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    singleEvents: true,
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id!,
      title: e.summary ?? "Untitled",
      description: e.description ?? null,
      startTime: new Date(e.start?.dateTime ?? e.start?.date ?? ""),
      endTime: e.end ? new Date(e.end.dateTime ?? e.end.date ?? "") : null,
      location: e.location ?? null,
      isAllDay: Boolean(e.start?.date && !e.start?.dateTime),
      htmlLink: e.htmlLink ?? null,
    }));
}

// ─── Approve and create a CalendarSuggestion ─────────────────────────────────

export async function approveCalendarSuggestion(
  profileId: string,
  suggestionId: string,
  accessToken: string
): Promise<void> {
  const suggestion = await prisma.calendarSuggestion.findUniqueOrThrow({
    where: { id: suggestionId },
  });

  const googleEventId = await createCalendarEvent(accessToken, {
    title: suggestion.title,
    description: suggestion.description,
    startTime: suggestion.startTime,
    endTime: suggestion.endTime,
    location: suggestion.location,
  });

  await prisma.calendarSuggestion.update({
    where: { id: suggestionId },
    data: { status: "created", googleEventId },
  });

  await prisma.auditLog.create({
    data: {
      profileId,
      action: "event_created",
      entityType: "calendar_suggestion",
      entityId: suggestionId,
      details: JSON.stringify({ googleEventId, title: suggestion.title }),
    },
  });
}
