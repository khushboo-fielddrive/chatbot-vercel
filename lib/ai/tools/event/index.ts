import { tool } from "ai";
import { z } from "zod";
import type { EventContext } from "@/lib/ai/event-context";
import { createAccountTools } from "./account";
import { createAttendeeTools } from "./attendees";
import { createCategoryTools } from "./categories";
import { createCheckHistoryTools } from "./check-history";
import { createSessionTools } from "./sessions";
import { createStatsTools } from "./stats";

export function createEventTools(ctx: EventContext) {
  const { eventId, accountId, event } = ctx;

  return {
    get_current_event: tool({
      description: "Returns details of the current event — name, dates, location, and status.",
      inputSchema: z.object({}),
      execute: async () => event,
    }),
    ...createAccountTools(accountId),
    ...createAttendeeTools(eventId),
    ...createCategoryTools(eventId),
    ...createCheckHistoryTools(eventId),
    ...createSessionTools(eventId),
    ...createStatsTools(eventId),
  };
}

export type EventTools = ReturnType<typeof createEventTools>;
