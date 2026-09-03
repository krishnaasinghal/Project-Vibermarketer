# VibeMarketer engineering guidance

## Product narrative (locked for YC)

- **Company product:** vibemarketer — Cursor for marketing (agentic founder GTM). Live: https://www.vibemarketer.fun
- **Primary demo path:** paste product URL → brand memory → multi-channel drafts → HITL queue → (if connected) provider-confirmed publish → report.
- **Secondary:** VC Brain (`/vc-brain`, `/app/radar`) — same engine, not the company story. Do not lead demos or homepage with Identify/radar/$100K memo.
- **Pricing freeze:** Starter ₹1,499 · Growth ₹3,999 · Pro ₹7,999 (India-first; Dodo maps Starter→solo, Growth→startup when wired).
- **Aha rule:** stranger sees value in first 30–60s (URL in → brand + drafts out). Soften empty states; never multi-CTA onboarding that hides the queue.
- **YC pack:** `../hack/yc-fall-2026/` (canonical: `YC-PRODUCTION-MASTER-PLAN.md`). Numbers only from dogfood — never invent traction.

## Product and stack

- Build a production multi-tenant SaaS. The web app is Next.js 16 in `apps/web`; domain logic is `packages/engine`; Supabase provides Auth and Postgres.
- Preserve the product invariant: evidence must remain attributable, agent output is a draft until an explicit approval and provider confirmation, and unavailable sources return no result rather than invented data.
- Treat all customer, founder, prospect, and workspace data as sensitive.

## Production reality policy

- The deployed product must use real providers, real persisted data, and real execution records. Never substitute mock, heuristic, template, fixture, demo, local-file, or offline output for a failed live dependency.
- When a required provider, database, connector, or model is unavailable, fail visibly with an actionable error and preserve the evidence of the failure. Do not report a successful run, published action, memory sync, research result, or payment unless it actually happened.
- Test fixtures belong only in test files and explicitly local developer tooling. They must not be reachable from a production user route, seed a real workspace, or be presented as customer/product evidence.
- Keep a provider integration marked unavailable until it is configured, authenticated, and confirmed by a real API response. Do not use stubs as production behavior.

## Working rules

- Read the nearby code and run the smallest relevant check before editing. Do not overwrite or revert unrelated working-tree changes.
- Prefer small, reversible changes with explicit error handling. Keep API contracts typed and validate untrusted input at route boundaries.
- Never expose server secrets, service-role keys, OAuth tokens, or raw provider responses to browser code or logs. Never commit `.env` files.
- For external writes (posting, billing, deployment, migrations, or destructive database actions), stop at a reviewable plan or an approval gate unless the user explicitly authorizes execution.
- Use current documentation through an MCP/doc tool before making Supabase, OpenAI, Next.js, or provider-specific changes.

## Supabase and data safety

- Prefer a local/dev Supabase project for agent-driven work. Do not target production with unconstrained tools.
- Every table in an exposed schema needs RLS and least-privilege policies. Model tenant ownership explicitly; `TO authenticated` alone is never authorization.
- Keep `service_role` server-only. Do not use user-editable metadata for authorization. Security-definer functions require a written justification, an authorization check, a safe search path, and a security-advisor review.
- Follow the existing imperative migration flow: inspect first, make a reversible local change, run advisors, generate/review a migration, then verify the migration list. Never invent migration timestamps.

## Spec-driven + test-driven development (welcomed)

- **Prefer TDD/spec-first** for product logic: write acceptance criteria (in `specs/`) and a failing `*.test.ts`, then implement until green.
- **Engine tests:** `packages/engine/src/**/*.test.ts` run via `tsx` (see `pnpm test:engine`). Shared helpers in `packages/engine/src/test/assert.ts`.
- **Web pure logic/content:** colocate `*.test.ts` next to modules; wire into `package.json` scripts when added.
- **Specs:** human-readable acceptance docs live under `specs/` (e.g. `specs/marketing-loop.md`). Keep them short; link to test IDs.
- **Fail closed is a testable invariant:** agents and publish paths must have tests that prove no template/fake success when providers are down.
- Do not block shipping UI copy on 100% coverage; do block shipping store/publish/agent behavior without a red→green test for the riskiest path.
- Skill: `.grok/skills/tdd-spec/SKILL.md`.

## Verification

- Install dependencies with `pnpm install` only when needed.
- Core checks: `pnpm test:engine`, `pnpm lint`, and `pnpm build`. Use the narrowest relevant command first.
- For auth, RLS, payments, publishing, or data changes, add or update tests and state what was verified and what requires credentials/manual review.

## Grok Build (project harness)

- **Rules:** this file + `.grok/rules/*.md`
- **Skills:** `.grok/skills/` (marketing-loop, dogfood-gate-b, yc-submit-prep, tdd-spec) and plugin `.grok/plugins/vibe-startup/`
- **Hooks:** `.grok/hooks/` — require folder trust once (`/hooks-trust` or `grok --trust`)
- **Config:** `.grok/config.toml` — permissions + plugin path only; reuse user-global MCP servers
- **Plan mode:** multi-file features, migrations, Dodo, publish path changes
- **Subagents:** `explore` for codebase recon; `general-purpose` for multi-file impl; worktrees for experimental branches
- **Memory:** user-global (`GROK_MEMORY=1` or `[memory] enabled = true` in `~/.grok/config.toml`)
- **Inspect:** `grok inspect` to confirm loaded rules/skills
- See `.grok/README.md` for operator notes.
