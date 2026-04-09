import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db/event-db";

export function createCategoryTools(eventId: number) {
  return {
    list_attendee_categories: tool({
      description:
        "Returns category definitions (id and name) for the event. Use only to look up category names or IDs. For counts per category, use get_category_breakdown.",
      inputSchema: z.object({}),
      execute: async () =>
        query(
          `SELECT id, name, thirdPartyId, category_id
           FROM AttendeeCategory
           WHERE event_id = ? AND deleted = 0`,
          [eventId],
        ),
    }),
  };
}
