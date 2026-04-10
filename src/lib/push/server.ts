/**
 * Web Push notification server module.
 * Sends push notifications to all subscriptions for a profile.
 */

import webpush from "web-push";
import { prisma } from "@/lib/db";
import type { PushPayload } from "@/types";

function initWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:admin@localhost";

  if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
    return true;
  }
  return false;
}

const pushEnabled = initWebPush();

export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  if (!pushEnabled) {
    console.log("[Push] VAPID keys not configured. Payload:", payload);
    return { sent: 0, removed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { profileId },
  });

  let sent = 0;
  let removed = 0;
  const toRemove: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        // 410 Gone or 404 = subscription expired
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          toRemove.push(sub.id);
        } else {
          console.error("[Push] Failed to send to subscription:", err);
        }
      }
    })
  );

  if (toRemove.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: toRemove } } });
    removed = toRemove.length;
  }

  return { sent, removed };
}

export async function saveSubscription(
  profileId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { profileId, endpoint, p256dh, auth, userAgent },
    update: { profileId, p256dh, auth, userAgent },
  });
}
