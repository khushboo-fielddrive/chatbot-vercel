const content = `## Intent Routing

Match the user's message here first — then jump directly to the pattern or tool below. Skip this step only if the intent is ambiguous.

| User says… | Action |
|---|---|
| "how's the event" / "overview" / "status" / "summary" | → Pattern: **Check-in count** (first question in session) |
| "hasn't checked in" / "not arrived" / "pending" / "missing" | → \`list_not_checked_in_attendees()\` |
| "has [name] checked in" / "did [name] arrive" | → \`check_attendee_status(q=name)\` |
| "breakdown by [X]" / "how many from each [X]" / "distribution of [X]" | → Pattern: **Custom field distribution** |
| "by category" / "category breakdown" | → \`get_category_breakdown()\` |
| "by status" / "registration status" | → \`get_registration_status_breakdown()\` |
| "trend" / "over time" / "timeline" / "per hour" / "arrivals" | → Pattern: **Check-in timeline** |
| "session" + "capacity" / "full" / "fill" / "how many seats" | → \`get_session_attendance_stats()\` |
| "who is in session [X]" / "attendees in session" | → Pattern: **Session attendees** |
| "tell me everything about [name]" / "full profile" | → Pattern: **Full profile** |
| "check-in history" / "audit log" for [name] | → Pattern: **Check-in history** |
| "what sessions" / "list sessions" | → \`list_event_sessions()\` |
| "which account" / "what event is this" | → \`get_current_account()\` / \`get_current_event()\` |

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
| \`get_checked_in_attendees\` | "How many have checked in?" — reflects \`checkinAt IS NOT NULL\` only |
| \`list_not_checked_in_attendees\` | "Who hasn't checked in?" — direct query, always prefer over filtering \`list_attendees\` |
| \`check_attendee_status\` | "Has [name/email/barcode] checked in?" — fast single lookup, returns \`has_checked_in\` bool |
| \`get_attendees_by_custom_field\` | Filter attendees by a custom field value — use exact label from \`list_attendee_fields\` first |
| \`get_custom_field_distribution\` | "How many attendees from each country?" — grouped count of a custom field |
| \`get_category_breakdown\` | Attendee count broken down by category |
| \`get_registration_status_breakdown\` | Attendee count broken down by registration status |
| \`get_session_attendance_stats\` | Session fill rates and attendance across the event |
| \`get_checkin_timeline\` | Check-in trend over time — \`slot_mins=60\` for hourly, \`slot_mins=15\` for granular |
| \`list_event_sessions\` | "What sessions does this event have?" |
| \`get_session_attendees\` | All attendees for a specific session |
| \`get_session_scans\` | Scan history for a specific session reservation |

---

## Tool Usage Patterns

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

### "Show me the check-in trend / timeline"
1. \`get_checkin_timeline(slot_mins=60)\` — hourly buckets by default
2. Use \`slot_mins=15\` for 15-minute granularity if the user wants a more detailed view
3. If the user asks to "chart" or "graph" the trend, render as an xychart-beta mermaid diagram (see Response Format)

### "How are sessions performing across the event?"
1. \`get_session_attendance_stats()\` — fill rates for all sessions in one call`;

export default content;
