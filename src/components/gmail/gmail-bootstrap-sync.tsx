"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * After login, if Gmail sync is enabled but we have never pulled mail, run one sync
 * so the inbox fills with real threads instead of only seed data.
 */
const BOOTSTRAP_KEY = "planner-initial-gmail-sync-v1";

export function GmailBootstrapSync() {
  const { status } = useSession();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || ran.current) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(BOOTSTRAP_KEY)) return;
    ran.current = true;

    (async () => {
      try {
        const sRes = await fetch("/api/settings");
        if (!sRes.ok) return;
        const body = await sRes.json();
        const settings = body.data?.settings as { gmailSyncEnabled?: boolean; lastGmailSync?: string | null } | undefined;
        if (!settings?.gmailSyncEnabled) return;
        if (settings.lastGmailSync) {
          sessionStorage.setItem(BOOTSTRAP_KEY, "1");
          return;
        }

        const syncRes = await fetch("/api/gmail/sync", { method: "POST" });
        sessionStorage.setItem(BOOTSTRAP_KEY, "1");
        if (syncRes.ok) {
          await qc.invalidateQueries({ queryKey: ["emails"] });
          await qc.invalidateQueries({ queryKey: ["settings"] });
          await qc.invalidateQueries({ queryKey: ["approvals"] });
        }
      } catch {
        ran.current = false;
      }
    })();
  }, [status, qc]);

  return null;
}
