import { tool } from "ai";
import { z } from "zod";
import { eventPool, fetchAll, query } from "@/lib/db/event-db";

export function createAttendeeTools(accountId: number, eventId: number) {
  return {
    list_attendees: tool({
      description:
        "List all attendees for the event (standard fields only: name, email, barcode, registrationStatus, checkinAt). Do NOT call this if you need custom field values — call list_attendees_with_custom_fields directly instead. Do NOT use for counts — use get_category_breakdown or get_custom_field_distribution instead.",
      inputSchema: z.object({}),
      execute: async () => {
        const [[countRow]] = await eventPool.query(
          `SELECT COUNT(*) AS total FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE a.event_id = ? AND a.deleted = 0`,
          [accountId, eventId],
        ) as [any[], any];
        const total = Number(countRow.total);
        if (total > 100) {
          return JSON.stringify({
            total,
            data: [],
            message: `${total} attendees found — too many to list. Use search_attendees to filter by name/email, or get_category_breakdown for counts.`,
          }, null, 2);
        }
        const rows = await fetchAll(
          `SELECT a.id, a.name, a.email, a.barcode, a.registrationStatus, a.approvalStatus,
                  a.checkinAt, a.totalCost, a.balanceDue, a.category_id
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE a.event_id = ? AND a.deleted = 0
           ORDER BY a.name`,
          [accountId, eventId],
        );
        return JSON.stringify({ total, data: rows }, null, 2);
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
          `SELECT a.id, a.name, a.email, a.barcode, a.registrationStatus, a.checkinAt
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE a.event_id = ? AND a.deleted = 0
             AND (a.name LIKE ? OR a.email LIKE ? OR a.barcode LIKE ?)
           ORDER BY a.name`,
          [accountId, eventId, like, like, like],
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
            `SELECT a.id, a.name, a.email, a.barcode, a.registrationStatus, a.approvalStatus,
                    a.checkinAt, a.totalCost, a.balanceDue, a.category_id, a.subcategory_id,
                    a.discountCode, a.personalNote, a.location, a.operator
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.id = ? AND a.event_id = ? AND a.deleted = 0`,
            [accountId, attendee_id, eventId],
          ),
          fetchAll(
            `SELECT afv.fieldName, afv.label, afv.responseValue
             FROM AttendeeFieldValue afv
             JOIN Attendee a ON a.id = afv.ATTENDEE_ID
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE afv.ATTENDEE_ID = ? AND a.event_id = ? AND a.deleted = 0
             ORDER BY afv.field_id`,
            [accountId, attendee_id, eventId],
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
          `SELECT af.id, af.fieldName, af.label, af.dataType, af.typeLabel, af.required, af.visible, af.thirdPartyId
           FROM AttendeeField af
           JOIN Event e ON e.id = af.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE af.event_id = ? AND af.deleted = 0
           ORDER BY af.id`,
          [accountId, eventId],
        ),
    }),

    list_attendees_with_custom_fields: tool({
      description:
        "Returns all attendees with standard fields AND custom field values merged. Do NOT call this if the question only needs standard fields (name, email, barcode, status) — use list_attendees instead. Use field_label_filter to fetch only specific fields (e.g. 'company', 'country') — always prefer filtering over fetching all fields to reduce response size.",
      inputSchema: z.object({
        field_label_filter: z
          .string()
          .optional()
          .describe(
            "Optional LIKE filter on custom field labels (e.g. 'company' returns fields whose label contains 'company'). Leave empty to return all custom fields.",
          ),
      }),
      execute: async ({ field_label_filter }) => {
        const [[countRow]] = await eventPool.query(
          `SELECT COUNT(*) AS total FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE a.event_id = ? AND a.deleted = 0`,
          [accountId, eventId],
        ) as [any[], any];
        const total = Number(countRow.total);
        if (total > 100) {
          return JSON.stringify({
            total,
            data: [],
            message: `${total} attendees found — too many to list with custom fields. Use get_attendees_by_custom_field to filter by a specific field value, or get_custom_field_distribution for counts.`,
          }, null, 2);
        }
        const fieldLabelFilter = field_label_filter ? `%${field_label_filter}%` : "%";
        const [attendees, fieldRows] = await Promise.all([
          fetchAll(
            `SELECT a.id, a.name, a.email, a.barcode, a.registrationStatus, a.approvalStatus,
                    a.checkinAt, a.totalCost, a.balanceDue, a.category_id
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0
             ORDER BY a.name`,
            [accountId, eventId],
          ),
          fetchAll(
            `SELECT afv.ATTENDEE_ID, afv.label, afv.responseValue
             FROM AttendeeFieldValue afv
             JOIN Attendee a ON a.id = afv.ATTENDEE_ID
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0
               AND afv.label LIKE ?
             ORDER BY afv.ATTENDEE_ID, afv.field_id`,
            [accountId, eventId, fieldLabelFilter],
          ),
        ]);

        const fieldsByAttendee = new Map<number, Record<string, string>>();
        for (const row of fieldRows) {
          if (!fieldsByAttendee.has(row.ATTENDEE_ID))
            fieldsByAttendee.set(row.ATTENDEE_ID, {});
          fieldsByAttendee.get(row.ATTENDEE_ID)![row.label] = row.responseValue;
        }

        return JSON.stringify(
          { total, data: attendees.map((a: any) => ({ ...a, customFields: fieldsByAttendee.get(a.id) ?? {} })) },
          null,
          2,
        );
      },
    }),
  };
}
