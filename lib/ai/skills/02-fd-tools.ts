const content = `## Available Tools

Tools are pre-scoped to your event. You do not need to pass \`account_id\` or \`event_id\`.

### Account & Context
| Tool | When to use |
|---|---|
| \`get_current_account\` | When the user asks "which account am I on?" |
| \`get_current_event\` | "What event is this?" / "What are the event details?" |

### Attendees
| Tool | When to use |
|---|---|
| \`list_attendees\` | Browse all attendees — returns \`registrationStatus\` + \`checkinAt\`, check both for check-in status |
| \`search_attendees\` | Find an attendee by name, email, or barcode |
| \`get_attendee_full_profile\` | Attendee core fields + all custom field values in one call — prefer this over chaining separate calls |
| \`get_attendee_check_history\` | Full audit log of check-in/out actions for one attendee |
| \`list_attendees_with_custom_fields\` | Full attendee list with all custom fields — use when you need all attendees with their custom data |

### Attendee Categories
| Tool | When to use |
|---|---|
| \`list_attendee_categories\` | "What attendee categories exist for this event?" |

### Custom Fields
| Tool | When to use |
|---|---|
| \`list_attendee_fields\` | Discover available custom fields and their exact labels — always call this first before filtering by a custom field |

### Stats & Aggregation (prefer these for counts and analytics — single round trip)
| Tool | When to use |
|---|---|
| \`get_checked_in_attendees\` | "How many have checked in?" / "Show checked-in attendees" — note: only reflects \`checkinAt IS NOT NULL\` |
| \`list_not_checked_in_attendees\` | "Who hasn't checked in?" — direct query, always prefer over paginating \`list_attendees\` and filtering |
| \`check_attendee_status\` | "Has [name/email/barcode] checked in?" — fast single lookup, returns \`has_checked_in\` bool |
| \`get_attendees_by_custom_field\` | Filter attendees by a custom field value — use exact label from \`list_attendee_fields\` first |
| \`get_custom_field_distribution\` | "How many attendees from each country?" — grouped count of a custom field across all attendees |
| \`get_category_breakdown\` | Attendee count broken down by category |
| \`get_registration_status_breakdown\` | Attendee count broken down by registration status |
| \`get_session_attendance_stats\` | Session fill rates and attendance across the event |
| \`get_checkin_timeline\` | Check-in trend over time — \`slot_mins=60\` for hourly buckets, \`slot_mins=15\` for 15-minute granularity |

### Sessions
| Tool | When to use |
|---|---|
| \`list_event_sessions\` | "What sessions does this event have?" |
| \`get_session_attendees\` | All attendees for a specific session |
| \`get_session_scans\` | Scan history for a specific session reservation |`;

export default content;
