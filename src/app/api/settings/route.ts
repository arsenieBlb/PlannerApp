import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureGmailSyncEnabledIfNeeded } from "@/lib/settings-bootstrap";
import { UpdateSettingsSchema } from "@/lib/validations";
import { stringifyArray } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureGmailSyncEnabledIfNeeded(session.userId);

  const profile = await prisma.profile.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true, avatarUrl: true },
  });

  const settings = await prisma.settings.findUnique({ where: { profileId: session.userId } });

  return NextResponse.json({
    data: { settings, profile },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  const { trustedSenders, trustedDomains, ...rest } = d;

  const updated = await prisma.settings.upsert({
    where: { profileId: session.userId },
    create: {
      profileId: session.userId,
      ...rest,
      ...(trustedSenders !== undefined ? { trustedSenders: stringifyArray(trustedSenders) } : {}),
      ...(trustedDomains !== undefined ? { trustedDomains: stringifyArray(trustedDomains) } : {}),
    },
    update: {
      ...rest,
      ...(trustedSenders !== undefined ? { trustedSenders: stringifyArray(trustedSenders) } : {}),
      ...(trustedDomains !== undefined ? { trustedDomains: stringifyArray(trustedDomains) } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}
