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

## Notes

- Postgres runs on localhost:5432 with database/user/password: chudaco/chudaco/devpass.