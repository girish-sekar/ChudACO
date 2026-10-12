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

## Notes

- Postgres runs on localhost:5432 with database/user/password: chudaco/chudaco/devpass.