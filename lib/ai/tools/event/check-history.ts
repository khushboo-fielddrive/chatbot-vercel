import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db/event-db";

export function createCheckHistoryTools(accountId: number, eventId: number) {
  return {
    get_attendee_check_history: tool({
      description: "Get the full check-in/check-out history for a single attendee.",
      inputSchema: z.object({
        attendee_id: z.number().describe("Attendee ID"),
      }),
      execute: async ({ attendee_id }) =>
        query(
          `SELECT ach.Attendee_Check_History_Id, ach.Attendee_Check_Type_id,
                  ach.checkAt, ach.operator, ach.location, ach.device, ach.checkinMode, ach.barcode
           FROM AttendeeCheckHistory ach
           JOIN Attendee a ON a.id = ach.Attendee_Id AND a.deleted = 0
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE ach.Attendee_Id = ? AND a.event_id = ?
           ORDER BY ach.checkAt DESC`,
          [accountId, attendee_id, eventId],
        ),
    }),
  };
}
