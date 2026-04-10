import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "pending";
  const type = searchParams.get("type");

  const items = await prisma.approvalItem.findMany({
    where: {
      profileId: session.userId,
      status,
      ...(type ? { type } : {}),
    },
    include: {
      email: { select: { id: true, subject: true, fromEmail: true, fromName: true, snippet: true } },
      replyDraft: true,
      calendarSuggestion: true,
      task: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ data: items });
}
