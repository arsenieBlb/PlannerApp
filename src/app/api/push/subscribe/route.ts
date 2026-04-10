import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { saveSubscription } from "@/lib/push/server";
import { PushSubscribeSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = PushSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { endpoint, keys, userAgent } = parsed.data;
  await saveSubscription(
    session.userId,
    endpoint,
    keys.p256dh,
    keys.auth,
    userAgent ?? request.headers.get("user-agent") ?? undefined
  );

  return NextResponse.json({ data: { ok: true } });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json() as { endpoint: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const { prisma } = await import("@/lib/db");
  await prisma.pushSubscription.deleteMany({
    where: { profileId: session.userId, endpoint },
  });

  return NextResponse.json({ data: { ok: true } });
}
