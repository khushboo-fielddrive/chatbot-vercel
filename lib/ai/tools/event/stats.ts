import { tool } from "ai";
import { z } from "zod";
import { eventPool, fetchAll, query } from "@/lib/db/event-db";

export function createStatsTools(eventId: number) {
  return {
    get_event_overview: tool({
      description:
        "Returns a full event snapshot in one call: check-in summary, last-hour arrivals, category breakdown, and registration status. Optionally includes session attendance stats. Use for 'how's the event going?', 'give me an overview', 'event status', 'event summary'.",
      inputSchema: z.object({
        include_sessions: z
          .boolean()
          .default(false)
          .describe(
            "Set to true only if the user asks about session performance alongside the overview",
          ),
      }),
      execute: async ({ include_sessions }) => {
        const [[summaryRows], [lastHourRows], [categoryRows], [regRows], [approvalRows]] =
          await Promise.all([
            eventPool.query(
              `SELECT COUNT(*) AS total_attendees,
                      SUM(checkinAt IS NOT NULL) AS checked_in,
                      SUM(checkinAt IS NULL) AS not_checked_in,
                      ROUND(SUM(checkinAt IS NOT NULL) / NULLIF(COUNT(*), 0) * 100, 1) AS check_in_pct
               FROM Attendee WHERE event_id = ? AND deleted = 0`,
              [eventId],
            ) as Promise<[any[], any]>,
            eventPool.query(
              `SELECT COUNT(*) AS last_hour_checkins
               FROM Attendee
               WHERE event_id = ? AND deleted = 0
                 AND checkinAt >= NOW() - INTERVAL 1 HOUR`,
              [eventId],
            ) as Promise<[any[], any]>,
            eventPool.query(
              `SELECT ac.name AS category, COUNT(a.id) AS total, SUM(a.checkinAt IS NOT NULL) AS checked_in
               FROM Attendee a
               LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
               WHERE a.event_id = ? AND a.deleted = 0
               GROUP BY a.category_id, ac.name
               ORDER BY total DESC`,
              [eventId],
            ) as Promise<[any[], any]>,
            eventPool.query(
              `SELECT registrationStatus AS status, COUNT(*) AS count
               FROM Attendee WHERE event_id = ? AND deleted = 0
               GROUP BY registrationStatus ORDER BY count DESC`,
              [eventId],
            ) as Promise<[any[], any]>,
            eventPool.query(
              `SELECT approvalStatus AS status, COUNT(*) AS count
               FROM Attendee WHERE event_id = ? AND deleted = 0
               GROUP BY approvalStatus ORDER BY count DESC`,
              [eventId],
            ) as Promise<[any[], any]>,
          ]);

        const result: Record<string, unknown> = {
          summary: {
            ...summaryRows[0],
            last_hour_checkins: lastHourRows[0].last_hour_checkins,
          },
          category_breakdown: categoryRows,
          registration_status: regRows,
          approval_status: approvalRows,
        };

        if (include_sessions) {
          result.session_stats = await fetchAll(
            `SELECT es.name, es.maxPeople AS capacity,
                    SUM(sr.cancelled = 0 OR sr.cancelled IS NULL) AS active_reservations,
                    COUNT(ss.id) AS checked_in,
                    ROUND(COUNT(ss.id) / NULLIF(es.maxPeople, 0) * 100, 1) AS fill_pct
             FROM EventSession es
             LEFT JOIN SessionReservation sr ON sr.session = es.id AND sr.deleted = 0
             LEFT JOIN SessionScan ss ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
             WHERE es.event_id = ? AND es.deleted = 0
             GROUP BY es.id, es.name, es.maxPeople
             ORDER BY fill_pct DESC`,
            [eventId],
          );
        }

        return JSON.stringify(result, null, 2);
      },
    }),

    get_checked_in_attendees: tool({
      description:
        "Returns summary counts and the full list of attendees who have checked in (checkinAt IS NOT NULL). For those NOT checked in, use list_not_checked_in_attendees.",
      inputSchema: z.object({}),
      execute: async () => {
        const [[summaryRows], attendees] = await Promise.all([
          eventPool.query(
            `SELECT COUNT(*) AS total_attendees, SUM(checkinAt IS NOT NULL) AS checked_in_count
             FROM Attendee WHERE event_id = ? AND deleted = 0`,
            [eventId],
          ) as Promise<[any[], any]>,
          fetchAll(
            `SELECT id, name, email, barcode, checkinAt, checkinMode, location, operator
             FROM Attendee
             WHERE event_id = ? AND deleted = 0 AND checkinAt IS NOT NULL
             ORDER BY checkinAt DESC`,
            [eventId],
          ),
        ]);
        return JSON.stringify({ summary: summaryRows[0], attendees }, null, 2);
      },
    }),

    list_not_checked_in_attendees: tool({
      description: "Returns attendees who have NOT checked in yet. Use for 'who hasn't arrived?'",
      inputSchema: z.object({}),
      execute: async () => {
        const [[summaryRows], attendees] = await Promise.all([
          eventPool.query(
            `SELECT COUNT(*) AS not_checked_in_count
             FROM Attendee WHERE event_id = ? AND deleted = 0 AND checkinAt IS NULL`,
            [eventId],
          ) as Promise<[any[], any]>,
          fetchAll(
            `SELECT id, name, email, barcode, registrationStatus, approvalStatus, category_id
             FROM Attendee
             WHERE event_id = ? AND deleted = 0 AND checkinAt IS NULL
             ORDER BY name`,
            [eventId],
          ),
        ]);
        return JSON.stringify({ summary: summaryRows[0], attendees }, null, 2);
      },
    }),

    check_attendee_status: tool({
      description:
        "Check whether a specific attendee has checked in — search by name, email, or barcode.",
      inputSchema: z.object({
        q: z.string().describe("Attendee name, email, or barcode"),
      }),
      execute: async ({ q }) => {
        const like = `%${q}%`;
        return query(
          `SELECT id, name, email, barcode,
                  (checkinAt IS NOT NULL) AS has_checked_in,
                  checkinAt, checkinMode, location, operator, registrationStatus
           FROM Attendee
           WHERE event_id = ? AND deleted = 0
             AND (name LIKE ? OR email = ? OR barcode = ?)
           LIMIT 10`,
          [eventId, like, q, q],
        );
      },
    }),

    get_attendees_by_custom_field: tool({
      description:
        "Find attendees where a custom field matches a value — e.g. field_label='country', field_value='UAE'. Always call list_attendee_fields first to get the exact label.",
      inputSchema: z.object({
        field_label: z.string().describe("Custom field label to filter by (e.g. 'country')"),
        field_value: z.string().describe("Value to match (e.g. 'UAE')"),
      }),
      execute: async ({ field_label, field_value }) => {
        const rows = await fetchAll(
          `SELECT a.id, a.name, a.email, a.barcode,
                  (a.checkinAt IS NOT NULL) AS has_checked_in,
                  a.checkinAt,
                  afv.label AS field_label,
                  afv.responseValue AS field_value
           FROM Attendee a
           JOIN AttendeeFieldValue afv ON afv.ATTENDEE_ID = a.id
           WHERE a.event_id = ? AND a.deleted = 0
             AND afv.label LIKE ? AND afv.responseValue LIKE ?
           ORDER BY a.name`,
          [eventId, `%${field_label}%`, `%${field_value}%`],
        );
        return JSON.stringify(rows, null, 2);
      },
    }),

    get_custom_field_distribution: tool({
      description:
        "ALWAYS use for counts/charts grouped by any custom field (country, company, job title, etc.). Returns [{value, count}]. Never use list tools and count manually.",
      inputSchema: z.object({
        field_label: z.string().describe("Custom field label to group by (e.g. 'country')"),
        checked_in_only: z
          .boolean()
          .default(false)
          .describe("If true, only count checked-in attendees"),
      }),
      execute: async ({ field_label, checked_in_only }) => {
        const checkinFilter = checked_in_only ? "AND a.checkinAt IS NOT NULL" : "";
        return query(
          `SELECT afv.responseValue AS value, COUNT(DISTINCT a.id) AS count
           FROM Attendee a
           JOIN AttendeeFieldValue afv ON afv.ATTENDEE_ID = a.id
           WHERE a.event_id = ? AND a.deleted = 0 AND afv.label LIKE ?
           ${checkinFilter}
           GROUP BY afv.responseValue
           ORDER BY count DESC`,
          [eventId, `%${field_label}%`],
        );
      },
    }),

    get_category_breakdown: tool({
      description:
        "ALWAYS use to count/compare attendees by category (VIP, Speaker, General, etc.). Returns each category with total and checked-in count. Never count category_id manually.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT
             ac.name AS category,
             COUNT(a.id) AS total,
             SUM(a.checkinAt IS NOT NULL) AS checked_in
           FROM Attendee a
           LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
           WHERE a.event_id = ? AND a.deleted = 0
           GROUP BY a.category_id, ac.name
           ORDER BY total DESC`,
          [eventId],
        ),
    }),

    get_registration_status_breakdown: tool({
      description:
        "Count attendees grouped by registrationStatus and approvalStatus. Use for 'how many are approved vs pending?', 'how many cancelled?'",
      inputSchema: z.object({}),
      execute: async () => {
        const [regRows, approvalRows] = await Promise.all([
          eventPool.query(
            `SELECT registrationStatus AS status, COUNT(*) AS count
             FROM Attendee WHERE event_id = ? AND deleted = 0
             GROUP BY registrationStatus ORDER BY count DESC`,
            [eventId],
          ),
          eventPool.query(
            `SELECT approvalStatus AS status, COUNT(*) AS count
             FROM Attendee WHERE event_id = ? AND deleted = 0
             GROUP BY approvalStatus ORDER BY count DESC`,
            [eventId],
          ),
        ]) as [[any[], any], [any[], any]];

        return JSON.stringify(
          { registrationStatus: regRows[0], approvalStatus: approvalRows[0] },
          null,
          2,
        );
      },
    }),

    get_session_attendance_stats: tool({
      description:
        "For each session, returns name, capacity, reserved count, checked-in count, and fill rate. Use for 'how full is session X?', 'session attendance overview'.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT
             es.id,
             es.name,
             es.startDateTime,
             es.maxPeople AS capacity,
             COUNT(sr.id) AS reserved,
             SUM(sr.cancelled = 0 OR sr.cancelled IS NULL) AS active_reservations,
             COUNT(ss.id) AS checked_in,
             ROUND(COUNT(ss.id) / NULLIF(es.maxPeople, 0) * 100, 1) AS fill_pct
           FROM EventSession es
           LEFT JOIN SessionReservation sr ON sr.session = es.id AND sr.deleted = 0
           LEFT JOIN SessionScan ss ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
           WHERE es.event_id = ? AND es.deleted = 0
           GROUP BY es.id, es.name, es.startDateTime, es.maxPeople
           ORDER BY es.startDateTime`,
          [eventId],
        ),
    }),

    get_checkin_velocity: tool({
      description:
        "Returns real-time check-in speed: count in the current window, previous window, rate per minute, and trend direction. Use for 'how fast are people checking in?', 'is check-in slowing down?', 'what's the current check-in rate?'.",
      inputSchema: z.object({
        window_mins: z
          .union([z.literal(15), z.literal(30), z.literal(60)])
          .default(30)
          .describe(
            "Window size in minutes — 30 (default), 15 if user says 'right now' or 'last 15 minutes', 60 if user says 'last hour'",
          ),
      }),
      execute: async ({ window_mins }) => {
        const [[currentRows], [previousRows]] = await Promise.all([
          eventPool.query(
            `SELECT COUNT(*) AS count
             FROM Attendee
             WHERE event_id = ? AND deleted = 0
               AND checkinAt >= NOW() - INTERVAL ? MINUTE`,
            [eventId, window_mins],
          ) as Promise<[any[], any]>,
          eventPool.query(
            `SELECT COUNT(*) AS count
             FROM Attendee
             WHERE event_id = ? AND deleted = 0
               AND checkinAt >= NOW() - INTERVAL ? MINUTE
               AND checkinAt <  NOW() - INTERVAL ? MINUTE`,
            [eventId, window_mins * 2, window_mins],
          ) as Promise<[any[], any]>,
        ]);

        const current = Number(currentRows[0].count);
        const previous = Number(previousRows[0].count);
        const rate_per_minute = +(current / window_mins).toFixed(2);

        let trend: "increasing" | "decreasing" | "steady";
        if (previous === 0) {
          trend = current > 0 ? "increasing" : "steady";
        } else if (current > previous * 1.2) {
          trend = "increasing";
        } else if (current < previous * 0.8) {
          trend = "decreasing";
        } else {
          trend = "steady";
        }

        return JSON.stringify(
          { window_mins, current_window: current, previous_window: previous, rate_per_minute, trend },
          null,
          2,
        );
      },
    }),

    get_checkin_timeline: tool({
      description:
        "Returns check-in counts grouped by time slots. Use for 'when do most people check in?', 'check-in trend over time'.",
      inputSchema: z.object({
        slot_mins: z
          .union([z.literal(15), z.literal(60)])
          .default(60)
          .describe("Bucket size in minutes — always use 60 (default) unless the user explicitly asks for 'detailed', 'granular', or 'zoom in' view, then use 15"),
      }),
      execute: async ({ slot_mins }) =>
        query(
          `SELECT
             DATE_FORMAT(
               FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(checkinAt) / (? * 60)) * (? * 60)),
               '%Y-%m-%d %H:%i'
             ) AS time_slot,
             COUNT(*) AS checkins
           FROM Attendee
           WHERE event_id = ? AND deleted = 0 AND checkinAt IS NOT NULL
           GROUP BY time_slot
           ORDER BY time_slot`,
          [slot_mins, slot_mins, eventId],
        ),
    }),
  };
}
