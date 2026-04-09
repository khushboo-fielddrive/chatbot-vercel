import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db/event-db";

export function createAccountTools(accountId: number) {
  return {
    get_current_account: tool({
      description: "Returns details for the current account.",
      inputSchema: z.object({}),
      execute: async () => {
        const sql = `SELECT id, name, image FROM Account WHERE id = ?`;
        return query(sql, [accountId]);
      },
    }),
  };
}
