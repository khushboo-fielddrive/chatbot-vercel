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
        const VIP_LIST_THRESHOLD = 50;
        const vipLike = `%${vip_category_name}%`;

        // ── Phase 1: always-needed aggregates + counts for conditional queries ──
        const [
          [overallRows],
          [lastHourRows],
          [prevHourRows],
          categoryRows,
          checkinModeRows,
          [vipCountRows],
          [operatorComboCountRows],
          sessionRows,
          historicalRows,
          notCheckedInStatusRows,
          [sessionEngagedRows],
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

          // 6. VIP counts (checked-in vs missing) — used to decide list vs stats
          eventPool.query(
            `SELECT
               SUM(a.checkinAt IS NOT NULL) AS vip_checked_in,
               SUM(a.checkinAt IS NULL)     AS vip_missing
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
             WHERE a.event_id = ? AND a.deleted = 0 AND ac.name LIKE ?`,
            [accountId, eventId, vipLike],
          ) as Promise<[any[], any]>,

          // 7. Operator/location combo count — used to decide list vs stats
          eventPool.query(
            `SELECT COUNT(*) AS combo_count FROM (
               SELECT 1
               FROM Attendee a
               JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
               WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NOT NULL
               GROUP BY COALESCE(NULLIF(TRIM(a.location), ''), 'unknown'),
                        COALESCE(NULLIF(TRIM(a.operator), ''), 'unknown')
             ) AS combos`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,

          // 8. Session capacity alerts (sessions ≥ 80% full)
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

          // 9. Historical overall check-in rate for this account
          eventPool.query(
            `SELECT ROUND(SUM(a.checkinAt IS NOT NULL) / NULLIF(COUNT(a.id), 0) * 100, 1) AS hist_rate_pct
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id
             WHERE e.account_id = ? AND a.deleted = 0 AND e.deleted = 0 AND e.id != ?`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,

          // 10. Not-checked-in breakdown by registration status
          fetchAll(
            `SELECT a.registrationStatus AS status, COUNT(*) AS count
             FROM Attendee a
             JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NULL
             GROUP BY a.registrationStatus ORDER BY count DESC`,
            [accountId, eventId],
          ),

          // 11. Session engagement depth — checked-in attendees who scanned into ≥1 session
          eventPool.query(
            `SELECT COUNT(DISTINCT sr.attendee) AS session_engaged
             FROM SessionReservation sr
             JOIN SessionScan ss ON ss.sessionReservation_id = sr.id AND ss.sessionScanType = 1
             JOIN Attendee a ON a.id = sr.attendee AND a.deleted = 0 AND a.checkinAt IS NOT NULL
             JOIN Event e ON e.id = sr.event_id AND e.account_id = ? AND e.deleted = 0
             WHERE sr.event_id = ? AND sr.deleted = 0`,
            [accountId, eventId],
          ) as Promise<[any[], any]>,
        ]);

        const vipCheckedInCount = Number(vipCountRows[0]?.vip_checked_in ?? 0);
        const vipMissingCount = Number(vipCountRows[0]?.vip_missing ?? 0);
        const operatorComboCount = Number(operatorComboCountRows[0]?.combo_count ?? 0);

        // ── Phase 2: conditional queries based on thresholds ──────────────
        const [kioskStatus, vipCheckedInData, vipMissingData] = await Promise.all([

          // Query 6: operator/location — list if ≤50 combos, per-location + per-operator stats if >50
          operatorComboCount <= VIP_LIST_THRESHOLD
            ? fetchAll(
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
              ).then((rows) => ({ stats_only: false, data: rows }))
            : Promise.all([
                fetchAll(
                  `SELECT
                     COALESCE(NULLIF(TRIM(a.location), ''), 'unknown') AS location,
                     COUNT(*) AS checkins
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NOT NULL
                   GROUP BY location ORDER BY checkins DESC`,
                  [accountId, eventId],
                ),
                fetchAll(
                  `SELECT
                     COALESCE(NULLIF(TRIM(a.operator), ''), 'unknown') AS operator,
                     COUNT(*) AS checkins
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   WHERE a.event_id = ? AND a.deleted = 0 AND a.checkinAt IS NOT NULL
                   GROUP BY operator ORDER BY checkins DESC`,
                  [accountId, eventId],
                ),
              ]).then(([locationRows, operatorRows]) => ({
                stats_only: true,
                combo_count: operatorComboCount,
                by_location: locationRows,   // chart: bar — location vs checkins
                by_operator: operatorRows,   // chart: bar — operator vs checkins
              })),

          // Query 7: VIPs checked in — list if ≤50, hourly timeline + location breakdown if >50
          vipCheckedInCount <= VIP_LIST_THRESHOLD
            ? fetchAll(
                `SELECT a.name, a.email, a.checkinAt, a.location, a.operator
                 FROM Attendee a
                 JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                 LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                 WHERE a.event_id = ? AND a.deleted = 0
                   AND ac.name LIKE ? AND a.checkinAt IS NOT NULL
                 ORDER BY a.checkinAt DESC`,
                [accountId, eventId, vipLike],
              ).then((rows) => ({ stats_only: false, count: vipCheckedInCount, data: rows }))
            : Promise.all([
                fetchAll(
                  `SELECT
                     DATE_FORMAT(
                       FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(a.checkinAt) / 3600) * 3600),
                       '%Y-%m-%d %H:%i'
                     ) AS hour_slot,
                     COUNT(*) AS checkins
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                   WHERE a.event_id = ? AND a.deleted = 0
                     AND ac.name LIKE ? AND a.checkinAt IS NOT NULL
                   GROUP BY hour_slot ORDER BY hour_slot`,
                  [accountId, eventId, vipLike],
                ),
                fetchAll(
                  `SELECT
                     COALESCE(NULLIF(TRIM(a.location), ''), 'unknown') AS location,
                     COUNT(*) AS checkins
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                   WHERE a.event_id = ? AND a.deleted = 0
                     AND ac.name LIKE ? AND a.checkinAt IS NOT NULL
                   GROUP BY location ORDER BY checkins DESC`,
                  [accountId, eventId, vipLike],
                ),
              ]).then(([timelineRows, locationRows]) => ({
                stats_only: true,
                count: vipCheckedInCount,
                hourly_timeline: timelineRows,   // chart: xychart-beta line — VIP arrivals per hour
                by_location: locationRows,        // chart: bar — where VIPs checked in
              })),

          // Query 8: VIPs missing — list if ≤50, registration/approval breakdown + top 10 sample if >50
          vipMissingCount <= VIP_LIST_THRESHOLD
            ? fetchAll(
                `SELECT a.name, a.email, a.registrationStatus
                 FROM Attendee a
                 JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                 LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                 WHERE a.event_id = ? AND a.deleted = 0
                   AND ac.name LIKE ? AND a.checkinAt IS NULL
                 ORDER BY a.name`,
                [accountId, eventId, vipLike],
              ).then((rows) => ({ stats_only: false, count: vipMissingCount, data: rows }))
            : Promise.all([
                fetchAll(
                  `SELECT a.registrationStatus AS status, COUNT(*) AS count
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                   WHERE a.event_id = ? AND a.deleted = 0
                     AND ac.name LIKE ? AND a.checkinAt IS NULL
                   GROUP BY a.registrationStatus ORDER BY count DESC`,
                  [accountId, eventId, vipLike],
                ),
                fetchAll(
                  `SELECT a.approvalStatus AS status, COUNT(*) AS count
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                   WHERE a.event_id = ? AND a.deleted = 0
                     AND ac.name LIKE ? AND a.checkinAt IS NULL
                   GROUP BY a.approvalStatus ORDER BY count DESC`,
                  [accountId, eventId, vipLike],
                ),
                fetchAll(
                  `SELECT a.name, a.email, a.registrationStatus
                   FROM Attendee a
                   JOIN Event e ON e.id = a.event_id AND e.account_id = ? AND e.deleted = 0
                   LEFT JOIN AttendeeCategory ac ON ac.id = a.category_id
                   WHERE a.event_id = ? AND a.deleted = 0
                     AND ac.name LIKE ? AND a.checkinAt IS NULL
                   ORDER BY a.name LIMIT 10`,
                  [accountId, eventId, vipLike],
                ),
              ]).then(([regRows, approvalRows, sampleRows]) => ({
                stats_only: true,
                count: vipMissingCount,
                registration_status: regRows,   // chart: pie/bar — why VIPs haven't arrived
                approval_status: approvalRows,
                sample_top10: sampleRows,        // first 10 alphabetically for quick reference
              })),
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

        // VIP missing — include names if list is available
        if (vipMissingCount > 0) {
          const missingNames =
            !vipMissingData.stats_only && Array.isArray((vipMissingData as any).data)
              ? (vipMissingData as any).data.map((v: any) => v.name).join(", ")
              : (vipMissingData as any).sample_top10?.map((v: any) => v.name).join(", ") ?? "";
          risks.push(
            `${vipMissingCount} ${vip_category_name}(s) not yet checked in${missingNames ? `: ${missingNames}` : ""}.`,
          );
        }

        // Board member missing — derive from categoryRows
        const boardCategories = categoryRows.filter((r: any) =>
          r.category?.toLowerCase().includes("board"),
        );
        const boardMissing = boardCategories.reduce(
          (sum: number, r: any) => sum + (Number(r.registered) - Number(r.checked_in)),
          0,
        );
        if (boardMissing > 0) {
          risks.push(
            `${boardMissing} Board Member(s) not yet checked in — flag for immediate follow-up.`,
          );
        }

        // Staff below 100% — derive from categoryRows
        const staffCategories = categoryRows.filter((r: any) =>
          r.category?.toLowerCase().includes("staff"),
        );
        for (const sc of staffCategories) {
          const staffMissing = Number(sc.registered) - Number(sc.checked_in);
          if (staffMissing > 0) {
            risks.push(
              `Staff check-in at ${sc.checkin_pct}% — ${staffMissing} staff member(s) not yet checked in.`,
            );
          }
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

        // Enrich mode_split with % of total checked-in
        const totalCheckedIn = Number(overall.checked_in ?? 0);
        const enrichedModeSplit = checkinModeRows.map((r: any) => ({
          ...r,
          pct: totalCheckedIn > 0
            ? Math.round(Number(r.count) / totalCheckedIn * 1000) / 10
            : 0,
        }));

        // ── Enhancement 1: completion estimate ───────────────────────────
        const total = Number(overall.total_registered);
        const now = Date.now();
        const completion_estimate: Record<string, string | null> = {};
        for (const [key, targetPct] of [['80pct', 0.8], ['90pct', 0.9], ['100pct', 1.0]] as [string, number][]) {
          const targetCount = Math.ceil(total * targetPct);
          const remaining = targetCount - totalCheckedIn;
          if (remaining <= 0) {
            completion_estimate[key] = 'already_reached';
          } else if (lastHour === 0) {
            completion_estimate[key] = null; // no velocity — cannot estimate
          } else {
            const hoursNeeded = remaining / lastHour;
            completion_estimate[key] = new Date(now + hoursNeeded * 3600000).toISOString();
          }
        }

        // ── Enhancement 3: top 3 operators ───────────────────────────────
        const operatorSource: any[] = kioskStatus.stats_only
          ? (kioskStatus as any).by_operator ?? []
          : ((kioskStatus as any).data ?? []).reduce((acc: any[], r: any) => {
              const ex = acc.find((x) => x.operator === r.operator);
              if (ex) ex.checkins += Number(r.checkins);
              else acc.push({ operator: r.operator, checkins: Number(r.checkins) });
              return acc;
            }, []);
        const top3_operators = [...operatorSource]
          .sort((a, b) => Number(b.checkins) - Number(a.checkins))
          .slice(0, 3);

        // ── Enhancement 4: session engagement depth ───────────────────────
        const sessionEngaged = Number(sessionEngagedRows[0]?.session_engaged ?? 0);
        const session_engagement = {
          checked_in_attended_session: sessionEngaged,
          pct: totalCheckedIn > 0
            ? Math.round(sessionEngaged / totalCheckedIn * 1000) / 10
            : 0,
        };

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
            completion_estimate,
            category_breakdown: categoryRows,
            kiosk_status: { mode_split: enrichedModeSplit, top3_operators, ...kioskStatus },
            vip_highlights: {
              category_used: vip_category_name,
              checked_in: vipCheckedInData,
              not_yet_arrived: vipMissingData,
            },
            not_checked_in_by_status: notCheckedInStatusRows,
            session_capacity_alerts: sessionRows,
            session_engagement,
            risks,
          },
          null,
          2,
        );
      },
    }),
  };
}
