import { fetchAll } from "@/lib/db/event-db";

export type EventContext = {
  eventId: number;
  accountId: number;
  event: {
    id: number;
    name: string;
    startDateTime: string;
    endDateTime: string;
    city: string;
    locationName: string;
    status: string;
  };
};

type FetchResult =
  | { ok: true; ctx: EventContext }
  | { ok: false; reason: string };

/**
 * Resolves and validates event context given an eventId and optional accountId.
 *
 * - If accountId is not provided, it is derived from the event's own account_id.
 * - If accountId is provided but doesn't match the event's account_id, returns Forbidden.
 */
export async function fetchEventContext(
  eventId: number,
  accountId?: number,
): Promise<FetchResult> {
  const rows = await fetchAll(
    `SELECT id, name, status, startDateTime, endDateTime,
            city, locationName, account_id
     FROM Event
     WHERE id = ? AND deleted = 0
     LIMIT 1`,
    [eventId],
  );

  if (!rows.length) {
    return { ok: false, reason: "Event not found" };
  }

  const row = rows[0];

  if (accountId !== undefined && row.account_id !== accountId) {
    return { ok: false, reason: "Forbidden" };
  }

  const resolvedAccountId: number = accountId ?? row.account_id;

  return {
    ok: true,
    ctx: {
      eventId: row.id,
      accountId: resolvedAccountId,
      event: {
        id: row.id,
        name: row.name,
        status: row.status,
        startDateTime: row.startDateTime,
        endDateTime: row.endDateTime,
        city: row.city ?? "",
        locationName: row.locationName ?? "",
      },
    },
  };
}
