# ChudACO Monorepo

Discord-gated dashboard and worker services for retail auto-checkout.

## Project Structure

- apps/web: Next.js 14 dashboard (App Router, TypeScript, Tailwind)
- apps/worker: Node.js TypeScript worker (Discord bot + IMAP polling)
- packages/db: Shared Prisma schema and Prisma client wrapper

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

## Setup

1. Install dependencies:

   pnpm install

2. Start Postgres:

   docker compose up -d

3. Copy environment file:

   cp .env.example .env

4. Generate IMAP encryption key (32-byte base64):

   pnpm --filter worker exec tsx ../../scripts/generate-key.ts

   Set the generated value as IMAP_ENCRYPTION_KEY in .env.

5. Keep IMAP_ENCRYPTION_KEY out of git and back it up securely.

   If this key is lost, stored IMAP credentials cannot be decrypted and must be re-entered.

6. Run migrations (command will be added in a later update).

## Development

- Start web app:

  pnpm --filter web dev

- Start worker:

  pnpm --filter worker dev

## Account Profile Capacity

Accounts are not limited per user. The platform allows up to 250 Pokémon Center
profiles in total, with 50 reserved for profiles managed outside the website.
Set `MAX_POKEMON_CENTER_PROFILES` and `EXTERNAL_POKEMON_CENTER_PROFILES` to
change those defaults; the website-managed limit is the total minus the reserve.

## Discord Membership Cleanup

The worker checks Discord access every 30 minutes by default. When a member is
confirmed to have left the guild or lost the required role, access is revoked
immediately and cleanup is scheduled after a 7-day grace period. Restoring the
required role during that period cancels cleanup. Configure
`MEMBER_CLEANUP_INTERVAL_MINUTES` and `MEMBER_CLEANUP_GRACE_DAYS` to change the
defaults. Discord API errors and rate limits do not trigger revocation. Cleanup
removes account/profile/IMAP/card data and matching Google Sheets rows, including
vaulted card data, while retaining the user tombstone and checkout/billing history.

## Shikari Exports

The Admin page provides two Shikari downloads using the selected account and
retailer filters. With no retailer selected, Shikari defaults to Target.

- `shikari-accounts.txt`: one `username:password` retailer login per line.
- `shikari-imap.csv`: header `imap_server,port,username,password` followed by data rows, with
   standard CSV quoting. The username is the IMAP mailbox email, not the retailer login.

Only enabled retailer logins are included, with legacy account logins used when
no per-retailer logins exist. Incomplete credentials are omitted. Identical rows
are deduplicated, including shared IMAP mailboxes. Downloads contain plaintext
passwords and must be handled securely.

Run the focused export tests with `node --test apps/web/src/lib/shikari-export.test.cjs`.

## Account Pulls

Explicit retailer account, profile, and IMAP downloads from the Admin page record
which accounts were actually included. Skipped rows, failed exports, empty files,
the general CSV/JSON report, and loading the Admin page do not count as pulls.
A pull means the server generated an export, not that the browser saved the file
or that the accounts were run. Existing exports are not backfilled.

The Accounts page displays retailer-specific last-pull times and paginated history,
refreshing every 30 seconds and on focus. Users can independently disable account
pull DMs there. History does not contain credentials or payment details.

Tracked exports use authenticated admin POST requests with an `X-Export-Action`
UUID. Retries must reuse that UUID and the same filters. Automatic companion
downloads also share `X-Export-Parts: 2`. GET exports remain read-only and uncached.

The existing ChudACO worker sends one summary DM per user per export action using
`DISCORD_BOT_TOKEN` and the Accounts link from `AUTH_URL` or `NEXTAUTH_URL`. It polls
every 15 seconds, waits for companion files (up to two minutes), and retries
temporary failures up to five attempts. Blocked DMs are marked failed; opting out
or losing Discord access skips delivery without affecting exports or history.
Delivery is at-least-once: a crash after Discord accepts a DM but before the job is
marked sent can cause a duplicate on recovery. No live test DMs are sent by tests.

Before deploying updated web and worker builds, run
`pnpm --filter @chudaco/db exec dotenv -e ../../.env -- prisma migrate deploy`,
then rebuild the shared database package and both services. The migration adds
pull history, export actions, the notification queue, and the default-on
`notifyOnAccountPull` preference.

Focused checks:
`pnpm --filter web exec node --test src/lib/account-pulls.test.cjs src/lib/shikari-export.test.cjs src/lib/modular-workspace.test.cjs`
and `pnpm --filter worker test`.

## Premium Detection

Set `PREMIUM_ROLE_ID` to the premium role in `DISCORD_GUILD_ID`. The web app reuses
`DISCORD_BOT_TOKEN`; the bot must be able to read guild members. Premium is based
only on that Discord role, whether granted by Whop or manually by an admin.
The existing `DISCORD_REQUIRED_ROLE_ID` sign-in requirement is unchanged.

Set `NEXT_PUBLIC_WHOP_URL` to your Whop checkout page before building the web app.
It is public configuration. Without it, the checkout links are hidden.

Server code can call `isPremium(discordUserId)` from `apps/web/src/lib/premium.ts`.
`GET /api/me/premium` uses the authenticated session and returns `{ premium: boolean }`
(401 for unauthenticated requests). No status is stored in the database or JWT.
Definitive role results are cached in memory for two minutes per process;
`invalidatePremiumCache(userId)` forces a fresh lookup on that process. The small
`PremiumCache` interface can be implemented with Redis for shared caching later.
Missing server configuration logs the missing variable names on first use and
returns false. Discord errors also fail closed without logging tokens or bodies.
Rate limits respect Discord's `retry_after` delay once, then fail closed if the
retry fails. Individual network requests time out after ten seconds.

Run focused detection, API, and link tests:
`cd apps/web && node --test src/lib/premium.test.cjs`.
There are no Whop API calls, webhooks, or new premium feature gates.

## Notes

- Postgres runs on localhost:5432 with database/user/password: chudaco/chudaco/devpass.