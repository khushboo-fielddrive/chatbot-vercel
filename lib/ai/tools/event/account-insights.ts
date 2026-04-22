import { tool } from "ai";
import { z } from "zod";
import { fetchAll, query } from "@/lib/db/event-db";

export function createAccountInsightTools(accountId: number, eventId: number) {
  return {
    list_account_events: tool({
      description:
        "Searches events for the current account by name. Always derive the search term from the current event name by stripping the year/edition suffix (e.g. 'Tech Summit 2026' → 'Tech Summit'). Returns all matching events across all years — use results to find event IDs for compare_events.",
      inputSchema: z.object({
        q: z
          .string()
          .describe(
            "Event base name to search for (e.g. 'Tech Summit'). Strip year/edition from the current event name — do not include the year.",
          ),
      }),
      execute: async ({ q }) => {
        const rows = await fetchAll(
          `SELECT id, name, status, startDateTime, endDateTime, city, locationName
           FROM Event
           WHERE account_id = ? AND deleted = 0 AND name LIKE ?
           ORDER BY startDateTime DESC`,
          [accountId, `%${q}%`],
        );
        return JSON.stringify({ total: rows.length, rows }, null, 2);
      },
    }),

    compare_events: tool({
      description:
        "Returns side-by-side attendance metrics for 2–5 selected events on this account. Always call list_account_events first to confirm event IDs. Use for 'compare this event with last year', 'how did event X vs event Y perform?'",
      inputSchema: z.object({
        event_ids: z
          .array(z.number())
          .min(2)
          .max(5)
          .describe("Array of 2–5 event IDs to compare — must belong to the current account"),
      }),
      execute: async ({ event_ids }) => {
        // Validate all event IDs belong to this account
        const placeholders = event_ids.map(() => "?").join(", ");
        const validRows = await fetchAll(
          `SELECT id FROM Event WHERE account_id = ? AND deleted = 0 AND id IN (${placeholders})`,
          [accountId, ...event_ids],
        );
        const validIds = new Set(validRows.map((r: any) => r.id));
        const invalidIds = event_ids.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return JSON.stringify(
            { error: `Event IDs not found on this account: ${invalidIds.join(", ")}` },
            null,
            2,
          );
        }

        return query(
          `SELECT e.id, e.name, e.startDateTime, e.city,
                  COUNT(a.id) AS total_attendees,
                  SUM(a.checkinAt IS NOT NULL) AS checked_in,
                  ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS check_in_pct
           FROM Event e
           LEFT JOIN Attendee a ON a.event_id = e.id AND a.deleted = 0
           WHERE e.account_id = ? AND e.id IN (${placeholders})
           GROUP BY e.id, e.name, e.startDateTime, e.city
           ORDER BY e.startDateTime`,
          [accountId, ...event_ids],
        );
      },
    }),

    get_account_event_trends: tool({
      description:
        "Returns attendance metrics across ALL events on this account ordered by date — useful for spotting growth or decline trends. Use for 'how has attendance changed over time?', 'attendance trend across events', 'event history'.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT e.name, e.startDateTime, e.city,
                  COUNT(a.id) AS total_attendees,
                  SUM(a.checkinAt IS NOT NULL) AS checked_in,
                  ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS check_in_pct
           FROM Event e
           LEFT JOIN Attendee a ON a.event_id = e.id AND a.deleted = 0
           WHERE e.account_id = ? AND e.deleted = 0
           GROUP BY e.id, e.name, e.startDateTime, e.city
           ORDER BY e.startDateTime`,
          [accountId],
        ),
    }),

    get_attendee_return_likelihood: tool({
      description:
        "Checks an attendee's attendance history across all past events on this account (excluding the current event) and returns their likelihood of attending. Use for 'is [name] likely to attend?', 'will they come back?', 'return likelihood for [name]'.",
      inputSchema: z.object({
        name_or_email: z
          .string()
          .describe("Attendee name (partial match) or exact email address"),
      }),
      execute: async ({ name_or_email }) => {
        const rows = await fetchAll(
          `SELECT
             a.name,
             a.email,
             COUNT(DISTINCT a.event_id) AS events_registered,
             SUM(a.checkinAt IS NOT NULL) AS events_attended,
             ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(DISTINCT a.event_id), 0) * 100, 1) AS attendance_rate
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id
           WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0
             AND e.id != ?
             AND (a.email = ? OR a.name LIKE ?)
           GROUP BY a.email, a.name
           ORDER BY events_registered DESC
           LIMIT 5`,
          [accountId, eventId, name_or_email, `%${name_or_email}%`],
        );

        if (!rows.length) {
          return JSON.stringify(
            { name_or_email, likelihood: "no_history", message: "No attendance history found for this attendee on this account." },
            null,
            2,
          );
        }

        const results = rows.map((row: any) => {
          const rate = Number(row.attendance_rate ?? 0);
          const registered = Number(row.events_registered);
          let likelihood: "likely" | "uncertain" | "unlikely" | "first_time";

          if (registered === 0) {
            likelihood = "first_time";
          } else if (rate >= 75) {
            likelihood = "likely";
          } else if (rate >= 40) {
            likelihood = "uncertain";
          } else {
            likelihood = "unlikely";
          }

          return {
            name: row.name,
            email: row.email,
            events_registered: registered,
            events_attended: Number(row.events_attended ?? 0),
            attendance_rate: rate,
            likelihood,
          };
        });

        return JSON.stringify(results, null, 2);
      },
    }),
  };
}
