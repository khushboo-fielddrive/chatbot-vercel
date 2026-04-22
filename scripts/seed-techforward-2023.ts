/**
 * TechForward Global Summit 2023 — Attendees + Random Event Check-ins Loader
 *
 * Standalone script. Reads CSV files exported from the Fielddrive portal and:
 *  - Upserts all attendees into a Fielddrive event (no sessions, no reservations)
 *  - Performs random event-level check-ins driven by per-category Attended counts in Summary.csv
 *
 * Uses only Node.js built-in APIs (fetch, fs, path).
 *
 * Usage: npx tsx scripts/seed-techforward-2023.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============ CONFIGURATION — Edit these before running ============
const BASE_URL = "https://api-fdb.devthree.fielddrivedev.com/rest";
const EVENT_ID = 6179; // fresh event ID
const API_KEY = "95ec1cd4-9983-4f0f-964f-723d891130b8";
const DATA_DIR = "./scripts/dummy-data/2025";
const DO_CHECKINS = true; // false = upsert attendees only, skip check-ins
const DRY_RUN = false; // true = print summary, no API calls
// ===================================================================

const ATTENDEES_FILE = "TechForward_Global_Summit_2025 - Attendees.csv";
const SUMMARY_FILE = "TechForward_Global_Summit_2025 - Summary.csv";
const METADATA_FILE = "TechForward_Global_Summit_2025 - Event metadata.csv";

// ======================== CSV PARSER ===============================

/** Parse CSV text into array of string[] rows. Handles quoted fields with commas. */
function parseCSVLines(text: string): string[][] {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        lines.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // ignore, \n will handle it
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    lines.push(row);
  }
  return lines;
}

/** Parse CSV text into row objects keyed by headers in the first row. */
function parseCSV(text: string): Record<string, string>[] {
  const lines = parseCSVLines(text);
  if (lines.length === 0) return [];
  const headers = lines[0];
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 1 && line[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = line[j] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function readCSV(filename: string): Record<string, string>[] {
  const filepath = path.join(DATA_DIR, filename);
  const text = fs.readFileSync(filepath, "utf-8");
  return parseCSV(text);
}

function readCSVRaw(filename: string): string[][] {
  const filepath = path.join(DATA_DIR, filename);
  const text = fs.readFileSync(filepath, "utf-8");
  return parseCSVLines(text);
}

// ========================= DATE HELPERS ============================

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Parse "25-Apr-2023" → { year, month, day } */
function parseDateOnly(input: string): { year: number; month: number; day: number } {
  const match = input.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) throw new Error(`Unparseable date: ${input}`);
  const [, day, mon, year] = match;
  const month = MONTH_MAP[mon];
  if (!month) throw new Error(`Unknown month: ${mon}`);
  return { year: parseInt(year, 10), month, day: parseInt(day, 10) };
}

/** Days between two dates (inclusive). */
function daysBetween(start: { year: number; month: number; day: number }, end: { year: number; month: number; day: number }): number {
  const s = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const e = new Date(Date.UTC(end.year, end.month - 1, end.day));
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Generate a random check-in timestamp between start and end date, hours 08:00–18:00. */
function randomCheckinTimestamp(
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
): string {
  const totalDays = daysBetween(start, end);
  const dayOffset = Math.floor(Math.random() * totalDays);
  const base = new Date(Date.UTC(start.year, start.month - 1, start.day + dayOffset));
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");

  const hour = 8 + Math.floor(Math.random() * 10); // 08-17
  const min = Math.floor(Math.random() * 60);
  const sec = Math.floor(Math.random() * 60);
  return `${yy}-${mm}-${dd}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.000Z`;
}

// ========================= TYPES ===================================

interface AttendeeData {
  regKey: string;
  thirdPartyId: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  registrationStatus: string;
  company: string;
  jobTitle: string;
  badgeNum: string;
  categoryThirdPartyId: string;
  fieldValues: Record<string, string>;
}

// ========================= BUILDERS ================================

const CUSTOM_FIELD_KEYS = [
  "organisationType",
  "createdOnsite",
  "nationality",
  "State",
  "tags",
  "website",
] as const;

/** Slugify a category name into a thirdPartyId-safe string. e.g. "AI & Data" → "AI_Data" */
function slugifyCategory(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function buildAttendees(
  rows: Record<string, string>[],
  categoryTpidMap: Map<string, string>,
): AttendeeData[] {
  return rows.map((r) => {
    const tpid = r["Third Party ID"];
    const fieldValues: Record<string, string> = {};

    for (const key of CUSTOM_FIELD_KEYS) {
      const val = r[key]?.trim();
      if (val) fieldValues[key] = val;
    }
    const country = r["Country"]?.trim();
    if (country) fieldValues.country = country;

    const categoryName = r["Category"];
    const categoryThirdPartyId = categoryTpidMap.get(categoryName) ?? slugifyCategory(categoryName);

    return {
      regKey: tpid,
      thirdPartyId: tpid,
      firstName: r["First Name"],
      lastName: r["Last Name"],
      emailAddress: r["Email"],
      registrationStatus: "Confirmed",
      company: r["Company"],
      jobTitle: r["Job Title"],
      badgeNum: r["Barcode"],
      categoryThirdPartyId,
      fieldValues,
    };
  });
}

/** Parse Summary.csv — headers on row 2, skip row 1 (section header) and Grand Total row. */
function parseSummary(lines: string[][]): Map<string, number> {
  const map = new Map<string, number>();
  // Find the row with "Category" as the first header
  let headerRowIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i][0]?.trim() === "Category") {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) throw new Error("Summary.csv: could not find 'Category' header row");

  const headers = lines[headerRowIdx];
  const attendedIdx = headers.findIndex((h) => h.trim() === "Attended");
  if (attendedIdx === -1) throw new Error("Summary.csv: missing 'Attended' column");

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const row = lines[i];
    const category = row[0]?.trim();
    if (!category || category === "Grand Total") continue;
    const count = parseInt(row[attendedIdx] || "0", 10);
    if (!Number.isNaN(count)) map.set(category, count);
  }
  return map;
}

