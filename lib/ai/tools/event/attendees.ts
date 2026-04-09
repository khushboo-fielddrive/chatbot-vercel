import { tool } from "ai";
import { z } from "zod";
import { fetchAll, query } from "@/lib/db/event-db";

export function createAttendeeTools(eventId: number) {
  return {
    list_attendees: tool({
      description:
        "List all attendees for the event (standard fields: name, email, barcode, registrationStatus, checkinAt). Does NOT include custom field values — use list_attendees_with_custom_fields if you need those. Do NOT use for counts — use get_category_breakdown or get_custom_field_distribution instead.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await fetchAll(
          `SELECT id, name, email, barcode, registrationStatus, approvalStatus,
                  checkinAt, totalCost, balanceDue, category_id
           FROM Attendee
           WHERE event_id = ? AND deleted = 0
           ORDER BY name`,
          [eventId],
        );
        return JSON.stringify(rows, null, 2);
      },
    }),

    search_attendees: tool({
      description: "Search attendees in the event by name, email, or barcode.",
      inputSchema: z.object({
        q: z.string().describe("Search term (matched against name, email, or barcode)"),
      }),
      execute: async ({ q }) => {
        const like = `%${q}%`;
        const rows = await fetchAll(
          `SELECT id, name, email, barcode, registrationStatus, checkinAt
           FROM Attendee
           WHERE event_id = ? AND deleted = 0
             AND (name LIKE ? OR email LIKE ? OR barcode LIKE ?)
           ORDER BY name`,
          [eventId, like, like, like],
        );
        return JSON.stringify(rows, null, 2);
      },
    }),

    get_attendee_full_profile: tool({
      description:
        "Get a single attendee's complete profile — standard fields plus all custom field values (country, company, job title, etc.) in one call. Always prefer this over separate standard + custom field calls.",
      inputSchema: z.object({
        attendee_id: z.number().describe("Attendee ID"),
      }),
      execute: async ({ attendee_id }) => {
        const [attendeeRows, fieldRows] = await Promise.all([
          fetchAll(
            `SELECT id, name, email, barcode, registrationStatus, approvalStatus,
                    checkinAt, totalCost, balanceDue, category_id, subcategory_id,
                    discountCode, personalNote, location, operator
             FROM Attendee
             WHERE id = ? AND event_id = ? AND deleted = 0`,
            [attendee_id, eventId],
          ),
          fetchAll(
            `SELECT afv.fieldName, afv.label, afv.responseValue
             FROM AttendeeFieldValue afv
             JOIN Attendee a ON a.id = afv.ATTENDEE_ID
             WHERE afv.ATTENDEE_ID = ? AND a.event_id = ? AND a.deleted = 0
             ORDER BY afv.field_id`,
            [attendee_id, eventId],
          ),
        ]);
        return JSON.stringify(
          { attendee: attendeeRows[0] ?? null, customFields: fieldRows },
          null,
          2,
        );
      },
    }),

    list_attendee_fields: tool({
      description:
        "List custom attendee fields defined for the event. Always call this first before filtering by a custom field value to get the exact label.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT id, fieldName, label, dataType, typeLabel, required, visible, thirdPartyId
           FROM AttendeeField
           WHERE event_id = ? AND deleted = 0
           ORDER BY id`,
          [eventId],
        ),
    }),

    list_attendees_with_custom_fields: tool({
      description:
        "Returns all attendees with standard fields AND all custom field values merged. Prefer this over list_attendees when custom field data is needed.",
      inputSchema: z.object({}),
      execute: async () => {
        const [attendees, fieldRows] = await Promise.all([
          fetchAll(
            `SELECT id, name, email, barcode, registrationStatus, approvalStatus,
                    checkinAt, totalCost, balanceDue, category_id
             FROM Attendee
             WHERE event_id = ? AND deleted = 0
             ORDER BY name`,
            [eventId],
          ),
          fetchAll(
            `SELECT afv.ATTENDEE_ID, afv.label, afv.responseValue
             FROM AttendeeFieldValue afv
             JOIN Attendee a ON a.id = afv.ATTENDEE_ID
             WHERE a.event_id = ? AND a.deleted = 0
             ORDER BY afv.ATTENDEE_ID, afv.field_id`,
            [eventId],
          ),
        ]);

        const fieldsByAttendee = new Map<number, Record<string, string>>();
        for (const row of fieldRows) {
          if (!fieldsByAttendee.has(row.ATTENDEE_ID))
            fieldsByAttendee.set(row.ATTENDEE_ID, {});
          fieldsByAttendee.get(row.ATTENDEE_ID)![row.label] = row.responseValue;
        }

        return JSON.stringify(
          attendees.map((a: any) => ({ ...a, customFields: fieldsByAttendee.get(a.id) ?? {} })),
          null,
          2,
        );
      },
    }),
  };
}
