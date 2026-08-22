# Prompt 9: Admin Account TXT Export (Retailer-Filtered)

## Context
All prior prompts are complete. Implement this as a fresh feature.

## Objective
Add a new **Admin-only** export capability in the dashboard that lets admins download account data across all users, with optional filtering by retailer, as a `.txt` file.

## Core Requirement
On the admin page, allow export of ACO account credentials in this exact line format:

`retail login email:::retail login password:::email:::IMAP password:::IMAP provider`

One account per line.

### Example output lines
```
Test@gmail.com:::Test:::Buttmuncher@gmail.com:::ffff kkkk pppp oooo:::gmail
Working@gmail.com:::password123:::Deddy@icloud.com:::tttt-pppp-wwww-xxxx:::icloud
```

## Functional Requirements

### 1) Admin-only backend export endpoint
Create or extend an admin API endpoint dedicated to this export mode.

- Must require authenticated session.
- Must verify caller is admin using existing admin authorization pattern (`ADMIN_DISCORD_IDS` behavior already used in project).
- Must reject non-admin users with `403`.

### 2) Retailer filtering
Support export for:
- all retailers
- one retailer
- multiple retailers

Recommended query options:
- `retailer=<string>` for single filter
- OR `retailers=<comma-separated>` for multi-filter

Filtering behavior:
- Case-insensitive match against ACO account retailer field.
- If no filter provided, include all retailers.

### 3) Data source and field mapping
For each exported row, source values from each ACO account:

1. `retail login email` -> account `loginEmail`
2. `retail login password` -> decrypted retail login password
3. `email` -> account IMAP email (`email`)
4. `IMAP password` -> decrypted IMAP password
5. `IMAP provider` -> normalized provider value (lowercase)
   - Prefer `emailProvider` if present
   - Fallback to provider derived from IMAP host/email if needed

### 4) Decryption requirement
Passwords are stored encrypted. The export must output plaintext values by decrypting with existing crypto utilities already used in the project.

- Do not change encryption format.
- Reuse existing decrypt helpers; do not duplicate encryption logic.

### 5) TXT response contract
Return a downloadable `.txt` file.

HTTP response requirements:
- `Content-Type: text/plain; charset=utf-8`
- `Content-Disposition: attachment; filename=admin-account-export.txt`

File content requirements:
- Exactly one account per line
- Each line uses `:::` as delimiter
- No extra quotes, commas, or JSON wrappers
- Unix newlines (`\n`)
- Skip rows with missing required fields OR include empty tokens consistently (pick one behavior and document it in code comments)

## Frontend Requirements (Admin Page)
Add UI controls on admin page for this specific export type:

1. Retailer filter UI
- Dropdown (preferred) populated from distinct retailers in DB or from existing admin dataset
- Allow all retailers option
- Optional multi-select support

2. Export action
- Button label example: `Export Accounts (.txt)`
- Calls new admin endpoint with selected filters
- Triggers browser download of `.txt` file

3. Error handling
- Show clear error toast/banner if export fails (`401`, `403`, `500`)
- Keep UX consistent with current admin dashboard styles

## Security & Operational Requirements
- Admin-only access is mandatory.
- Do not log decrypted passwords.
- Do not persist plaintext passwords to DB.
- Do not expose this endpoint in non-admin nav or public pages.

## Suggested API Shape
`GET /api/admin/export/accounts-txt`

Optional query params:
- `retailer=<retailerName>`
- `retailers=<nike,adidas,shopify>`

## Implementation Notes
- Reuse existing admin auth utility and dashboard fetch patterns.
- Reuse existing crypto utility for password decryption.
- Keep formatting deterministic and stable.
- Keep this feature isolated from CSV/JSON export behavior.

## Acceptance Criteria

1. Admin user can download `.txt` containing all accounts when no filter is selected.
2. Admin user can filter by retailer and download only matching accounts.
3. Each exported line exactly follows:
   `retail login email:::retail login password:::email:::IMAP password:::IMAP provider`
4. Password fields are decrypted correctly.
5. Non-admin users get `403`.
6. Response downloads as `.txt` with correct headers.
7. Frontend admin page includes retailer filter + export button.

## QA Checklist

- Verify all-retailer export line count equals DB account count (after skip rules).
- Verify single retailer filter only includes that retailer.
- Verify multi-retailer filter includes union of selected retailers.
- Verify delimiter and field order are exact.
- Verify no secrets are logged server-side.
- Verify export still works when some accounts have null `emailProvider`.
