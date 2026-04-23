import { tool } from "ai";
import { z } from "zod";
import { eventPool, fetchAll, query } from "@/lib/db/event-db";

export function createSessionTools(accountId: number, eventId: number) {
  return {
    list_event_sessions: tool({
      description: "List all sessions for the event.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT es.id, es.name, es.startDateTime, es.endDateTime, es.maxPeople, es.mode,
                  es.allowScanningOut, es.allowForcedCheckIn, es.location_id
           FROM EventSession es
           JOIN Event e ON e.id = es.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE es.event_id = ? AND es.deleted = 0
           ORDER BY es.startDateTime`,
          [accountId, eventId],
        ),
    }),

    get_session_attendees: tool({
      description:
        "List attendees registered for a specific session with their name, email, check-in status, and reservation details. Use for 'who is in session X?'. Do NOT call this if you only need fill rate or capacity — use get_session_attendance_stats instead.",
      inputSchema: z.object({
        session_id: z.number().describe("Session ID"),
      }),
      execute: async ({ session_id }) => {
        const [[countRow]] = await eventPool.query(
          `SELECT COUNT(*) AS total
           FROM SessionReservation sr
           JOIN Event e ON e.id = sr.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE sr.session = ? AND sr.event_id = ? AND sr.deleted = 0`,
          [accountId, session_id, eventId],
        ) as [any[], any];
        const total = Number(countRow.total);
        if (total > 100) {
          return JSON.stringify({
            total,
            data: [],
            message: `${total} attendees in this session — too many to list. Use get_session_attendance_stats for fill rate or search_attendees to find a specific person.`,
          }, null, 2);
        }
        const rows = await fetchAll(
          `SELECT
             a.id                                AS attendee_id,
             a.name,
             a.email,
             a.barcode,
             sr.id                               AS reservation_id,
             sr.cancelled,
             (a.checkinAt IS NOT NULL)           AS event_checked_in,
             (COUNT(ss.id) > 0)                  AS session_checked_in,
             MAX(ss.scanAt)                      AS session_checkin_at
           FROM SessionReservation sr
           JOIN Attendee a ON a.id = sr.attendee AND a.deleted = 0
           JOIN Event e ON e.id = sr.event_id AND e.account_id = ? AND e.deleted = 0
           LEFT JOIN SessionScan ss
                  ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
           WHERE sr.session = ? AND sr.event_id = ? AND sr.deleted = 0
           GROUP BY a.id, a.name, a.email, a.barcode, sr.id, sr.cancelled, a.checkinAt
           ORDER BY a.name`,
          [accountId, session_id, eventId],
        );
        return JSON.stringify({ total, data: rows }, null, 2);
      },
    }),

    get_session_attendee_breakdown: tool({
      description:
        "Aggregate all sessions' registered attendees by a given dimension — attendee category (VIP / Speaker / Cloud & Infrastructure / etc.) OR any custom field (Job Title, Company, Country, Nationality, etc.). Returns one row per (session, dimension value) with a count — no raw attendee records. Use this instead of calling get_session_attendees + list_attendees_with_custom_fields when the question is 'which [roles / companies / categories] attend which sessions?'. For custom fields, call list_attendee_fields first to get the exact label.",
      inputSchema: z.object({
        dimension: z
          .string()
          .describe(
            "Either the literal 'category' (groups by attendee category) OR the exact custom field label from list_attendee_fields (e.g. 'Job Title', 'Company', 'Country').",
          ),
      }),
      execute: async ({ dimension }) => {
        const byCategory = dimension.trim().toLowerCase() === "category";
        const sql = byCategory
          ? `SELECT
               es.id                                  AS session_id,
               es.name                                AS session_name,
               es.startDateTime                       AS session_start,
               COALESCE(ac.name, '(no category)')     AS dimension_value,
               COUNT(DISTINCT a.id)                   AS attendee_count
             FROM EventSession es
             JOIN SessionReservation sr
               ON sr.session = es.id AND sr.event_id = es.event_id AND sr.deleted = 0
             JOIN Attendee a
               ON a.id = sr.attendee AND a.deleted = 0
             LEFT JOIN AttendeeCategory ac
               ON ac.id = a.category_id
             WHERE es.event_id = ? AND es.deleted = 0
             GROUP BY es.id, es.name, es.startDateTime, COALESCE(ac.name, '(no category)')
             ORDER BY es.startDateTime, attendee_count DESC`
          : `SELECT
               es.id                                          AS session_id,
               es.name                                        AS session_name,
               es.startDateTime                               AS session_start,
               COALESCE(afv.responseValue, '(not provided)')  AS dimension_value,
               COUNT(DISTINCT a.id)                           AS attendee_count
             FROM EventSession es
             JOIN SessionReservation sr
               ON sr.session = es.id AND sr.event_id = es.event_id AND sr.deleted = 0
             JOIN Attendee a
               ON a.id = sr.attendee AND a.deleted = 0
             LEFT JOIN AttendeeFieldValue afv
               ON afv.ATTENDEE_ID = a.id AND afv.label = ?
             WHERE es.event_id = ? AND es.deleted = 0
             GROUP BY es.id, es.name, es.startDateTime, COALESCE(afv.responseValue, '(not provided)')
             ORDER BY es.startDateTime, attendee_count DESC`;
        const params = byCategory ? [eventId] : [dimension, eventId];
        const rows = await fetchAll(sql, params);
        return JSON.stringify(rows, null, 2);
      },
    }),

    get_session_scans: tool({
      description: "Get all scans for a specific session reservation.",
      inputSchema: z.object({
        session_reservation_id: z.number().describe("Session Reservation ID"),
      }),
      execute: async ({ session_reservation_id }) =>
        query(
          `SELECT ss.id, ss.scanAt, ss.sessionScanType, ss.operator, ss.location, ss.device, ss.checkinMode
           FROM SessionScan ss
           JOIN SessionReservation sr ON sr.id = ss.sessionReservation_id
           JOIN Event e ON e.id = sr.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE ss.sessionReservation_id = ? AND sr.event_id = ? AND sr.deleted = 0
           ORDER BY ss.scanAt DESC`,
          [accountId, session_reservation_id, eventId],
        ),
    }),
  };
}
