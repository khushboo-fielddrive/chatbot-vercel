const content = `## Universal Decision Algorithm — FIND → FETCH → FORMAT

For ANY event question, work through these 4 checks in order before choosing a tool or composing an answer.

---

### Check 1 — Entity type (FIND what is being asked about)

| The question is about… | Starting point |
|---|---|
| A single person | \`search_attendees\` → \`get_attendee_full_profile\` |
| A category group (VIPs, Speakers, Board Members) | \`get_checkin_status_list(filter=…, category=X)\` |
| People filtered by custom field (from UAE, from Acme) | \`get_attendees_by_custom_field\` |
| A category count or breakdown | \`get_category_breakdown\` |
| The whole event | \`get_event_overview\` |
| A session | \`list_event_sessions\` → \`get_session_attendees\` or \`get_session_attendance_stats\` |
| Account history / past events | \`list_account_events\` → \`compare_events\` or \`get_account_event_trends\` |
| A comprehensive real-time snapshot | \`get_midday_digest\` (one call covers everything) |

---

### Check 2 — Metric type (FIND what is being measured)

| Measuring… | Tool |
|---|---|
| Whether one person checked in | \`check_attendee_status\` |
| Who checked in / who hasn't (all or by category) | \`get_checkin_status_list(filter=…, category=X)\` |
| Count or breakdown by category | \`get_category_breakdown\` |
| Count or breakdown by custom field | \`get_custom_field_distribution\` |
| Trend over time (check-ins by hour) | \`get_checkin_timeline\` |
| Speed right now (rate + trend direction) | \`get_checkin_velocity\` |
| Session capacity / fill rate | \`get_session_attendance_stats\` |
| Return/attendance prediction | \`predict_category_arrivals\` / \`get_arrival_forecast_summary\` |
| Historical attendance likelihood for a person | \`get_attendee_return_likelihood\` |
| Registration / ticket type breakdown | \`get_registration_status_breakdown\` |
| Operator / kiosk activity | \`get_midday_digest\` (includes operator breakdown) |

---

### Check 3 — Data shape (FORMAT per result type)

| Result looks like… | Format rule |
|---|---|
| One number or fact | 1–2 sentence prose — no chart, no table |
| A breakdown (2+ values) | Table + chart (auto-render, no need to ask) |
| A list of people | State total first → cap at 20 → offer to filter |
| A timeline / trend | xychart-beta line chart + 1 sentence caption |
| A comprehensive snapshot | Full Digest format (hero line first, chart mandatory) |
| A single person's profile or journey | Required 3-section structure (Profile / Event check-in / Sessions) |

---

### Check 4 — Guard rails (FETCH safely)

- **List will exceed 100 rows?** → use a stats/aggregate tool instead of a list tool
- **Category query (VIPs, Board)?** → add \`category\` param to \`get_checkin_status_list\` — these lists are typically small and return names directly
- **Empty result?** → 1 sentence statement + one follow-up suggestion, never an error message
- **Ambiguous field name?** → call \`list_attendee_fields\` first — never guess
- **Ambiguous category name?** → call \`list_attendee_categories\` first — never ask the user
- **Two independent data needs?** → call both tools in parallel, not sequentially
- **Follow-up on same data?** → reuse already-fetched data, do NOT re-fetch

---

### Gap coverage — questions handled by the decision algorithm

| Question type | How it resolves |
|---|---|
| "VIPs not arrived yet" | \`get_checkin_status_list(filter='not_checked_in', category='VIP')\` |
| "Which Board Members haven't checked in?" | \`get_checkin_status_list(filter='not_checked_in', category='Board Member')\` |
| "VIPs from UAE who haven't checked in" | \`get_checkin_status_list(filter='not_checked_in', category='VIP')\` → cross-check country from returned names |
| "How many ticket types / registration statuses?" | \`get_registration_status_breakdown()\` |
| "Which operator checked in the most?" | \`get_midday_digest()\` — includes operator breakdown |
| "Attendance trends across all our events" | \`get_account_event_trends()\` |
| "Who is unlikely to come back?" | \`get_attendee_return_likelihood()\` |
| "Which sessions are back-to-back?" | \`list_event_sessions()\` → compare times → gantt chart |
| "Will Cognizant show up?" | \`predict_company_arrivals(company='Cognizant')\` |
| "Draft a Slack / email / WhatsApp update" | Use existing data in context → apply draft format from skill 04 |

---

### When none of the above fits

If a question does not match any entity type or metric type in the checks above:

1. Ask: "Is this about an attendee, a session, a category, check-in activity, or event history?"
2. Map the answer to Check 1 and proceed.
3. If still unclear, ask one specific clarifying question — never guess.
`;

export default content;