function parseEventMetadata(rows: Record<string, string>[]): {
  startDate: { year: number; month: number; day: number };
  endDate: { year: number; month: number; day: number };
} {
  const r = rows[0];
  if (!r) throw new Error("Event metadata.csv is empty");
  return {
    startDate: parseDateOnly(r["Start Date"]),
    endDate: parseDateOnly(r["End Date"]),
  };
}

// ========================= HELPERS =================================

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================= API CLIENT ==============================

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      if (res.ok) return { ok: true, status: res.status, body };

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        console.warn(`  [Retry ${attempt}/${MAX_RETRIES}] ${label} — ${res.status}`);
        await sleep(1000 * Math.pow(2, attempt - 1));
        continue;
      }

      console.error(`  [FAIL] ${label} — ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
      return { ok: false, status: res.status, body };
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        console.warn(`  [Retry ${attempt}/${MAX_RETRIES}] ${label} — ${err.message}`);
        await sleep(1000 * Math.pow(2, attempt - 1));
        continue;
      }
      console.error(`  [FAIL] ${label} — ${err.message}`);
      return { ok: false, status: 0, body: err.message };
    }
  }
  return { ok: false, status: 0, body: "Max retries exceeded" };
}

async function upsertAttendeeBatch(
  batch: AttendeeData[],
  batchNum: number,
): Promise<{ ok: boolean; mappings: { email: string; internalId: number }[]; failedCount: number }> {
  const url = `${BASE_URL}/api/v1/integration/events/${EVENT_ID}/attendees/upsert?apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    },
    `Attendee batch ${batchNum}`,
  );

  const mappings: { email: string; internalId: number }[] = [];
  let failedCount = 0;

  if (result.ok && result.body) {
    const successList = result.body.attendeeResponseModelList;
    const failedList = result.body.failedIntegrationModelList;

    if (batchNum === 1) {
      const errors = result.body.errorMessages;
      console.log(`  [DEBUG] Batch 1 — success: ${Array.isArray(successList) ? successList.length : "N/A"}, failed: ${Array.isArray(failedList) ? failedList.length : "N/A"}`);
      if (Array.isArray(errors) && errors.length > 0) {
        console.log(`  [DEBUG] Error messages (first 3): ${JSON.stringify(errors.slice(0, 3))}`);
      }
    }

    if (Array.isArray(successList)) {
      for (const a of successList) {
        if (a.id != null && a.email) {
          mappings.push({ email: a.email, internalId: a.id });
        }
      }
    }
    if (Array.isArray(failedList)) failedCount = failedList.length;
  }

  return { ok: result.ok, mappings, failedCount };
}

