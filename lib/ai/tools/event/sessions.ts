import { tool } from "ai";
import { z } from "zod";
import { fetchAll, query } from "@/lib/db/event-db";

export function createSessionTools(eventId: number) {
  return {
    list_event_sessions: tool({
      description: "List all sessions for the event.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT id, name, startDateTime, endDateTime, maxPeople, mode,
                  allowScanningOut, allowForcedCheckIn, location_id
           FROM EventSession
           WHERE event_id = ? AND deleted = 0
           ORDER BY startDateTime`,
          [eventId],
        ),
    }),

    get_session_attendees: tool({
      description:
        "List attendees registered for a specific session with their name, email, check-in status, and reservation details. Use for 'who is in session X?'",
      inputSchema: z.object({
        session_id: z.number().describe("Session ID"),
      }),
      execute: async ({ session_id }) => {
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
           JOIN Attendee a ON a.id = sr.attendee
           LEFT JOIN SessionScan ss
                  ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
           WHERE sr.session = ? AND sr.event_id = ? AND sr.deleted = 0 AND a.deleted = 0
           GROUP BY a.id, a.name, a.email, a.barcode, sr.id, sr.cancelled, a.checkinAt
           ORDER BY a.name`,
          [session_id, eventId],
        );
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
           WHERE ss.sessionReservation_id = ? AND sr.event_id = ? AND sr.deleted = 0
           ORDER BY ss.scanAt DESC`,
          [session_reservation_id, eventId],
        ),
    }),
  };
}
