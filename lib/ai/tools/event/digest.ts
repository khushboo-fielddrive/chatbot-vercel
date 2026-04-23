import { tool } from "ai";
import { z } from "zod";
import { eventPool, fetchAll } from "@/lib/db/event-db";

export function createDigestTools(accountId: number, eventId: number) {
  return {
    get_midday_digest: tool({
      description:
        "Compiles a full midday event digest in a single call: overall check-in summary, last-hour velocity + trend, category breakdown (VIP / Speaker / General etc.), kiosk vs manual check-in split, top operator/location activity, VIP highlights (top VIPs checked in + those not yet arrived), session capacity alerts, and risk signals (velocity drop, VIPs missing, sessions at capacity). Use for 'midday digest', 'exec summary', 'how's the event going for leadership', 'put together a digest', 'daily status update'.",
      inputSchema: z.object({
        vip_category_name: z
          .string()
          .default("VIP")
          .describe(
            "Category name used for VIPs (default: 'VIP'). Change if the account uses a different label like 'VVIP' or 'Executive'.",
          ),
      }),
      execute: async ({ vip_category_name }) => {
        const RISK_CHECKIN_RATE_THRESHOLD = 60;
        const vipLike = `%${vip_category_name}%`;

        const [
          [overallRows],
          [lastHourRows],
          [prevHourRows],
          categoryRows,
          checkinModeRows,
          operatorRows,
          vipCheckedInRows,
          vipMissingRows,
          sessionRows,
          historicalRows,
        ] = await Promise.all([
          // 1. Overall summary
          eventPool.query(
            `SELECT
               COUNT(*) AS total_registered,
               SUM(a.checkinAt IS NOT NULL) AS checked_in,
               SUM(a.checkinAt IS NULL) AS not_checked_in,
               ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(*), 0) * 100, 1) AS checkin_pct
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,

          // 2. Last hour
          eventPool.query(
            `SELECT COUNT(*) AS last_hour_checkins
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0
               AND a.checkinAt >= NOW() - INTERVAL 1 HOUR`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,

          // 3. Previous hour (for velocity trend)
          eventPool.query(
            `SELECT COUNT(*) AS prev_hour_checkins
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0
               AND a.checkinAt >= NOW() - INTERVAL 2 HOUR
               AND a.checkinAt <  NOW() - INTERVAL 1 HOUR`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,

          // 4. Category breakdown
          fetchAll(
            `SELECT ac.name AS category,
                    COUNT(a.id) AS registered,
                    SUM(a.checkinAt IS NOT NULL) AS checked_in,
                    ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS checkin_pct
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
             WHERE a.event_id = ? AND a.deleted = 0
             GROUP BY a.category_id, ac.name
             ORDER BY registered DESC`,
            [accountId, eventId],
          ),

          // 5. Check-in mode split (kiosk vs manual vs app etc.)
          fetchAll(
            `SELECT
               COALESCE(NULLIF(TRIM(a.checkinMode), ''), 'unknown') AS mode,
               COUNT(*) AS count
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NOT NULL
             GROUP BY mode
             ORDER BY count DESC`,
            [accountId, eventId],
          ),

          // 6. Top operators / locations (kiosk activity)
          fetchAll(
            `SELECT
               COALESCE(NULLIF(TRIM(a.location), ''), 'unknown') AS location,
               COALESCE(NULLIF(TRIM(a.operator), ''), 'unknown') AS operator,
               COUNT(*) AS checkins
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NOT NULL
             GROUP BY location, operator
             ORDER BY checkins DESC`,
            [accountId, eventId],
          ),

          // 7. VIPs who have checked in (sample)
          fetchAll(
            `SELECT a.name, a.email, a.checkinAt, a.location, a.operator
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
             WHERE a.event_id = ? AND a.deleted = 0
               AND ac.name LIKE ?
               AND a.checkinAt IS NOT NULL
             ORDER BY a.checkinAt DESC`,
            [accountId, eventId, vipLike],
          ),

          // 8. VIPs not yet checked in
          fetchAll(
            `SELECT a.name, a.email, a.registrationStatus
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
             WHERE a.event_id = ? AND a.deleted = 0
               AND ac.name LIKE ?
               AND a.checkinAt IS NULL
             ORDER BY a.name`,
            [accountId, eventId, vipLike],
          ),

          // 9. Session capacity alerts (sessions ≥ 80% full)
          fetchAll(
            `SELECT es.name AS session,
                    es.maxPeople AS capacity,
                    SUM(sr.cancelled = 0 OR sr.cancelled IS NULL) AS active_reservations,
                    COUNT(ss.id) AS checked_in,
                    ROUND(COUNT(ss.id) / NULLIF(es.maxPeople, 0) * 100, 1) AS fill_pct
             FROM EventSession es
             JOIN Event e ON e.id = es.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN SessionReservation sr ON sr.session = es.id AND sr.deleted = 0
             LEFT JOIN SessionScan ss ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
             WHERE es.event_id = ? AND es.deleted = 0 AND es.maxPeople > 0
             GROUP BY es.id, es.name, es.maxPeople
             HAVING fill_pct >= 80
             ORDER BY fill_pct DESC`,
            [accountId, eventId],
          ),

          // 10. Historical overall check-in rate for this account
          eventPool.query(
            `SELECT ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS hist_rate_pct
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id
             WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0 AND e.id != ?`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,
        ]);

        // ── Assemble summary ──────────────────────────────────────────────
        const overall = overallRows[0];
        const lastHour = Number(lastHourRows[0]?.last_hour_checkins ?? 0);
        const prevHour = Number(prevHourRows[0]?.prev_hour_checkins ?? 0);
        const currentPct = Number(overall.checkin_pct ?? 0);
        const histRate = Number((historicalRows as any)[0][0]?.hist_rate_pct ?? 0);

        let velocityTrend: "increasing" | "decreasing" | "steady";
        if (prevHour === 0) {
          velocityTrend = lastHour > 0 ? "increasing" : "steady";
        } else if (lastHour > prevHour * 1.2) {
          velocityTrend = "increasing";
        } else if (lastHour < prevHour * 0.8) {
          velocityTrend = "decreasing";
        } else {
          velocityTrend = "steady";
        }

        // ── Risk signals ──────────────────────────────────────────────────
        const risks: string[] = [];

        if (histRate > 0 && currentPct < RISK_CHECKIN_RATE_THRESHOLD) {
          risks.push(
            `Check-in rate (${currentPct}%) is below the ${RISK_CHECKIN_RATE_THRESHOLD}% threshold (historical avg: ${histRate}%).`,
          );
        }
        if (velocityTrend === "decreasing" && lastHour < prevHour * 0.5) {
          risks.push(
            `Check-in velocity has dropped sharply: ${lastHour} in the last hour vs ${prevHour} in the prior hour.`,
          );
        }
        if (vipMissingRows.length > 0) {
          risks.push(
            `${vipMissingRows.length} ${vip_category_name}(s) have not yet checked in.`,
          );
        }
        if (sessionRows.length > 0) {
          const fullSessions = sessionRows.filter((s: any) => Number(s.fill_pct) >= 100);
          const nearlySessions = sessionRows.filter(
            (s: any) => Number(s.fill_pct) >= 80 && Number(s.fill_pct) < 100,
          );
          if (fullSessions.length > 0) {
            risks.push(
              `${fullSessions.length} session(s) at 100% capacity: ${fullSessions.map((s: any) => s.session).join(", ")}.`,
            );
          }
          if (nearlySessions.length > 0) {
            risks.push(
              `${nearlySessions.length} session(s) nearly full (≥80%): ${nearlySessions.map((s: any) => `${s.session} (${s.fill_pct}%)`).join(", ")}.`,
            );
          }
        }

        return JSON.stringify(
          {
            generated_at: new Date().toISOString(),
            overview: {
              total_registered: Number(overall.total_registered),
              checked_in: Number(overall.checked_in),
              not_checked_in: Number(overall.not_checked_in),
              checkin_pct: currentPct,
              historical_avg_checkin_pct: histRate,
            },
            velocity: {
              last_hour_checkins: lastHour,
              prev_hour_checkins: prevHour,
              trend: velocityTrend,
            },
            category_breakdown: categoryRows,
            kiosk_status: {
              mode_split: checkinModeRows,
              top_locations_operators: operatorRows,
            },
            vip_highlights: {
              category_used: vip_category_name,
              checked_in_sample: vipCheckedInRows,
              not_yet_arrived_sample: vipMissingRows,
            },
            session_capacity_alerts: sessionRows,
            risks,
          },
          null,
          2,
        );
      },
    }),
  };
}
