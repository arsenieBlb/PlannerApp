"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export function PushManager() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.userId) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[SW] Registered:", reg.scope);
        subscribeIfPermitted(reg);
      })
      .catch((err) => console.error("[SW] Registration failed:", err));
  }, [session?.userId]);

  return null;
}

async function subscribeIfPermitted(reg: ServiceWorkerRegistration) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return; // Push not configured

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await syncSubscription(existing);
      return;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await syncSubscription(subscription);
  } catch (err) {
    console.error("[Push] Subscribe failed:", err);
  }
}

async function syncSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output.buffer;
}
