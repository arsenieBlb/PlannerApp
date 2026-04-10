import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UpdatePlannerItemSchema } from "@/lib/validations";
import { stringifyArray } from "@/lib/utils";

// PATCH /api/planner/items?id=xxx
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await request.json();
  const parsed = UpdatePlannerItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await prisma.plannerItem.findFirst({ where: { id, profileId: session.userId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  const updated = await prisma.plannerItem.update({
    where: { id },
    data: {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.priority !== undefined ? { priority: d.priority } : {}),
      ...(d.tags !== undefined ? { tags: stringifyArray(d.tags) } : {}),
      ...(d.startTime !== undefined ? { startTime: new Date(d.startTime) } : {}),
      ...(d.endTime !== undefined ? { endTime: new Date(d.endTime) } : {}),
      ...(d.isAllDay !== undefined ? { isAllDay: d.isAllDay } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/planner/items?id=xxx
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.plannerItem.deleteMany({ where: { id, profileId: session.userId } });
  return NextResponse.json({ data: { ok: true } });
}
