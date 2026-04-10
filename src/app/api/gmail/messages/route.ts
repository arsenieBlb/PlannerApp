import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/utils";
import type { ParsedEmail } from "@/types";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
  const category = searchParams.get("category");
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const search = searchParams.get("search");

  const skip = (page - 1) * pageSize;

  const where = {
    profileId: session.userId,
    ...(category ? { aiCategory: category } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search } },
            { snippet: { contains: search } },
            { fromEmail: { contains: search } },
          ],
        }
      : {}),
  };

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.email.count({ where }),
  ]);

  const parsed: ParsedEmail[] = emails.map((e) => ({
    ...e,
    toEmails: parseJsonArray(e.toEmails),
    ccEmails: parseJsonArray(e.ccEmails),
    labels: parseJsonArray(e.labels),
    aiTags: parseJsonArray(e.aiTags) as ParsedEmail["aiTags"],
    aiCategory: e.aiCategory as ParsedEmail["aiCategory"],
    aiPriority: (e.aiPriority ?? "normal") as ParsedEmail["aiPriority"],
  }));

  return NextResponse.json({
    data: { items: parsed, total, page, pageSize, hasMore: skip + pageSize < total },
  });
}
