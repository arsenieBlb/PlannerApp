import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listCalendarEvents } from "@/lib/calendar/client";
import { addDays } from "date-fns";
import { CreatePlannerItemSchema } from "@/lib/validations";
import { stringifyArray } from "@/lib/utils";

// GET — list calendar events (Google Calendar + local planner items)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const daysAhead = parseInt(searchParams.get("days") ?? "30");
  const timeMin = new Date();
  const timeMax = addDays(timeMin, daysAhead);

  // Local planner items
  const plannerItems = await prisma.plannerItem.findMany({
    where: {
      profileId: session.userId,
      status: { not: "cancelled" },
      OR: [
        { startTime: { gte: timeMin, lte: timeMax } },
        { startTime: null },
      ],
    },
    orderBy: { startTime: "asc" },
  });

  // Google Calendar events (only if access token available)
  let googleEvents: Awaited<ReturnType<typeof listCalendarEvents>> = [];
  if (session.accessToken) {
    try {
      googleEvents = await listCalendarEvents(session.accessToken, { timeMin, timeMax });
    } catch (err) {
      console.warn("[Calendar] Failed to fetch Google events:", err);
    }
  }

  return NextResponse.json({
    data: {
      plannerItems,
      googleEvents,
    },
  });
}

// POST — create a local planner item
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = CreatePlannerItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const item = await prisma.plannerItem.create({
    data: {
      profileId: session.userId,
      title: d.title,
      description: d.description,
      type: d.type,
      priority: d.priority,
      tags: stringifyArray(d.tags),
      startTime: d.startTime ? new Date(d.startTime) : null,
      endTime: d.endTime ? new Date(d.endTime) : null,
      isAllDay: d.isAllDay,
      isRecurring: d.isRecurring,
      recurringRule: d.recurringRule,
    },
  });

  await prisma.auditLog.create({
    data: {
      profileId: session.userId,
      action: "planner_item_created",
      entityType: "planner_item",
      entityId: item.id,
    },
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
