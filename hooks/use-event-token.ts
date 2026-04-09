"use client";

import { useEffect, useState } from "react";

const EVENT_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EVENT_AUTH === "true";

export type EventAuthPayload = {
  userId: string;
  eventId: number;
  accountId: number;
  token: string;
};

export function useEventToken() {
  // When feature flag is off, ready immediately — no token needed
  const [ready, setReady] = useState(!EVENT_AUTH_ENABLED);

  useEffect(() => {

    if (!EVENT_AUTH_ENABLED) return;

    // If we already have a valid token from this session, mark ready immediately.
    // Still register the listener below so the portal can refresh the token.
    if (sessionStorage.getItem("event-auth")) {
      setReady(true);
    }

    function handleMessage(event: MessageEvent) {

      const raw = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? "";
      const allowedOrigins =
        raw && raw !== "*"
          ? raw.split(",").map((o) => o.trim()).filter(Boolean)
          : [];

      if (allowedOrigins.length > 0 && !allowedOrigins.includes(event.origin))
        return;
      if (event.data?.type === "EVENT_TOKEN") {
        const { userId, eventId, accountId, token } = event.data as EventAuthPayload & { type: string };
        if (!userId || !eventId || !accountId || !token) return;
        sessionStorage.setItem(
          "event-auth",
          JSON.stringify({ userId, eventId, accountId, token })
        );
        setReady(true);
      }
    }

    // Register listener before signalling ready so we never miss a message.
    window.addEventListener("message", handleMessage);

    // Tell the portal the chatbot is ready to receive the token.
    // This avoids the race condition where postMessage arrives before
    // the listener is set up.
    window.parent.postMessage({ type: "CHATBOT_READY" }, "*");

    // NOTE: listener is intentionally not removed so it receives token refreshes.
  }, []);

  return { ready };
}

