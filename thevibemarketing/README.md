# vibemarketer

Cursor for marketing: give vibemarketer a product URL and its agents build brand memory, create multi-channel drafts, route them through human approval, publish through connected providers, and report the results.

[Live product](https://www.vibemarketer.fun) · [Repository](https://github.com/Anand-0037/thevibemarketing)

## Product flow

1. Paste a product URL.
2. Build attributable brand memory from live evidence.
3. Generate drafts for the selected channels.
4. Approve or reject drafts in the HITL queue.
5. Publish only after the provider confirms the action.
6. Review execution records and campaign reports.

Failed providers remain visibly unavailable. The product never substitutes fixtures, templates, or fake success for a failed live dependency.

VC Brain (`/vc-brain`, `/app/radar`) is a secondary workflow built on the same evidence, memory, and agent engine.

## Stack

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 application and API routes |
| `packages/engine` | Agent, connector, memory, research, and scoring logic |
| `supabase` | Auth, Postgres schema, RLS policies, and migrations |
| `specs` | Acceptance criteria for product behavior |

Supabase owns authentication and tenant-scoped persistence. Provider credentials and the Supabase service-role key remain server-only.

## Local development

Requires Node.js 20+ and pnpm.

```bash
corepack enable
pnpm install
cp .env.example .env
cp .env.example apps/web/.env
pnpm dev
```

Fill only the provider credentials needed for the flow you are testing. Keep `AUTH_BYPASS`, `ALLOW_OPEN_APP`, `ALLOW_SHARED_WORKSPACE`, and `DODO_WEBHOOK_ALLOW_UNSIGNED` disabled outside isolated local development.

## Verification

```bash
pnpm test:unit
pnpm lint
pnpm build
```

Use `pnpm test:engine` for the engine suite and `pnpm test:content` for web content and pure-logic tests.

## Pricing

- Starter — ₹1,499
- Growth — ₹3,999
- Pro — ₹7,999

## License

Proprietary.
