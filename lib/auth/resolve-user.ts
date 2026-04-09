import { auth, type UserType } from "@/app/(auth)/auth";
import { fetchEventContext, type EventContext } from "@/lib/ai/event-context";
import { ChatbotError } from "@/lib/errors";
import { upsertPortalUser } from "@/lib/db/queries";

export type ResolvedUser = {
  userId: string;
  userType: UserType;
  isEventAuth: boolean;
  eventContext?: EventContext;
};

/**
 * Resolves the effective userId for an API request.
 * Supports two modes:
 *   1. Event auth mode: validates portal token headers, returns portal user UUID
 *   2. Normal mode: validates NextAuth session, returns session user UUID
 *
 * When x-event-id is present in event auth mode, also validates the event
 * against the account and returns the EventContext for tool/prompt injection.
 */
export async function resolveUser(
  request: Request
): Promise<ResolvedUser | ChatbotError> {
  const isEventAuth =
    process.env.NEXT_PUBLIC_ENABLE_EVENT_AUTH === "true" &&
    !!request.headers.get("x-portal-token");

  if (isEventAuth) {
    const portalUserId = request.headers.get("x-event-user-id");
    const accountId = Number(request.headers.get("x-event-account-id"));
    const portalToken = request.headers.get("x-portal-token");

    if (!portalUserId || !accountId || !portalToken) {
      return new ChatbotError("unauthorized:chat");
    }

    let portalRes: Response;
    try {
      portalRes = await fetch(
        `${process.env.PORTAL_API_URL}/users/${portalUserId}?token=${encodeURIComponent(portalToken)}`
      );
    } catch {
      return new ChatbotError("unauthorized:chat");
    }

    if (!portalRes.ok) {
      return new ChatbotError("unauthorized:chat");
    }

    const portalUser = (await portalRes.json()) as {
      account?: { id?: string | number };
      email?: string;
    };

    if (Number(portalUser?.account?.id) !== accountId) {
      return new ChatbotError("forbidden:chat");
    }

    // If x-event-id is present, validate it belongs to this account.
    let eventContext: EventContext | undefined;
    const rawEventId = request.headers.get("x-event-id");
    if (rawEventId) {
      const eventResult = await fetchEventContext(Number(rawEventId), accountId);
      if (!eventResult.ok) {
        return new ChatbotError("forbidden:chat");
      }
      eventContext = eventResult.ctx;
    }

    const portalEmail =
      portalUser.email ?? `portal-user-${portalUserId}@event.internal`;
    const userId = await upsertPortalUser(portalEmail);

    return { userId, userType: "regular", isEventAuth: true, eventContext };
  }

  // Normal NextAuth mode
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat");
  }

  return { userId: session.user.id, userType: session.user.type, isEventAuth: false };
}
