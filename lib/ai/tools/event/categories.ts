import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db/event-db";

export function createCategoryTools(accountId: number, eventId: number) {
  return {
    list_attendee_categories: tool({
      description:
        "Returns category definitions (id and name) for the event. Use only to look up category names or IDs. For counts per category, use get_category_breakdown.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT ac.id, ac.name, ac.thirdPartyId, ac.category_id
           FROM AttendeeCategory ac
           JOIN Event e ON e.id = ac.event_id AND e.account_id = ? AND e.deleted = 0
           WHERE ac.event_id = ? AND ac.deleted = 0`,
          [accountId, eventId],
        ),
    }),
  };
}
