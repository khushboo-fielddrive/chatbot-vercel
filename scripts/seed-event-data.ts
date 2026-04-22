/**
 * Fielddrive Dummy Event Data Seeder
 *
 * Standalone script — uses only Node.js built-in APIs (fetch, parseArgs).
 * Populates a Fielddrive event with sessions, attendees (with session reservations),
 * event check-ins, and session check-ins.
 *
 * Usage: npx tsx scripts/seed-event-data.ts
 */

// ============ CONFIGURATION — Edit these before running ============
const BASE_URL = "https://api-fdb.devthree.fielddrivedev.com/rest";
const EVENT_ID = 6183;
const API_KEY = ""; //fd-API-key
const ATTENDEE_COUNT = 750;
const SESSION_COUNT = 10;
const EVENT_START_DATE = "2026-04-24"; // YYYY-MM-DD (event spans 2 days)
const ID_PREFIX = "TP"; // prefix for attendee thirdPartyIds
const CHECKIN_PERCENT = 0.6; // 60% of confirmed attendees get event check-in
const SESSION_CHECKIN_PERCENT = 0.5; // 50% of reserved+checked-in attendees get session check-in
const DRY_RUN = false; // true = print data summary, don't call API
// ===================================================================

// ========================= DATA POOLS ==============================

const FIRST_NAMES = [
  "Ahmed", "Peter", "Priya", "Katarina", "Mariam", "Nina", "Nathan",
  "Soo-jin", "Sneha", "Paulo", "Huda", "Laura", "Amira", "Aaron",
  "Tom", "Deepak", "Chloe", "Petra", "Samuel", "David", "Fatima",
  "Suresh", "Takeshi", "Hana", "Lucas", "Lily", "Omar", "Elena",
  "Carlos", "Mei", "Raj", "Sofia", "James", "Yuki", "Ananya",
  "Marcus", "Isla", "Chen", "Aisha", "Felix", "Nadia", "Kofi",
  "Maria", "Diego", "Lena", "Arjun", "Emma", "Hassan", "Julia",
  "Viktor", "Zara", "Ravi", "Ingrid", "Tariq", "Svetlana", "Kenji",
  "Olga", "Ibrahim", "Mina", "Jorge", "Akiko", "Dmitri", "Leila",
  "Giovanni", "Sanya", "Hiroshi", "Bianca", "Naveen", "Astrid", "Wei",
  "Camille", "Andrei", "Sakura", "Mateo", "Freya", "Kiran", "Emeka",
  "Natasha", "Rafael", "Simone", "Rohan", "Elif", "Anders", "Thandi",
  "Liam", "Aditi", "Hugo", "Chiara", "Samir", "Anya", "Tobias",
  "Marta", "Idris", "Yuna", "Gabriel", "Noor", "Sebastian", "Kavya",
  "Oliver", "Rina", "Soren", "Amara", "Vincent", "Devi", "Nikolai",
  "Lucia", "Pranav", "Elise", "Kaito", "Zuri", "Ethan", "Layla",
  "Oscar", "Meera", "Finn", "Aaliya", "Dante", "Miho", "Leon",
  "Tanya", "Rahul", "Celeste", "Aarav", "Isla", "Max", "Yara",
  "Theo", "Pooja", "Erik", "Naya", "Marco", "Shreya", "Henrik",
  "Amelia", "Vivek", "Hanna", "Troy", "Divya", "Jasper", "Reina",
];

