import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/app-header";
import { ReviewQueueClient } from "@/components/queue/review-queue-client";

export default async function QueuePage() {
  const session = await auth();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        session={session as Parameters<typeof AppHeader>[0]["session"]}
        title="Review Queue"
        subtitle="Approve, edit, or reject AI suggestions"
      />
      <ReviewQueueClient />
    </div>
  );
}