async function upsertAttendeeCategory(
  thirdPartyId: string,
  name: string,
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/integration/events/${EVENT_ID}/attendeeCategories/upsert?apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thirdPartyId, name }),
    },
    `Category ${thirdPartyId} (${name})`,
  );
  return result.ok;
}

async function checkInAttendeeEvent(
  internalAttendeeId: number,
  checkInDate: string,
  scanData: { operator: string; location: string; kioskId: string; kioskName: string; checkinMode: string },
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/attendees/${internalAttendeeId}/checkIn?checkInDate=${encodeURIComponent(checkInDate)}&apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanData),
    },
    `Event check-in attendee #${internalAttendeeId}`,
  );
  return result.ok;
}

// ===================== CONCURRENCY LIMITER =========================

async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (done: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();
  let done = 0;
  const total = tasks.length;

  for (const task of tasks) {
    const p = (async () => {
      const result = await task();
      results.push(result);
      done++;
      if (onProgress) onProgress(done, total);
    })();
    const wrapped = p.then(() => { executing.delete(wrapped); });
    executing.add(wrapped);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
  return results;
}

// ========================== MAIN ===================================

async function main() {
  console.log("=== TechForward 2023 Loader ===\n");
  console.log(`  Base URL:       ${BASE_URL}`);
  console.log(`  Event ID:       ${EVENT_ID}`);
  console.log(`  Data Dir:       ${DATA_DIR}`);
  console.log(`  Do check-ins:   ${DO_CHECKINS}`);
  console.log(`  Dry Run:        ${DRY_RUN}\n`);

  console.log("Reading CSV files...");
  const attendeeRows = readCSV(ATTENDEES_FILE);
  const summaryLines = readCSVRaw(SUMMARY_FILE);
  const metadataRows = readCSV(METADATA_FILE);

  console.log(`  Attendees: ${attendeeRows.length}`);
  console.log(`  Summary lines: ${summaryLines.length}`);
  console.log(`  Metadata rows: ${metadataRows.length}`);

  // Build category thirdPartyId map from unique category names in attendees CSV
  const uniqueCategoryNames = Array.from(new Set(attendeeRows.map((r) => r["Category"]).filter(Boolean)));
  const categoryTpidMap = new Map<string, string>();
  for (const name of uniqueCategoryNames) {
    categoryTpidMap.set(name, slugifyCategory(name));
  }

  const attendees = buildAttendees(attendeeRows, categoryTpidMap);
  const categoryCheckinCounts = parseSummary(summaryLines);
  const { startDate, endDate } = parseEventMetadata(metadataRows);

  // Group attendees by original category name (for summary matching)
  const byCategory = new Map<string, AttendeeData[]>();
  for (let i = 0; i < attendees.length; i++) {
    const catName = attendeeRows[i]["Category"];
    if (!byCategory.has(catName)) byCategory.set(catName, []);
    byCategory.get(catName)!.push(attendees[i]);
  }

  const totalPlannedCheckins = Array.from(categoryCheckinCounts.values()).reduce((s, n) => s + n, 0);

  console.log(`\nBuilt:`);
  console.log(`  ${attendees.length} attendees in ${byCategory.size} categories`);
  console.log(`  Event dates: ${startDate.year}-${String(startDate.month).padStart(2, "0")}-${String(startDate.day).padStart(2, "0")} → ${endDate.year}-${String(endDate.month).padStart(2, "0")}-${String(endDate.day).padStart(2, "0")}`);
  console.log(`  Planned check-ins: ${totalPlannedCheckins} across ${categoryCheckinCounts.size} categories`);

  console.log(`\nCategory plan:`);
  for (const [cat, planned] of categoryCheckinCounts) {
    const available = byCategory.get(cat)?.length ?? 0;
    const actual = Math.min(planned, available);
    console.log(`  ${cat}: ${actual}/${available} attendees (planned ${planned})`);
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: Sample data ---\n");
    console.log("First 3 Attendees:");
    for (const a of attendees.slice(0, 3)) {
      console.log(`  ${a.thirdPartyId} | ${a.firstName} ${a.lastName} | ${a.emailAddress} | ${a.company} | ${a.categoryThirdPartyId}`);
      console.log(`    fieldValues: ${JSON.stringify(a.fieldValues)}`);
    }
    console.log("\nSample check-in timestamps (5 random):");
    for (let i = 0; i < 5; i++) {
      console.log(`  ${randomCheckinTimestamp(startDate, endDate)}`);
    }
    console.log("\n--- DRY RUN complete. Set DRY_RUN = false to call API. ---");
    return;
  }

  const startTime = Date.now();

  // --- Phase 0: Upsert Categories ---
  console.log("\n--- Phase 0: Upserting attendee categories ---");
  let categorySuccess = 0;
  for (const [name, tpid] of categoryTpidMap) {
    const ok = await upsertAttendeeCategory(tpid, name);
    if (ok) {
      categorySuccess++;
      console.log(`  [OK] ${tpid} → ${name}`);
    }
  }
  console.log(`  Categories: ${categorySuccess}/${categoryTpidMap.size} succeeded`);

  // --- Phase 1: Upsert Attendees ---
  console.log("\n--- Phase 1: Upserting attendees ---");
  const emailToInternalId = new Map<string, number>();
  let attendeeSuccess = 0;
  let attendeeFailed = 0;

  for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
    const batch = attendees.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const result = await upsertAttendeeBatch(batch, batchNum);
    if (result.ok) {
      attendeeSuccess += result.mappings.length;
      attendeeFailed += result.failedCount;
      for (const m of result.mappings) emailToInternalId.set(m.email, m.internalId);
    }
    console.log(`  Batch ${batchNum}: ${i + 1}-${Math.min(i + BATCH_SIZE, attendees.length)} of ${attendees.length} ${result.ok ? "[OK]" : "[FAIL]"} (mapped ${result.mappings.length}, failed ${result.failedCount})`);
  }
  console.log(`  Attendees: ${attendeeSuccess} succeeded, ${attendeeFailed} failed`);

  // Build attendee internal ID lookup via email chain
  const attendeeToInternalId = new Map<string, number>(); // thirdPartyId → internalId
  for (const a of attendees) {
    const id = emailToInternalId.get(a.emailAddress);
    if (id != null) attendeeToInternalId.set(a.thirdPartyId, id);
  }
  console.log(`  Mapped ${attendeeToInternalId.size} attendee internal IDs`);

  // --- Phase 2: Random Event Check-ins ---
  let checkinTotal = 0;
  let checkinSuccess = 0;
  const perCategoryResults = new Map<string, { success: number; total: number }>();

  if (DO_CHECKINS) {
    console.log("\n--- Phase 2: Random event check-ins ---");
    const tasks: (() => Promise<{ category: string; ok: boolean }>)[] = [];

    for (const [category, plannedCount] of categoryCheckinCounts) {
      const available = (byCategory.get(category) ?? []).filter((a) => attendeeToInternalId.has(a.thirdPartyId));
      const picked = pickN(available, plannedCount);
      perCategoryResults.set(category, { success: 0, total: picked.length });

      for (const a of picked) {
        const internalId = attendeeToInternalId.get(a.thirdPartyId)!;
        const timestamp = randomCheckinTimestamp(startDate, endDate);
        const scanData = {
          operator: "registration@techforwardsummit.com",
          location: "Main Entrance, Level 1",
          kioskId: "iPad-Registration-01",
          kioskName: "iPad-Registration-01",
          checkinMode: "QR Scan",
        };
        tasks.push(async () => {
          const ok = await checkInAttendeeEvent(internalId, timestamp, scanData);
          return { category, ok };
        });
      }
    }

    checkinTotal = tasks.length;
    console.log(`  Scheduled ${checkinTotal} random check-ins`);

    let lastLogged = 0;
    const results = await withConcurrency(tasks, 5, (done, total) => {
      if (done - lastLogged >= 100 || done === total) {
        console.log(`  Progress: ${done}/${total}`);
        lastLogged = done;
      }
    });

    for (const r of results) {
      if (r.ok) {
        checkinSuccess++;
        const catResult = perCategoryResults.get(r.category)!;
        catResult.success++;
      }
    }
    console.log(`  Event check-ins: ${checkinSuccess}/${checkinTotal} succeeded`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=== FINAL REPORT ===");
  console.log(`  Attendees upserted:    ${attendeeSuccess} (failed: ${attendeeFailed})`);
  console.log(`  Attendee ID maps:      ${attendeeToInternalId.size}`);
  if (DO_CHECKINS) {
    console.log(`  Event check-ins:       ${checkinSuccess}/${checkinTotal}`);
    console.log(`\n  Per-category results:`);
    for (const [cat, res] of perCategoryResults) {
      console.log(`    ${cat}: ${res.success}/${res.total}`);
    }
  }
  console.log(`  Time elapsed:          ${elapsed}s`);
  console.log("====================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
