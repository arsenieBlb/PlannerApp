import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncGmailForProfile } from "@/lib/gmail/sync";

export async function POST() {
  const session = await auth();
  if (!session?.userId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Token refresh failed — please re-authenticate" }, { status: 401 });
  }

  try {
    const result = await syncGmailForProfile(session.userId, session.accessToken);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[Gmail Sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
