import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/layout/app-header";
import { SettingsClient } from "@/components/settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.userId) return null;

  const [settings, profile] = await Promise.all([
    prisma.settings.findUnique({ where: { profileId: session.userId } }),
    prisma.profile.findUnique({
      where: { id: session.userId },
      select: { email: true, name: true, avatarUrl: true, googleTokenExpiry: true },
    }),
  ]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        session={session as Parameters<typeof AppHeader>[0]["session"]}
        title="Settings"
        subtitle="Manage integrations, AI behavior, and notifications"
      />
      <SettingsClient
        initialSettings={settings}
        profile={profile}
        accessTokenValid={
          profile?.googleTokenExpiry ? new Date(profile.googleTokenExpiry) > new Date() : false
        }
      />
    </div>
  );
}