const LAST_NAMES = [
  "Nakamura", "Richter", "Choi", "Rogers", "Adams", "Carter", "Hall",
  "Khan", "Wright", "Hill", "Martinez", "Papadopoulos", "Verma",
  "Jang", "Smith", "Lee", "Evans", "Wilson", "Rodriguez", "Reddy",
  "Wei", "Dupont", "Roberts", "Suzuki", "Sharma", "Morris", "Kim",
  "Patel", "Johnson", "Garcia", "Brown", "Davis", "Chen", "Muller",
  "Tanaka", "Singh", "Anderson", "Thomas", "Jackson", "White",
  "Harris", "Martin", "Thompson", "Moore", "Taylor", "Clark",
  "Walker", "Scott", "Torres", "Nguyen", "Fernandez", "Johansson",
  "Petrov", "Yamamoto", "Okafor", "Lindqvist", "Rossi", "Ivanov",
  "Santos", "Bergmann", "Watanabe", "Krishnamurthy", "Olsen", "Bianchi",
  "Kovacs", "Dubois", "Sato", "Mkhize", "Larsson", "Colombo",
  "Sokolov", "Fujita", "Osei", "Hoffmann", "Morales", "Kimura",
  "Naidoo", "Eriksson", "Romano", "Volkov", "Hayashi", "Mensah",
  "Weber", "Reyes", "Takahashi", "Dlamini", "Fischer", "Bello",
  "Almeida", "Kuznetsov", "Ishikawa", "Adeyemi", "Andersen", "Costa",
  "Popov", "Endo", "Asante", "Schneider", "Herrera", "Matsumoto",
  "Khumalo", "Johal", "Ricci", "Kozlov", "Ogawa", "Boateng",
  "Braun", "Castillo", "Ueda", "Moyo", "Nilsson", "De Luca",
  "Fedorov", "Saito", "Owusu", "Krause", "Vargas", "Shimizu",
  "Nkosi", "Gustafsson", "Ferrari", "Sorokin", "Mori", "Adjei",
];

const COMPANIES = [
  "QuantumLeap Inc", "MunichSoft AG", "HCL Tech", "Mastercard Labs",
  "Bangalore AI Co", "SaoPaulo Digital", "Flipkart", "Ola Technology",
  "ByteDance", "AI Ventures", "InfoSync Technologies", "Delhi DataHub",
  "SydneyDev Co", "CyberFort Security", "Tata Digital", "PayPal Innovation",
  "CloudMatrix India", "Goldman Sachs Digital", "Nordic AI Labs", "Palantir",
  "TechLatam", "BerlinTech GmbH", "Wipro Technologies", "Cognizant",
  "Accenture Labs", "Microsoft Research", "Google DeepMind", "Meta Platforms",
  "Stripe", "Shopify", "Atlassian", "Salesforce", "SAP Labs",
  "Oracle Cloud", "IBM Research", "Tesla AI", "SpaceX Software",
  "Uber Engineering", "Airbnb Tech", "Netflix Engineering",
];

const JOB_TITLES = [
  "Staff Engineer", "VP Product", "Backend Developer", "SRE Engineer",
  "Database Administrator", "Principal Engineer", "Chief Data Officer",
  "Full Stack Developer", "Director of Partnerships", "CEO",
  "Product Lead", "Data Scientist", "CIO", "UX Designer",
  "Scrum Master", "Software Architect", "Managing Director",
  "Cloud Architect", "Founder", "CTO", "DevOps Engineer",
  "Machine Learning Engineer", "Security Analyst", "Tech Lead",
  "Engineering Manager", "Solutions Architect", "QA Lead",
  "Platform Engineer", "Data Engineer", "Product Manager",
];

const COUNTRIES: { name: string; code: string; weight: number }[] = [
  { name: "India", code: "+91", weight: 0.19 },
  { name: "United States", code: "+1", weight: 0.19 },
  { name: "United Kingdom", code: "+44", weight: 0.11 },
  { name: "Germany", code: "+49", weight: 0.085 },
  { name: "Singapore", code: "+65", weight: 0.06 },
  { name: "Canada", code: "+1", weight: 0.05 },
  { name: "Ireland", code: "+353", weight: 0.04 },
  { name: "South Korea", code: "+82", weight: 0.04 },
  { name: "Spain", code: "+34", weight: 0.035 },
  { name: "Sweden", code: "+46", weight: 0.03 },
  { name: "Japan", code: "+81", weight: 0.03 },
  { name: "Australia", code: "+61", weight: 0.03 },
  { name: "France", code: "+33", weight: 0.03 },
  { name: "Brazil", code: "+55", weight: 0.025 },
  { name: "Netherlands", code: "+31", weight: 0.02 },
  { name: "UAE", code: "+971", weight: 0.02 },
  { name: "Mexico", code: "+52", weight: 0.015 },
  { name: "South Africa", code: "+27", weight: 0.015 },
];

