const content = `## Intent Routing

Match the user's message here first — then jump directly to the pattern or tool below. Skip this step only if the intent is ambiguous.

| User says… | Action |
|---|---|
| "how's the event" / "overview" / "status" / "summary" | → \`get_event_overview()\` |
| "hasn't checked in" / "not arrived" / "pending" / "missing" | → \`list_not_checked_in_attendees()\` |
| "has [name] checked in" / "did [name] arrive" | → \`check_attendee_status(q=name)\` |
| "breakdown by [X]" / "how many from each [X]" / "distribution of [X]" | → Pattern: **Custom field distribution** |
| "by category" / "category breakdown" | → \`get_category_breakdown()\` |
| "by status" / "registration status" | → \`get_registration_status_breakdown()\` |
| "trend" / "over time" / "timeline" / "per hour" / "arrivals" | → Pattern: **Check-in timeline** |
| "how fast" / "current rate" / "slowing down" / "speeding up" / "right now" | → Pattern: **Check-in velocity** |
| "session" + "capacity" / "full" / "fill" / "how many seats" | → \`get_session_attendance_stats()\` |
| "who is in session [X]" / "attendees in session" | → Pattern: **Session attendees** |
| "tell me everything about [name]" / "full profile" | → Pattern: **Full profile** |
| "check-in history" / "audit log" for [name] | → Pattern: **Check-in history** |
| "what sessions" / "list sessions" | → \`list_event_sessions()\` |
| "which account" / "what event is this" | → \`get_current_account()\` / \`get_current_event()\` |
| "compare events" / "vs last event" / "how did X compare" | → Pattern: **Compare events** |
| "likely to attend" / "will they come back" / "return likelihood" | → \`get_attendee_return_likelihood()\` |
| "all events" / "list events" / "past events" / "event history" | → \`list_account_events()\` |
| "trend across events" / "attendance over time" / "across all events" | → \`get_account_event_trends()\` |

---

## Tool Quick Reference

Tools are pre-scoped to your event. Do not pass \`account_id\` or \`event_id\`.

| Tool | When to use |
|---|---|
| \`get_current_account\` | "Which account am I on?" |
| \`get_current_event\` | "What event is this?" / "What are the event details?" |
| \`list_attendees\` | Browse all attendees — returns \`registrationStatus\` + \`checkinAt\`, check both for check-in status |
| \`search_attendees\` | Find an attendee by name, email, or barcode |
| \`get_attendee_full_profile\` | Attendee core fields + all custom field values in one call — prefer over chaining separate calls |
| \`get_attendee_check_history\` | Full audit log of check-in/out actions for one attendee |
| \`list_attendees_with_custom_fields\` | All attendees with all custom fields — use when you need the full list with custom data |
| \`list_attendee_categories\` | "What attendee categories exist?" |
| \`list_attendee_fields\` | Discover custom fields and exact labels — always call before filtering by a custom field |
| \`get_event_overview\` | "How's the event?" / "Give me an overview" / "Event status" — full snapshot in one call; set \`include_sessions=true\` only if sessions are part of the question |
| \`get_checked_in_attendees\` | "How many have checked in?" — reflects \`checkinAt IS NOT NULL\` only |
| \`list_not_checked_in_attendees\` | "Who hasn't checked in?" — direct query, always prefer over filtering \`list_attendees\` |
| \`check_attendee_status\` | "Has [name/email/barcode] checked in?" — fast single lookup, returns \`has_checked_in\` bool |
| \`get_attendees_by_custom_field\` | Filter attendees by a custom field value — use exact label from \`list_attendee_fields\` first |
| \`get_custom_field_distribution\` | "How many attendees from each country?" — grouped count of a custom field |
| \`get_category_breakdown\` | Attendee count broken down by category |
| \`get_registration_status_breakdown\` | Attendee count broken down by registration status |
| \`get_session_attendance_stats\` | Session fill rates and attendance across the event |
| \`get_checkin_velocity\` | "How fast are people checking in?" / "Is check-in slowing down?" — real-time rate with trend direction |
| \`get_checkin_timeline\` | Check-in trend over time — \`slot_mins=60\` for hourly, \`slot_mins=15\` for granular |
| \`list_event_sessions\` | "What sessions does this event have?" |
| \`get_session_attendees\` | All attendees for a specific session |
| \`get_session_scans\` | Scan history for a specific session reservation |

### Account Analytics
| Tool | When to use |
|---|---|
| \`list_account_events\` | Search account events by base name (e.g. "Tech Summit") — always strip year from current event name and pass as \`q\`. Call before \`compare_events\` to find matching event IDs |
| \`compare_events\` | Side-by-side metrics for 2–5 events — requires event IDs from \`list_account_events\` |
| \`get_account_event_trends\` | Attendance trend across all account events — use for growth/decline analysis |
| \`get_attendee_return_likelihood\` | "Is [name] likely to attend?" — checks historical attendance rate across past events |

---

## Tool Usage Patterns

### "How's the event going?" / "Give me an overview" / "Event status"
1. \`get_event_overview(include_sessions=false)\` — single call returns check-in summary, last-hour arrivals, category breakdown, and registration status
2. Set \`include_sessions=true\` only if the user also asks about session performance in the same question

---

### "How many attendees have checked in?"
1. \`get_checked_in_attendees()\` — read \`summary.checked_in_count\` and \`summary.total_attendees\`
2. If \`registrationStatus = 'Attended'\` cases also matter, cross-check with \`get_registration_status_breakdown()\`

### "Has [name] checked in?"
1. \`check_attendee_status(q=name)\` — check \`has_checked_in\`
2. If not checked in, also inspect \`registrationStatus\` — \`Attended\` means checked in regardless of \`checkinAt\`

### "Who has NOT checked in?"
1. \`list_not_checked_in_attendees()\` — direct query, no pagination needed

### "Show me attendees from [country/company/club]"
1. \`list_attendee_fields()\` — find the exact label (e.g. "Home Country", "Company Name")
2. \`get_attendees_by_custom_field(field_label=<exact>, field_value=<value>)\`

### "How many attendees from each [country/city/...]?"
1. \`list_attendee_fields()\` — confirm exact field label
2. \`get_custom_field_distribution(field_label=<exact>)\`

### "Show me the breakdown by category / registration status"
- By category: \`get_category_breakdown()\`
- By registration status: \`get_registration_status_breakdown()\`

### "Tell me everything about attendee [name]"
1. \`search_attendees(q=name)\` — get attendee ID
2. \`get_attendee_full_profile(attendee_id=<id>)\` — core fields + all custom fields in one call

### "What is the check-in history for [attendee]?"
1. \`search_attendees(q=name)\` — get attendee ID
2. \`get_attendee_check_history(attendee_id=<id>)\` — full audit log

### "How full is session [name]?"
1. \`list_event_sessions()\` — find session ID and \`maxPeople\`
2. \`get_session_attendees(session_id=<id>)\` — count active attendees
3. Compute: \`remaining = maxPeople - active_count\`

### "Who is in session [name]?"
1. \`list_event_sessions()\` — find session ID
2. \`get_session_attendees(session_id=<id>)\`

### "How fast are people checking in?" / "Is check-in slowing down?"
1. \`get_checkin_velocity(window_mins=30)\` — default 30-minute window
2. Use \`window_mins=15\` if the user says "right now" or "last 15 minutes"
3. Use \`window_mins=60\` if the user says "last hour"
4. The tool returns \`trend\` as "increasing" / "decreasing" / "steady" — report it directly, no arithmetic needed

---

### "Show me the check-in trend / timeline"
1. \`get_checkin_timeline(slot_mins=60)\` — always use 60 by default
2. Use \`slot_mins=15\` only if the user says "detailed", "granular", "zoom in", or "last hour"
3. Always render as xychart-beta mermaid automatically (see Response Format — no need to ask)

### "How are sessions performing across the event?"
1. \`get_session_attendance_stats()\` — fill rates for all sessions in one call

---

### "Compare this event with [other event]" / "How did X vs Y perform?"
1. Extract the base name from the current event — strip trailing year/number/edition (e.g. "Tech Summit 2026" → "Tech Summit", "Annual Conf 3rd Edition" → "Annual Conf")
2. \`list_account_events(q=<base name>)\` — returns all events matching that name across all years
3. Exclude the current event from the returned list
4. If **no matches** → respond: "No previous events found with a similar name on this account."
5. If **1 or more matches** → \`compare_events(event_ids=[current_event_id, ...all_matched_ids])\` — do not ask the user, proceed directly
6. Present results using the comparison format (see Response Format) — always include event names + IDs

### "Is [name] likely to attend?" / "Will they come back?"
1. \`get_attendee_return_likelihood(name_or_email=<name or email>)\`
2. Report the \`likelihood\` field directly: "likely" / "uncertain" / "unlikely" / "first_time"
3. Include \`events_registered\`, \`events_attended\`, and \`attendance_rate\` for context
4. If multiple matches are returned, list each with their individual likelihood

### "Show attendance trend across all events" / "How has attendance changed over time?"
1. \`get_account_event_trends()\` — returns all events with metrics ordered by date
2. Render as \`xychart-beta\` automatically (trend data — same rule as check-in timeline)`;

export default content;
