import { tool } from "ai";
import { z } from "zod";
import type { EventContext } from "@/lib/ai/event-context";
import { createAccountTools } from "./account";
import { createAccountInsightTools } from "./account-insights";
import { createAttendeeTools } from "./attendees";
import { createCategoryTools } from "./categories";
import { createCheckHistoryTools } from "./check-history";
import { createDigestTools } from "./digest";
import { createPredictionTools } from "./predictions";
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
    ...createAccountInsightTools(accountId, eventId),
    ...createPredictionTools(accountId, eventId),
    ...createDigestTools(accountId, eventId),
    ...createAttendeeTools(accountId, eventId),
    ...createCategoryTools(accountId, eventId),
    ...createCheckHistoryTools(accountId, eventId),
    ...createSessionTools(accountId, eventId),
    ...createStatsTools(accountId, eventId),
  };
}

export type EventTools = ReturnType<typeof createEventTools>;
