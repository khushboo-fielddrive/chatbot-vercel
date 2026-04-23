/**
 * TechForward Global Summit 2026 — Event Data Loader
 *
 * Standalone script. Reads CSV files exported from the Fielddrive portal and
 * upserts sessions, attendees (with embedded session reservations), and replays
 * historical check-ins from the Event log — all against the Fielddrive integration API.
 *
 * Uses only Node.js built-in APIs (fetch, fs, path).
 *
 * Usage: npx tsx scripts/seed-techforward.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============ CONFIGURATION — Edit these before running ============
const BASE_URL = "https://api-fdb.devthree.fielddrivedev.com/rest";
const EVENT_ID = 6180;
const API_KEY = "95ec1cd4-9983-4f0f-964f-723d891130b8";
const DATA_DIR = "./scripts/dummy-data";
const REPLAY_CHECKINS = true; // false = skip check-in replay
const DRY_RUN = false; // true = print summary only, no API calls
// ===================================================================

const ATTENDEES_FILE = "TechForward_Global_Summit_2026 - Attendees.csv";
const SESSIONS_FILE = "TechForward_Global_Summit_2026 - Sessions.csv";
const RESERVATIONS_FILE = "TechForward_Global_Summit_2026 - Session reservations.csv";
const EVENT_LOG_FILE = "TechForward_Global_Summit_2026 - Event log.csv";

// ======================== CSV PARSER ===============================

/** Parse CSV text into array of row objects (keyed by header). Handles quoted fields with commas. */
function parseCSV(text: string): Record<string, string>[] {
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

  if (lines.length === 0) return [];
  const headers = lines[0];
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 1 && line[0] === "") continue; // skip empty lines
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