const CATEGORIES: { name: string; weight: number }[] = [
  { name: "Delegate", weight: 0.45 },
  { name: "General Attendee", weight: 0.40 },
  { name: "VIP", weight: 0.06 },
  { name: "Sponsor", weight: 0.05 },
  { name: "Speaker", weight: 0.03 },
  { name: "Media", weight: 0.01 },
];

const SESSION_TEMPLATES = [
  { name: "Opening Keynote", location: "Main Hall", capacity: 200, restricted: false },
  { name: "AI & Machine Learning Workshop", location: "Workshop Room A", capacity: 50, restricted: true },
  { name: "Networking Lunch - Day 1", location: "Grand Ballroom", capacity: 200, restricted: false },
  { name: "Cloud Infrastructure Panel", location: "Conference Room B", capacity: 60, restricted: true },
  { name: "Cybersecurity Masterclass", location: "Workshop Room A", capacity: 40, restricted: true },
  { name: "Future of Work Keynote", location: "Main Hall", capacity: 200, restricted: false },
  { name: "Product Innovation Showcase", location: "Exhibition Hall", capacity: 100, restricted: false },
  { name: "Networking Lunch - Day 2", location: "Grand Ballroom", capacity: 200, restricted: false },
  { name: "Data Engineering Deep Dive", location: "Conference Room B", capacity: 50, restricted: true },
  { name: "Closing Ceremony", location: "Main Hall", capacity: 200, restricted: false },
  { name: "DevOps Best Practices", location: "Workshop Room A", capacity: 50, restricted: true },
  { name: "Startup Pitch Competition", location: "Exhibition Hall", capacity: 100, restricted: false },
  { name: "Blockchain & Web3 Panel", location: "Conference Room B", capacity: 60, restricted: true },
  { name: "Leadership Roundtable", location: "Conference Room B", capacity: 40, restricted: true },
  { name: "Evening Social Mixer", location: "Grand Ballroom", capacity: 200, restricted: false },
];

const OPERATORS = [
  "Admin User", "John Operator", "Sarah Staff", "Mike Security",
  "Lisa Reception", "David Volunteer", "Anna Coordinator",
];

const SCAN_DEVICES = [
  "iPad-01", "iPad-02", "iPad-03", "Scanner-A", "Scanner-B",
  "Kiosk-Main", "Kiosk-Side", "Mobile-01", "Mobile-02",
];

const KIOSK_NAMES = [
  "Main Entrance", "Side Entrance", "VIP Entry", "Registration Desk A",
  "Registration Desk B", "Session Door Left", "Session Door Right",
];

const CHECK_IN_MODES = ["SCAN", "MANUAL", "FACIAL_RECOGNITION"];

// Time slots spread across a 2-day event
const TIME_SLOTS = [
  { hour: 9, minute: 0, durationMin: 60 },
  { hour: 10, minute: 30, durationMin: 90 },
  { hour: 12, minute: 0, durationMin: 60 },
  { hour: 13, minute: 30, durationMin: 90 },
  { hour: 15, minute: 30, durationMin: 90 },
];

// ========================= HELPERS =================================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function padId(prefix: string, index: number, digits = 4): string {
  return `${prefix}${String(index).padStart(digits, "0")}`;
}

function randomPhone(countryCode: string): string {
  const d = () => Math.floor(100 + Math.random() * 900);
  const d4 = () => Math.floor(1000 + Math.random() * 9000);
  return `${countryCode}-${d()}-${d()}-${d4()}`;
}

function slugify(company: string): string {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
}

