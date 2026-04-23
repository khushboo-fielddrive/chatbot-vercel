import { tool } from "ai";
import { z } from "zod";
import { eventPool, fetchAll } from "@/lib/db/event-db";

export function createPredictionTools(accountId: number, eventId: number) {
  return {
    predict_category_arrivals: tool({
      description:
        "Predicts how many attendees in each category (VIP, General, Speaker, etc.) are likely to arrive at the current event, based on historical check-in rates from past events on this account. Returns: category, currently_registered, already_checked_in, historical_avg_checkin_rate_pct, predicted_total_arrivals. Use for 'how many VIPs will arrive?', 'predict attendance by category', 'expected VIP turnout'.",
      inputSchema: z.object({
        category_filter: z
          .string()
          .optional()
          .describe(
            "Optional category name to filter (e.g. 'VIP'). Leave empty to get all categories.",
          ),
      }),
      execute: async ({ category_filter }) => {
        // Step 1: historical check-in rates by category from past events on this account
        const historicalRows = await fetchAll(
          `SELECT
             ac.name AS category,
             COUNT(a.id) AS hist_registered,
             SUM(a.checkinAt IS NOT NULL) AS hist_checked_in,
             ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS hist_rate_pct
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id
           LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
           WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0
             AND e.id != ?
           GROUP BY a.category_id, ac.name
           ORDER BY hist_registered DESC`,
          [accountId, eventId],
        );

        // Step 2: current event registration + live check-in by category
        const currentRows = await fetchAll(
          `SELECT
             ac.name AS category,
             COUNT(a.id) AS registered,
             SUM(a.checkinAt IS NOT NULL) AS checked_in
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
           WHERE a.event_id = ? AND a.deleted = 0
           GROUP BY a.category_id, ac.name
           ORDER BY registered DESC`,
          [accountId, eventId],
        );

        // Build a lookup from historical rates
        const histMap = new Map<string, number>();
        for (const row of historicalRows) {
          histMap.set((row.category ?? "Uncategorized").toLowerCase(), Number(row.hist_rate_pct ?? 0));
        }

        const results = currentRows
          .filter((row: any) => {
            if (!category_filter) return true;
            return (row.category ?? "").toLowerCase().includes(category_filter.toLowerCase());
          })
          .map((row: any) => {
            const cat = row.category ?? "Uncategorized";
            const registered = Number(row.registered);
            const checkedIn = Number(row.checked_in ?? 0);
            const histRate = histMap.get(cat.toLowerCase()) ?? null;
            const predicted =
              histRate !== null ? Math.round((histRate / 100) * registered) : null;

            return {
              category: cat,
              registered,
              already_checked_in: checkedIn,
              historical_avg_checkin_rate_pct: histRate,
              predicted_total_arrivals: predicted,
              note:
                histRate === null
                  ? "No historical data for this category — prediction unavailable"
                  : undefined,
            };
          });

        return JSON.stringify(
          {
            current_event_id: eventId,
            predictions: results,
            disclaimer:
              "Predictions are based on historical check-in rates from past events on this account.",
          },
          null,
          2,
        );
      },
    }),

    predict_company_arrivals: tool({
      description:
        "Predicts how many attendees from a specific company (or all companies) are likely to arrive, based on historical check-in rates from past events. Looks up the 'company' or 'organization' custom field. Use for 'how many Cognizant people will come?', 'predict arrivals from [company]', 'expected turnout by company'.",
      inputSchema: z.object({
        company_name: z
          .string()
          .optional()
          .describe(
            "Company name to filter (e.g. 'Cognizant'). Leave empty to get top companies by registration count.",
          ),
        company_field_label: z
          .string()
          .default("company")
          .describe(
            "Custom field label that stores company/organization name. Default: 'company'. Change if the field is labelled differently (e.g. 'organization', 'employer').",
          ),
      }),
      execute: async ({ company_name, company_field_label }) => {
        const fieldLike = `%${company_field_label}%`;
        const companyLike = company_name ? `%${company_name}%` : "%";

        // Step 1: historical check-in rate by company from past events on this account
        const historicalRows = await fetchAll(
          `SELECT
             afv.responseValue AS company,
             COUNT(DISTINCT a.id) AS hist_registered,
             SUM(a.checkinAt IS NOT NULL) AS hist_checked_in,
             ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(DISTINCT a.id), 0) * 100, 1) AS hist_rate_pct
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id
           JOIN AttendeeFieldValue afv ON afv.ATTENDEE_ID = a.id
           WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0
             AND e.id != ?
             AND afv.label LIKE ?
             AND afv.responseValue LIKE ?
           GROUP BY afv.responseValue
           ORDER BY hist_registered DESC`,
          [accountId, eventId, fieldLike, companyLike],
        );

        // Step 2: current event count by company
        const currentRows = await fetchAll(
          `SELECT
             afv.responseValue AS company,
             COUNT(DISTINCT a.id) AS registered,
             SUM(a.checkinAt IS NOT NULL) AS checked_in
           FROM Attendee a
           JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
           JOIN AttendeeFieldValue afv ON afv.ATTENDEE_ID = a.id
           WHERE a.event_id = ? AND a.deleted = 0
             AND afv.label LIKE ?
             AND afv.responseValue LIKE ?
           GROUP BY afv.responseValue
           ORDER BY registered DESC`,
          [accountId, eventId, fieldLike, companyLike],
        );

        // Build historical lookup
        const histMap = new Map<string, number>();
        for (const row of historicalRows) {
          histMap.set((row.company ?? "").toLowerCase(), Number(row.hist_rate_pct ?? 0));
        }

        const predictions = currentRows.map((row: any) => {
          const company = row.company ?? "Unknown";
          const registered = Number(row.registered);
          const checkedIn = Number(row.checked_in ?? 0);
          const histRate = histMap.get(company.toLowerCase()) ?? null;
          const predicted =
            histRate !== null ? Math.round((histRate / 100) * registered) : null;

          return {
            company,
            registered,
            already_checked_in: checkedIn,
            historical_avg_checkin_rate_pct: histRate,
            predicted_total_arrivals: predicted,
            note:
              histRate === null
                ? "First time at this account's events — no historical rate available"
                : undefined,
          };
        });

        return JSON.stringify(
          {
            current_event_id: eventId,
            company_filter: company_name ?? "all",
            predictions,
            disclaimer:
              "Predictions use historical check-in rates from past events on this account.",
          },
          null,
          2,
        );
      },
    }),

    get_arrival_forecast_summary: tool({
      description:
        "Returns a concise attendance forecast for the current event: overall expected arrivals, by-category predictions, and overall historical check-in rate. Use for 'how many people are expected to arrive?', 'what's the attendance forecast?', 'predict total turnout'.",
      inputSchema: z.object({}),
      execute: async () => {
        const [[overallHist], [currentSummary], categoryRows] = await Promise.all([
          eventPool.query(
            `SELECT
               ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS overall_hist_rate_pct,
               COUNT(a.id) AS total_hist_registered,
               SUM(a.checkinAt IS NOT NULL) AS total_hist_checked_in
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id
             WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0
               AND e.id != ?`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,
          eventPool.query(
            `SELECT COUNT(*) AS registered, SUM(a.checkinAt IS NOT NULL) AS checked_in
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,
          fetchAll(
            `SELECT
               ac.name AS category,
               COUNT(a.id) AS registered,
               SUM(a.checkinAt IS NOT NULL) AS checked_in
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
             WHERE a.event_id = ? AND a.deleted = 0
             GROUP BY a.category_id, ac.name
             ORDER BY registered DESC`,
            [accountId, eventId],
          ),
        ]);

        const histRate = Number(overallHist[0]?.overall_hist_rate_pct ?? 0);
        const registered = Number(currentSummary[0]?.registered ?? 0);
        const checkedIn = Number(currentSummary[0]?.checked_in ?? 0);
        const predictedTotal = histRate > 0 ? Math.round((histRate / 100) * registered) : null;

        return JSON.stringify(
          {
            current_event: {
              registered,
              already_checked_in: checkedIn,
              remaining_expected: predictedTotal !== null ? Math.max(0, predictedTotal - checkedIn) : null,
              predicted_total_arrivals: predictedTotal,
            },
            historical_overall_checkin_rate_pct: histRate,
            category_forecast: categoryRows.map((row: any) => ({
              category: row.category ?? "Uncategorized",
              registered: Number(row.registered),
              already_checked_in: Number(row.checked_in ?? 0),
              predicted_arrivals:
                histRate > 0 ? Math.round((histRate / 100) * Number(row.registered)) : null,
            })),
            disclaimer:
              "Predictions apply the account-wide historical check-in rate. For per-category rates use predict_category_arrivals.",
          },
          null,
          2,
        );
      },
    }),
  };
}