// ========================= DATE PARSER =============================

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Parse "28-Apr-2025 08:00" or "28-Apr-2025 08:00:36" → "2025-04-28T08:00:00.000Z" */
function parseFielddriveDate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unparseable date: ${input}`);
  }
  const [, day, mon, year, hour, min, sec = "00"] = match;
  const month = MONTH_MAP[mon];
  if (!month) throw new Error(`Unknown month: ${mon}`);
  return `${year}-${month}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${min}:${sec}.000Z`;
}

// ========================= TYPES ===================================

interface SessionData {
  thirdPartyId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  capacity?: number;
  visible: boolean;
  allowScanningOut: boolean;
  allowForcedCheckIn: boolean;
  defaultSessionAccessAmount: number;
  defaultRestrictAccessAmount: number;
}

interface ReservationEntry {
  sessionThirdPartyId: string;
  accessAmount: string;
  message?: string;
}

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
  sessionReservations: Record<string, string>[];
  deleteExistingSessionReservations: boolean;
}

interface CheckInEvent {
  timestamp: string; // ISO
  attendeeTpid: string;
  sessionTpid: string;
  location: string;
  operator: string;
  kioskName: string;
  kioskId: string;
  checkinMode: string;
}

// ========================= BUILDERS ================================

function buildSessions(rows: Record<string, string>[], restrictedSessionIds: Set<string>): SessionData[] {
  return rows.map((r) => {
    const capacityStr = r["Capacity limit"]?.trim();
    const capacity = capacityStr ? parseInt(capacityStr, 10) : undefined;
    const tpid = r["Session Third Party Id"];
    const isRestricted = restrictedSessionIds.has(tpid);

    return {
      thirdPartyId: tpid,
      name: r["Name"],
      location: r["Session Location"],
      startsOn: parseFielddriveDate(r["Start"]),
      endsOn: parseFielddriveDate(r["End"]),
      ...(capacity !== undefined && !Number.isNaN(capacity) ? { capacity } : {}),
      visible: true,
      allowScanningOut: r["Allow OUT-scanning"]?.toUpperCase() === "TRUE",
      allowForcedCheckIn: r["Allow force check-in"]?.toUpperCase() === "TRUE",
      defaultSessionAccessAmount: isRestricted ? 0 : -1,
      defaultRestrictAccessAmount: isRestricted ? -1 : 0,
    };
  });
}

function buildReservationsMap(rows: Record<string, string>[]): Map<string, ReservationEntry[]> {
  const map = new Map<string, ReservationEntry[]>();
  for (const r of rows) {
    const attendeeTpid = r["Attendee Third Party ID"];
    if (!attendeeTpid) continue;
    const entry: ReservationEntry = {
      sessionThirdPartyId: r["Session Third Party Id"],
      accessAmount: r["Access Amount"] || "1",
    };
    const message = r["message"]?.trim();
    if (message) entry.message = message;

    if (!map.has(attendeeTpid)) map.set(attendeeTpid, []);
    map.get(attendeeTpid)!.push(entry);
  }
  return map;
}

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
  reservationsMap: Map<string, ReservationEntry[]>,
  categoryTpidMap: Map<string, string>,
): AttendeeData[] {
  return rows.map((r) => {
    const tpid = r["Third Party ID"];
    const fieldValues: Record<string, string> = {};

    // Add 6 direct custom fields (only if non-empty)
    for (const key of CUSTOM_FIELD_KEYS) {
      const val = r[key]?.trim();
      if (val) fieldValues[key] = val;
    }
    // Country goes into fieldValues (per plan)
    const country = r["Country"]?.trim();
    if (country) fieldValues.country = country;

    // Convert reservation entries → records with string values
    const reservations = reservationsMap.get(tpid) ?? [];
    const sessionReservations: Record<string, string>[] = reservations.map((e) => {
      const obj: Record<string, string> = {
        sessionThirdPartyId: e.sessionThirdPartyId,
        accessAmount: e.accessAmount,
      };
      if (e.message) obj.message = e.message;
      return obj;
    });

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
      sessionReservations,
      deleteExistingSessionReservations: true,
    };
  });
}

function buildEventsFromLog(rows: Record<string, string>[], action: string): CheckInEvent[] {
  const events: CheckInEvent[] = [];
  for (const r of rows) {
    if (r["Action"]?.trim() !== action) continue;
    try {
      events.push({
        timestamp: parseFielddriveDate(r["Timestamp"]),
        attendeeTpid: r["Attendee Third Party ID"],
        sessionTpid: r["Session Third Party Id"],
        location: r["Location"] || "",
        operator: r["Operator"] || "",
        kioskName: r["Device Name"] || "",
        kioskId: r["Device ID"] || r["Device Name"] || "",
        checkinMode: r["Identification Mode"] || "",
      });
    } catch (e) {
      console.warn(`  Skipping ${action} row with bad timestamp: ${r["Timestamp"]}`);
    }
  }
  return events;
}

// ======================== API CLIENT ===============================

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

      if (res.ok) {
        return { ok: true, status: res.status, body };
      }

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

async function upsertSession(session: SessionData): Promise<{ ok: boolean; internalId?: number }> {
  const url = `${BASE_URL}/api/v1/integration/events/${EVENT_ID}/eventSessions/upsert?apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    },
    `Session ${session.thirdPartyId} (${session.name})`,
  );
  if (result.ok && result.body?.id) {
    return { ok: true, internalId: result.body.id };
  }
  return { ok: result.ok };
}

async function upsertAttendeeCategory(thirdPartyId: string, name: string): Promise<boolean> {
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
    if (Array.isArray(failedList)) {
      failedCount = failedList.length;
    }
  }

  return { ok: result.ok, mappings, failedCount };
}

async function checkInAttendeeSession(
  internalAttendeeId: number,
  internalSessionId: number,
  checkInDate: string,
  scanData: { operator: string; location: string; kioskId: string; kioskName: string; checkinMode: string },
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/sessions/${internalSessionId}/attendants/${internalAttendeeId}/checkin?checkInDate=${encodeURIComponent(checkInDate)}&apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanData),
    },
    `Session check-in attendee #${internalAttendeeId} → session #${internalSessionId}`,
  );
  return result.ok;
}

