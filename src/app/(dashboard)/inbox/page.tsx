import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/app-header";
import { InboxClient } from "@/components/email/inbox-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function InboxPage() {
  const session = await auth();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        session={session as Parameters<typeof AppHeader>[0]["session"]}
        title="Inbox Assistant"
        subtitle="Local inbox — pull from Gmail with Sync (see sidebar list)"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Sync &amp; Gmail settings</Link>
          </Button>
        }
      />
      <InboxClient />
    </div>
  );
}
