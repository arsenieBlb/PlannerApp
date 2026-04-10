// Planner PWA Service Worker
const CACHE_NAME = "planner-v2";
const PRECACHE = ["/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API / auth / Next internals → always pass through to network (never intercept)
// - Everything else → network first, fall back to cache, fall back to offline response
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept: API routes, Next.js internals, auth, non-GET requests
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/favicon")
  ) {
    // Do NOT call event.respondWith — let the browser handle it natively
    return;
  }

  // For GET page requests: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful page responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Network failed — try cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Nothing in cache either — return a simple offline response
        return new Response(
          "<html><body><h2>You are offline</h2><p>Please check your connection.</p></body></html>",
          { status: 503, headers: { "Content-Type": "text/html" } }
        );
      })
  );
});

// ─── Push notification handler ────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Planner", body: event.data.text(), type: "info" };
  }

  const options = {
    body: payload.body,
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: payload.type ?? "planner",
    data: { url: payload.url ?? "/dashboard", ...payload.data },
    actions: [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
    requireInteraction: ["new_email", "draft_ready", "deadline_detected"].includes(payload.type),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Planner", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          return existing.navigate(url);
        }
        return self.clients.openWindow(url);
      })
  );
});