async function checkOutAttendeeSession(
  internalAttendeeId: number,
  internalSessionId: number,
  checkOutDate: string,
  scanData: { operator: string; location: string; kioskId: string; kioskName: string; checkinMode: string },
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/sessions/${internalSessionId}/attendants/${internalAttendeeId}/checkout?checkOutDate=${encodeURIComponent(checkOutDate)}&apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanData),
    },
    `Session check-out attendee #${internalAttendeeId} → session #${internalSessionId}`,
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

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number, onProgress?: (done: number, total: number) => void): Promise<T[]> {
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
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

// ========================== MAIN ===================================

async function main() {
  console.log("=== TechForward Event Data Loader ===\n");
  console.log(`  Base URL:       ${BASE_URL}`);
  console.log(`  Event ID:       ${EVENT_ID}`);
  console.log(`  Data Dir:       ${DATA_DIR}`);
  console.log(`  Replay check-ins: ${REPLAY_CHECKINS}`);
  console.log(`  Dry Run:        ${DRY_RUN}\n`);

  // --- Load CSVs ---
  console.log("Reading CSV files...");
  const attendeeRows = readCSV(ATTENDEES_FILE);
  const sessionRows = readCSV(SESSIONS_FILE);
  const reservationRows = readCSV(RESERVATIONS_FILE);
  const eventLogRows = REPLAY_CHECKINS ? readCSV(EVENT_LOG_FILE) : [];

  console.log(`  Attendees: ${attendeeRows.length}`);
  console.log(`  Sessions:  ${sessionRows.length}`);
  console.log(`  Reservations: ${reservationRows.length}`);
  console.log(`  Event log rows: ${eventLogRows.length}`);

  // --- Build data ---
  const restrictedSessionIds = new Set(reservationRows.map((r) => r["Session Third Party Id"]).filter(Boolean));
  const sessions = buildSessions(sessionRows, restrictedSessionIds);
  const reservationsMap = buildReservationsMap(reservationRows);
  const eventCheckInEvents = buildEventsFromLog(eventLogRows, "Check-In");
  const sessionCheckInEvents = buildEventsFromLog(eventLogRows, "Session scan In");
  const sessionCheckOutEvents = buildEventsFromLog(eventLogRows, "Session scan Out");

  // Build category thirdPartyId map from unique category names in attendees CSV
  const uniqueCategoryNames = Array.from(new Set(attendeeRows.map((r) => r["Category"]).filter(Boolean)));
  const categoryTpidMap = new Map<string, string>();
  for (const name of uniqueCategoryNames) {
    categoryTpidMap.set(name, slugifyCategory(name));
  }

  // Merge session check-in events into reservationsMap so every session scan has a backing reservation.
  // The API rejects session check-ins without an existing reservation.
  const explicitReservationCount = Array.from(reservationsMap.values()).reduce((s, arr) => s + arr.length, 0);
  let addedFromLog = 0;
  for (const ev of sessionCheckInEvents) {
    if (!ev.attendeeTpid || !ev.sessionTpid) continue;
    const existing = reservationsMap.get(ev.attendeeTpid) ?? [];
    if (existing.some((r) => r.sessionThirdPartyId === ev.sessionTpid)) continue;
    existing.push({ sessionThirdPartyId: ev.sessionTpid, accessAmount: "1" });
    reservationsMap.set(ev.attendeeTpid, existing);
    addedFromLog++;
  }

  const attendees = buildAttendees(attendeeRows, reservationsMap, categoryTpidMap);

  const totalReservations = attendees.reduce((sum, a) => sum + a.sessionReservations.length, 0);
  console.log(`\nBuilt:`);
  console.log(`  ${sessions.length} sessions (${restrictedSessionIds.size} restricted, ${sessions.length - restrictedSessionIds.size} open)`);
  console.log(`  ${categoryTpidMap.size} unique categories`);
  console.log(`  ${attendees.length} attendees with ${totalReservations} embedded reservations`);
  console.log(`    (${explicitReservationCount} from reservations CSV + ${addedFromLog} auto-added from session check-in events)`);
  console.log(`  Event log breakdown (of ${eventLogRows.length} total):`);
  console.log(`    ${eventCheckInEvents.length} Check-In (event check-ins)`);
  console.log(`    ${sessionCheckInEvents.length} Session Scan (session check-ins)`);
  console.log(`    ${sessionCheckOutEvents.length} Scan Out (session check-outs)`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: Sample data ---\n");
    console.log("Sessions:");
    for (const s of sessions) {
      console.log(`  ${s.thirdPartyId} | ${s.name} | ${s.startsOn} → ${s.endsOn} | cap: ${s.capacity ?? "∞"} | OUT:${s.allowScanningOut} | FORCE:${s.allowForcedCheckIn}`);
    }
    console.log("\nFirst 3 Attendees:");
    for (const a of attendees.slice(0, 3)) {
      console.log(`  ${a.thirdPartyId} | ${a.firstName} ${a.lastName} | ${a.emailAddress} | ${a.company} | ${a.categoryThirdPartyId} | reservations: ${a.sessionReservations.length}`);
      console.log(`    fieldValues: ${JSON.stringify(a.fieldValues)}`);
    }
    if (eventCheckInEvents.length > 0) {
      console.log("\nFirst 3 Event Check-In events:");
      for (const e of eventCheckInEvents.slice(0, 3)) {
        console.log(`  ${e.timestamp} | attendee:${e.attendeeTpid} | operator:${e.operator} | device:${e.kioskName} | mode:${e.checkinMode}`);
      }
    }
    if (sessionCheckInEvents.length > 0) {
      console.log("\nFirst 3 Session Scan events:");
      for (const e of sessionCheckInEvents.slice(0, 3)) {
        console.log(`  ${e.timestamp} | attendee:${e.attendeeTpid} → session:${e.sessionTpid} | operator:${e.operator} | device:${e.kioskName} | mode:${e.checkinMode}`);
      }
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

  // --- Phase 1: Sessions ---
  console.log("\n--- Phase 1: Upserting sessions ---");
  const sessionIdMap = new Map<string, number>();
  let sessionSuccess = 0;
  for (const s of sessions) {
    const result = await upsertSession(s);
    if (result.ok) {
      sessionSuccess++;
      if (result.internalId) sessionIdMap.set(s.thirdPartyId, result.internalId);
      console.log(`  [OK] ${s.thirdPartyId} → ${s.name}${result.internalId ? ` (id: ${result.internalId})` : ""}`);
    }
  }
  console.log(`  Sessions: ${sessionSuccess}/${sessions.length} succeeded`);
  console.log(`  Mapped ${sessionIdMap.size} session internal IDs`);

  // --- Phase 2: Attendees ---
  console.log("\n--- Phase 2: Upserting attendees ---");
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
      for (const m of result.mappings) {
        emailToInternalId.set(m.email, m.internalId);
      }
    }
    console.log(`  Batch ${batchNum}: ${i + 1}-${Math.min(i + BATCH_SIZE, attendees.length)} of ${attendees.length} ${result.ok ? "[OK]" : "[FAIL]"} (mapped ${result.mappings.length}, failed ${result.failedCount})`);
  }
  console.log(`  Attendees: ${attendeeSuccess} succeeded, ${attendeeFailed} failed`);

  // Build tpid → internalId map via email chain
  const attendeeTpidToInternalId = new Map<string, number>();
  for (const a of attendees) {
    const id = emailToInternalId.get(a.emailAddress);
    if (id != null) attendeeTpidToInternalId.set(a.thirdPartyId, id);
  }
  console.log(`  Mapped ${attendeeTpidToInternalId.size} attendee internal IDs (tpid → id)`);

  let eventCheckinSuccess = 0;
  let sessionCheckinSuccess = 0;
  let sessionCheckoutSuccess = 0;

  if (REPLAY_CHECKINS) {
    // --- Phase 3: Event check-ins (Action = "Check-In") ---
    if (eventCheckInEvents.length > 0) {
      console.log("\n--- Phase 3: Replaying event check-ins ---");
      const tasks: (() => Promise<boolean>)[] = [];
      let skipped = 0;

      for (const ev of eventCheckInEvents) {
        const attendeeId = attendeeTpidToInternalId.get(ev.attendeeTpid);
        if (attendeeId == null) { skipped++; continue; }
        tasks.push(() => checkInAttendeeEvent(attendeeId, ev.timestamp, {
          operator: ev.operator,
          location: ev.location,
          kioskId: ev.kioskId,
          kioskName: ev.kioskName,
          checkinMode: ev.checkinMode,
        }));
      }

      console.log(`  Scheduled ${tasks.length} event check-ins (skipped ${skipped} missing attendee)`);
      let lastLogged = 0;
      const results = await withConcurrency(tasks, 5, (done, total) => {
        if (done - lastLogged >= 500 || done === total) { console.log(`  Progress: ${done}/${total}`); lastLogged = done; }
      });
      eventCheckinSuccess = results.filter((r) => r === true).length;
      console.log(`  Event check-ins: ${eventCheckinSuccess}/${tasks.length} succeeded`);
    }

    // --- Phase 4: Session check-ins (Action = "Session Scan") ---
    if (sessionCheckInEvents.length > 0) {
      console.log("\n--- Phase 4: Replaying session check-ins ---");
      const tasks: (() => Promise<boolean>)[] = [];
      let skippedNoAttendee = 0;
      let skippedNoSession = 0;

      for (const ev of sessionCheckInEvents) {
        const attendeeId = attendeeTpidToInternalId.get(ev.attendeeTpid);
        if (attendeeId == null) { skippedNoAttendee++; continue; }
        const sessionId = sessionIdMap.get(ev.sessionTpid);
        if (sessionId == null) { skippedNoSession++; continue; }
        tasks.push(() => checkInAttendeeSession(attendeeId, sessionId, ev.timestamp, {
          operator: ev.operator,
          location: ev.location,
          kioskId: ev.kioskId,
          kioskName: ev.kioskName,
          checkinMode: ev.checkinMode,
        }));
      }

      console.log(`  Scheduled ${tasks.length} session check-ins (skipped: ${skippedNoAttendee} missing attendee, ${skippedNoSession} missing session)`);
      let lastLogged = 0;
      const results = await withConcurrency(tasks, 5, (done, total) => {
        if (done - lastLogged >= 500 || done === total) { console.log(`  Progress: ${done}/${total}`); lastLogged = done; }
      });
      sessionCheckinSuccess = results.filter((r) => r === true).length;
      console.log(`  Session check-ins: ${sessionCheckinSuccess}/${tasks.length} succeeded`);
    }

    // --- Phase 5: Session check-outs (Action = "Scan Out") ---
    if (sessionCheckOutEvents.length > 0) {
      console.log("\n--- Phase 5: Replaying session check-outs ---");
      const tasks: (() => Promise<boolean>)[] = [];
      let skippedNoAttendee = 0;
      let skippedNoSession = 0;

      for (const ev of sessionCheckOutEvents) {
        const attendeeId = attendeeTpidToInternalId.get(ev.attendeeTpid);
        if (attendeeId == null) { skippedNoAttendee++; continue; }
        const sessionId = sessionIdMap.get(ev.sessionTpid);
        if (sessionId == null) { skippedNoSession++; continue; }
        tasks.push(() => checkOutAttendeeSession(attendeeId, sessionId, ev.timestamp, {
          operator: ev.operator,
          location: ev.location,
          kioskId: ev.kioskId,
          kioskName: ev.kioskName,
          checkinMode: ev.checkinMode,
        }));
      }

      console.log(`  Scheduled ${tasks.length} session check-outs (skipped: ${skippedNoAttendee} missing attendee, ${skippedNoSession} missing session)`);
      let lastLogged = 0;
      const results = await withConcurrency(tasks, 5, (done, total) => {
        if (done - lastLogged >= 500 || done === total) { console.log(`  Progress: ${done}/${total}`); lastLogged = done; }
      });
      sessionCheckoutSuccess = results.filter((r) => r === true).length;
      console.log(`  Session check-outs: ${sessionCheckoutSuccess}/${tasks.length} succeeded`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=== FINAL REPORT ===");
  console.log(`  Sessions upserted:      ${sessionSuccess}/${sessions.length}`);
  console.log(`  Attendees upserted:     ${attendeeSuccess} (failed: ${attendeeFailed})`);
  console.log(`  Event check-ins:        ${eventCheckinSuccess}`);
  console.log(`  Session check-ins:      ${sessionCheckinSuccess}`);
  console.log(`  Session check-outs:     ${sessionCheckoutSuccess}`);
  console.log(`  Time elapsed:           ${elapsed}s`);
  console.log("====================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
