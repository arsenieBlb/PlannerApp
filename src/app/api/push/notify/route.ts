import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { sendPushToProfile } from "@/lib/push/server";
import type { PushPayload } from "@/types";

// Manual push trigger endpoint (for testing / admin use)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Partial<PushPayload>;
  if (!body.title || !body.body || !body.type) {
    return NextResponse.json({ error: "title, body, type required" }, { status: 400 });
  }

  const result = await sendPushToProfile(session.userId, body as PushPayload);
  return NextResponse.json({ data: result });
}
