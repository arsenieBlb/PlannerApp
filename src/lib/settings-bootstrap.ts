import { prisma } from "@/lib/db";

/**
 * Google sign-in users often have only seed/demo rows and sync left off — they never pull real Gmail.
 * Turn on Gmail/Calendar sync once when safe (no real synced messages yet).
 */
export async function ensureGmailSyncEnabledIfNeeded(profileId: string): Promise<void> {
  const [settings, profile] = await Promise.all([
    prisma.settings.findUnique({ where: { profileId } }),
    prisma.profile.findUnique({
      where: { id: profileId },
      select: { googleAccessToken: true },
    }),
  ]);

  if (!settings || !profile?.googleAccessToken) return;
  if (settings.gmailSyncEnabled || settings.lastGmailSync) return;

  const realInboxCount = await prisma.email.count({
    where: {
      profileId,
      AND: [
        { NOT: { gmailId: { startsWith: "seed_" } } },
        { NOT: { gmailId: { startsWith: "demo_" } } },
      ],
    },
  });
  const totalEmails = await prisma.email.count({ where: { profileId } });
  const onlyDemoOrEmpty = totalEmails === 0 || realInboxCount === 0;
  if (!onlyDemoOrEmpty) return;

  await prisma.settings.update({
    where: { profileId },
    data: { gmailSyncEnabled: true, calendarSyncEnabled: true },
  });
}
