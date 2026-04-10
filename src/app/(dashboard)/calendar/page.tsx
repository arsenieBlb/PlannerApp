import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/app-header";
import { CalendarClient } from "@/components/calendar/calendar-client";

export default async function CalendarPage() {
  const session = await auth();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader
        session={session as Parameters<typeof AppHeader>[0]["session"]}
        title="Calendar & Planner"
        subtitle="Your agenda, tasks, and planning items"
      />
      <CalendarClient />
    </div>
  );
}