/** Slugify a category name into a thirdPartyId-safe string. e.g. "General Attendee" → "General_Attendee" */
function slugifyCategory(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function generateEmail(
  firstName: string,
  lastName: string,
  company: string,
  usedEmails: Set<string>,
  index: number,
): string {
  const first = firstName.toLowerCase().replace(/-/g, "");
  const last = lastName.toLowerCase().replace(/-/g, "");
  const domain = slugify(company);
  let email = `${first}.${last}@${domain}.com`;
  if (usedEmails.has(email)) {
    email = `${first}.${last}${index}@${domain}.com`;
  }
  usedEmails.add(email);
  return email;
}

function toISODateTime(dateStr: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function randomTimeBetween(dateStr: string, startHour: number, startMin: number, endHour: number, endMin: number): string {
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const randomMin = startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));
  const h = Math.floor(randomMin / 60);
  const m = randomMin % 60;
  const s = Math.floor(Math.random() * 60);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:${ss}.000Z`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ======================== TYPES ====================================

interface SessionData {
  name: string;
  thirdPartyId: string;
  description: string;
  startsOn: string;
  endsOn: string;
  capacity: number;
  location: string;
  visible: boolean;
  allowScanningOut: boolean;
  allowForcedCheckIn: boolean;
  defaultSessionAccessAmount: number;
  defaultRestrictAccessAmount: number;
  restricted: boolean; // local flag, not sent to API
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
  country: string;
  workPhone: string;
  badgeNum: string;
  categoryThirdPartyId: string;
  fieldValues: Record<string, string>;
  sessionReservations: Record<string, string>[];
  deleteExistingSessionReservations: boolean;
}

// ======================= GENERATORS ================================

function generateSessions(): SessionData[] {
  const count = Math.min(SESSION_COUNT, SESSION_TEMPLATES.length);
  const templates = SESSION_TEMPLATES.slice(0, count);
  const sessions: SessionData[] = [];

  for (let i = 0; i < count; i++) {
    const tpl = templates[i];
    const dayOffset = Math.floor(i / TIME_SLOTS.length);
    const slotIndex = i % TIME_SLOTS.length;
    const slot = TIME_SLOTS[slotIndex];
    const dayStr = addDays(EVENT_START_DATE, dayOffset);

    sessions.push({
      name: tpl.name,
      thirdPartyId: padId("SESSION", i + 1, 2),
      description: `${tpl.name} — part of the 2-day tech conference.`,
      startsOn: toISODateTime(dayStr, slot.hour, slot.minute),
      endsOn: (() => {
        const totalMin = (slot.hour * 60 + slot.minute) + slot.durationMin;
        return toISODateTime(dayStr, Math.floor(totalMin / 60), totalMin % 60);
      })(),
      capacity: tpl.capacity,
      location: tpl.location,
      visible: true,
      allowScanningOut: !tpl.name.toLowerCase().includes("lunch"),
      allowForcedCheckIn: false,
      defaultSessionAccessAmount: 1,
      defaultRestrictAccessAmount: 1,
      restricted: tpl.restricted,
    });
  }

  return sessions;
}

function generateAttendees(sessions: SessionData[]): AttendeeData[] {
  const attendees: AttendeeData[] = [];
  const usedEmails = new Set<string>();

  const openSessions = sessions.filter((s) => !s.restricted);
  const restrictedSessions = sessions.filter((s) => s.restricted);

  for (let i = 1; i <= ATTENDEE_COUNT; i++) {
    const firstName = pickRandom(FIRST_NAMES);
    const lastName = pickRandom(LAST_NAMES);
    const company = pickRandom(COMPANIES);
    const country = pickWeighted(COUNTRIES);
    const category = pickWeighted(CATEGORIES);

    // Registration status: 92% Confirmed, 5% Incomplete, 3% Cancelled
    const statusRoll = Math.random();
    const registrationStatus =
      statusRoll < 0.92 ? "Confirmed" : statusRoll < 0.97 ? "Incomplete" : "Cancelled";

    // Session reservations: open sessions ~80%, restricted ~15%
    const reservations: Record<string, string>[] = [];
    for (const session of openSessions) {
      if (Math.random() < 0.8) {
        reservations.push({
          sessionThirdPartyId: session.thirdPartyId,
          accessAmount: "1",
        });
      }
    }
    for (const session of restrictedSessions) {
      if (Math.random() < 0.15) {
        reservations.push({
          sessionThirdPartyId: session.thirdPartyId,
          accessAmount: "1",
        });
      }
    }

    attendees.push({
      regKey: padId(ID_PREFIX, i),
      thirdPartyId: padId(ID_PREFIX, i),
      firstName,
      lastName,
      emailAddress: generateEmail(firstName, lastName, company, usedEmails, i),
      registrationStatus,
      company,
      jobTitle: pickRandom(JOB_TITLES),
      country: country.name,
      workPhone: randomPhone(country.code),
      badgeNum: padId("BAR", i),
      categoryThirdPartyId: slugifyCategory(category.name),
      fieldValues: {
        LunchOpted: Math.random() < 0.7 ? "TRUE" : "FALSE",
      },
      sessionReservations: reservations,
      deleteExistingSessionReservations: true,
    });
  }

  return attendees;
}

// ======================== API CLIENT ===============================

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

async function upsertSession(
  session: SessionData,
): Promise<{ ok: boolean; internalId?: number }> {
  const { restricted, ...apiPayload } = session;
  const url = `${BASE_URL}/api/v1/integration/events/${EVENT_ID}/eventSessions/upsert?apiKey=${API_KEY}`;
  const result = await fetchWithRetry(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload),
    },
    `Session ${session.thirdPartyId} (${session.name})`,
  );

  if (result.ok && result.body?.id) {
    return { ok: true, internalId: result.body.id };
  }
  return { ok: result.ok };
}

async function upsertAttendeeBatch(
  batch: AttendeeData[],
  batchNum: number,
): Promise<{ ok: boolean; mappings: { email: string; internalId: number }[] }> {
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

  if (result.ok && result.body) {
    const successList = result.body.attendeeResponseModelList;
    const failedList = result.body.failedIntegrationModelList;

    if (batchNum === 1) {
      const errors = result.body.errorMessages;
      console.log(`  [DEBUG] Batch 1 — success: ${Array.isArray(successList) ? successList.length : "N/A"}, failed: ${Array.isArray(failedList) ? failedList.length : "N/A"}`);
      if (Array.isArray(errors) && errors.length > 0) {
        console.log(`  [DEBUG] Error messages: ${JSON.stringify(errors.slice(0, 3))}`);
      }
      if (Array.isArray(successList) && successList.length > 0) {
        const f = successList[0];
        console.log(`  [DEBUG] First success → id: ${f.id}, thirdPartyId: ${JSON.stringify(f.thirdPartyId)}, barcode: ${JSON.stringify(f.barcode)}, email: ${JSON.stringify(f.email)}`);
      }
    }

    // Map by email since API returns thirdPartyId as null
    if (Array.isArray(successList)) {
      for (const a of successList) {
        if (a.id != null && a.email) {
          mappings.push({ email: a.email, internalId: a.id });
        }
      }
    }
  }

  return { ok: result.ok, mappings };
}

let checkinDebugLogged = false;

async function checkInAttendee(
  internalAttendeeId: number,
  checkInDate: string,
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/attendees/${internalAttendeeId}/checkIn?checkInDate=${encodeURIComponent(checkInDate)}&apiKey=${API_KEY}`;
  if (!checkinDebugLogged) {
    console.log(`  [DEBUG] First check-in URL: ${url}`);
    checkinDebugLogged = true;
  }
  const scanData = {
    kioskId: pickRandom(SCAN_DEVICES),
    kioskName: pickRandom(KIOSK_NAMES),
    operator: pickRandom(OPERATORS),
    location: pickRandom(KIOSK_NAMES),
    checkinMode: pickRandom(CHECK_IN_MODES),
  };
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

async function checkInAttendeeSession(
  internalAttendeeId: number,
  internalSessionId: number,
  checkInDate: string,
  sessionLocation: string,
): Promise<boolean> {
  const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/sessions/${internalSessionId}/attendants/${internalAttendeeId}/checkin?checkInDate=${encodeURIComponent(checkInDate)}&apiKey=${API_KEY}`;
  const scanData = {
    operator: pickRandom(OPERATORS),
    location: sessionLocation,
    device: pickRandom(SCAN_DEVICES),
    checkInMode: pickRandom(CHECK_IN_MODES),
    kioskId: `KIOSK-${Math.floor(Math.random() * 10) + 1}`,
    kioskName: pickRandom(KIOSK_NAMES),
  };
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

// ===================== CONCURRENCY LIMITER =========================

async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = (async () => {
      const result = await task();
      results.push(result);
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
  console.log("=== Fielddrive Dummy Data Seeder ===\n");
  console.log(`  Base URL:       ${BASE_URL}`);
  console.log(`  Event ID:       ${EVENT_ID}`);
  console.log(`  Attendees:      ${ATTENDEE_COUNT}`);
  console.log(`  Sessions:       ${SESSION_COUNT}`);
  console.log(`  Event Date:     ${EVENT_START_DATE} (2 days)`);
  console.log(`  ID Prefix:      ${ID_PREFIX}`);
  console.log(`  Check-in %:     ${(CHECKIN_PERCENT * 100).toFixed(0)}% event, ${(SESSION_CHECKIN_PERCENT * 100).toFixed(0)}% session`);
  console.log(`  Dry Run:        ${DRY_RUN}\n`);

  // --- Generate data ---
  const sessions = generateSessions();
  const attendees = generateAttendees(sessions);

  const confirmedAttendees = attendees.filter((a) => a.registrationStatus === "Confirmed");
  const totalReservations = attendees.reduce((sum, a) => sum + a.sessionReservations.length, 0);

  console.log(`Generated:`);
  console.log(`  ${sessions.length} sessions`);
  console.log(`  ${attendees.length} attendees (${confirmedAttendees.length} confirmed)`);
  console.log(`  ${totalReservations} session reservations`);
  console.log(`  Categories: ${CATEGORIES.map((c) => c.name).join(", ")}`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: Sample data ---\n");
    console.log("Sessions:");
    for (const s of sessions) {
      console.log(`  ${s.thirdPartyId} | ${s.name} | ${s.startsOn} → ${s.endsOn} | cap: ${s.capacity} | ${s.restricted ? "Restricted" : "Open"}`);
    }
    console.log("\nFirst 5 Attendees:");
    for (const a of attendees.slice(0, 5)) {
      console.log(`  ${a.thirdPartyId} | ${a.firstName} ${a.lastName} | ${a.emailAddress} | ${a.company} | ${a.country} | ${a.registrationStatus} | ${a.categoryThirdPartyId} | reservations: ${a.sessionReservations.length}`);
    }
    console.log("\n--- DRY RUN complete. Set DRY_RUN = false to call API. ---");
    return;
  }

  const startTime = Date.now();
  let sessionSuccessCount = 0;
  let attendeeSuccessCount = 0;
  let eventCheckinCount = 0;
  let sessionCheckinCount = 0;

  // Maps for internal IDs
  const sessionIdMap = new Map<string, number>(); // sessionThirdPartyId → internalId
  const attendeeIdMap = new Map<string, number>(); // email → internalId
  // Reverse lookup: email → our generated AttendeeData
  const emailToAttendee = new Map<string, AttendeeData>();
  for (const a of attendees) {
    emailToAttendee.set(a.emailAddress, a);
  }

  // --- Phase 0: Upsert Categories ---
  console.log("\n--- Phase 0: Upserting attendee categories ---");
  let categorySuccess = 0;
  for (const cat of CATEGORIES) {
    const tpid = slugifyCategory(cat.name);
    const ok = await upsertAttendeeCategory(tpid, cat.name);
    if (ok) {
      categorySuccess++;
      console.log(`  [OK] ${tpid} → ${cat.name}`);
    }
  }
  console.log(`  Categories: ${categorySuccess}/${CATEGORIES.length} succeeded`);

  // --- Phase 1: Upsert Sessions ---
  console.log("\n--- Phase 1: Upserting sessions ---");
  for (const session of sessions) {
    const result = await upsertSession(session);
    if (result.ok) {
      sessionSuccessCount++;
      if (result.internalId) {
        sessionIdMap.set(session.thirdPartyId, result.internalId);
      }
      console.log(`  [OK] ${session.thirdPartyId} → ${session.name}${result.internalId ? ` (id: ${result.internalId})` : ""}`);
    }
  }
  console.log(`  Sessions: ${sessionSuccessCount}/${sessions.length} succeeded\n`);

  // --- Phase 2: Upsert Attendees (batched) ---
  console.log("--- Phase 2: Upserting attendees ---");
  for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
    const batch = attendees.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const result = await upsertAttendeeBatch(batch, batchNum);
    if (result.ok) {
      attendeeSuccessCount += result.mappings.length;
      for (const m of result.mappings) {
        attendeeIdMap.set(m.email, m.internalId);
      }
    }
    console.log(`  Batch ${batchNum}: ${i + 1}-${Math.min(i + BATCH_SIZE, attendees.length)} of ${attendees.length} ${result.ok ? "[OK]" : "[FAIL]"} (mapped ${result.mappings.length} IDs)`);
  }
  console.log(`  Attendees: ${attendeeSuccessCount}/${attendees.length} succeeded\n`);

  // --- Phase 3: Event Check-ins ---
  console.log("--- Phase 3: Event check-ins ---");
  const attendeesToCheckIn = confirmedAttendees.filter(
    (a) => Math.random() < CHECKIN_PERCENT && attendeeIdMap.has(a.emailAddress),
  );
  console.log(`  Checking in ${attendeesToCheckIn.length} attendees...`);

  const eventCheckinTasks = attendeesToCheckIn.map((a) => {
    const internalId = attendeeIdMap.get(a.emailAddress)!;
    // Random arrival between 08:00-09:30 on day 1
    const checkInDate = randomTimeBetween(EVENT_START_DATE, 8, 0, 9, 30);
    return async () => {
      const ok = await checkInAttendee(internalId, checkInDate);
      if (ok) eventCheckinCount++;
      return ok;
    };
  });

  await withConcurrency(eventCheckinTasks, 5);
  console.log(`  Event check-ins: ${eventCheckinCount}/${attendeesToCheckIn.length} succeeded\n`);

  // --- Phase 4: Session Check-ins ---
  console.log("--- Phase 4: Session check-ins ---");
  const checkedInEmails = new Set(attendeesToCheckIn.map((a) => a.emailAddress));

  const sessionCheckinTasks: (() => Promise<boolean>)[] = [];

  for (const attendee of attendees) {
    if (!checkedInEmails.has(attendee.emailAddress)) continue;
    const attendeeInternalId = attendeeIdMap.get(attendee.emailAddress);
    if (!attendeeInternalId) continue;

    for (const reservation of attendee.sessionReservations) {
      if (Math.random() >= SESSION_CHECKIN_PERCENT) continue;

      const sessionThirdPartyId = reservation.sessionThirdPartyId;
      const sessionInternalId = sessionIdMap.get(sessionThirdPartyId);
      if (!sessionInternalId) continue;

      const session = sessions.find((s) => s.thirdPartyId === sessionThirdPartyId);
      if (!session) continue;

      // Check-in time: within 5 minutes of session start
      const [datePart, timePart] = session.startsOn.split("T");
      const [hStr, mStr] = timePart.split(":");
      const totalMin = parseInt(hStr) * 60 + parseInt(mStr) + Math.floor(Math.random() * 5);
      const chkH = String(Math.floor(totalMin / 60)).padStart(2, "0");
      const chkM = String(totalMin % 60).padStart(2, "0");
      const chkS = String(Math.floor(Math.random() * 60)).padStart(2, "0");
      const checkInDate = `${datePart}T${chkH}:${chkM}:${chkS}.000Z`;

      sessionCheckinTasks.push(async () => {
        const ok = await checkInAttendeeSession(attendeeInternalId, sessionInternalId, checkInDate, session.location);
        if (ok) sessionCheckinCount++;
        return ok;
      });
    }
  }

  console.log(`  Processing ${sessionCheckinTasks.length} session check-ins...`);
  await withConcurrency(sessionCheckinTasks, 5);
  console.log(`  Session check-ins: ${sessionCheckinCount}/${sessionCheckinTasks.length} succeeded\n`);

  // --- Report ---
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("=== FINAL REPORT ===");
  console.log(`  Sessions upserted:       ${sessionSuccessCount}/${sessions.length}`);
  console.log(`  Attendees upserted:      ${attendeeSuccessCount}/${attendees.length}`);
  console.log(`  Event check-ins:         ${eventCheckinCount}/${attendeesToCheckIn.length}`);
  console.log(`  Session check-ins:       ${sessionCheckinCount}/${sessionCheckinTasks.length}`);
  console.log(`  Time elapsed:            ${elapsed}s`);
  console.log("====================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
