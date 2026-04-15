const content = `## Tool Usage Patterns

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
