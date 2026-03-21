# Monorepo Migration Design: Iris + Sara → yinflow.life

**Date:** 2026-03-21
**Status:** Draft
**Repos:** `yinflowltda/iris`, `yinflowltda/sara` → `yinflowltda/yinflow.life`

## Motivation

Better agentic coding experience. A monorepo gives AI coding agents full visibility into both codebases — types, patterns, shared infrastructure — in a single context. Secondary benefits: unified developer experience, single `git clone`, consistent tooling, and a natural foundation for future shared code.

## Decision Summary

| Decision | Choice |
|---|---|
| Monorepo host | Sara repo (renamed to `yinflow.life`) |
| Iris history preservation | `git subtree add --prefix=apps/iris` (without `--squash` — preserves full individual commit history) |
| Structure | `apps/sara/` + `apps/iris/`, symmetric layout |
| Package management | Bun workspaces (no Turborepo) |
| Shared packages | None initially — extract incrementally when duplication emerges |
| Deployment | Independent per-app (each has own `wrangler.toml`) |
| Risk level | Low — apps are not live, no real users |

**Note on history:** Without `--squash`, Iris commits will appear interleaved chronologically with Sara commits in `git log`. This is the intended trade-off — full `git blame` and `git log --follow` support within `apps/iris/` is more valuable than a clean linear log.

## Current State

### Iris (`tldraw-agent` in package.json)
- **Purpose:** Cognitive mapping / mandala canvas editor
- **Frontend:** React 19 + tldraw 4.4 (Vite 7)
- **Backend:** Cloudflare Workers + Durable Objects (direct wrangler)
- **Database:** Cloudflare D1
- **Auth:** Cloudflare Access (JWT)
- **AI:** Vercel AI SDK v6 + OpenAI-compatible proxy
- **Deploy:** `iris.yinflow.life` via Cloudflare Workers (Vite plugin + static assets, NOT CF Pages)
- **Package manager:** Bun
- **CI:** None (no `.github/workflows/`)

### Sara (`ai-chatbot` in package.json)
- **Purpose:** Health triage AI agent + marketing website
- **Frontend:** Next.js 16 + shadcn/ui + Tailwind CSS
- **Backend:** Next.js API routes (OpenNext on CF Workers)
- **Database:** PostgreSQL (Neon) + Drizzle ORM
- **CMS:** Directus (external, self-hosted at painel.yinflow.life)
- **Auth:** Auth.js / NextAuth v5
- **AI:** LangGraph + Vercel AI SDK v5 + Cloudflare Workers AI + Vectorize RAG
- **Integrations:** WhatsApp Business API, LangSmith tracing
- **Deploy:** `sara.yinflow.life` via Cloudflare Pages + Workers (OpenNext)
- **Package manager:** Bun
- **CI:** GitHub Actions — `lint.yml` and `playwright.yml` use pnpm, `validate.yml` uses Bun

### Known Dependency Conflicts

These shared dependencies have version mismatches that must be resolved before Bun workspaces can work:

| Package | Iris | Sara | Severity |
|---|---|---|---|
| `ai` (Vercel AI SDK) | `^6.0.90` | `5.0.108` (pinned) | **Major** |
| `zod` | `^4.1.8` | `^3.25.76` | **Major** |
| `react` / `react-dom` | `^19.2.1` | `19.0.1` (pinned) | Minor (pin vs caret) |
| `@types/react` / `@types/react-dom` | `^19.x` | `^18` | **Major** |
| `workers-ai-provider` | `^3.1.1` | `^2.0.0` | **Major** |
| `@biomejs/biome` | `^2.4.2` | `2.2.2` (pinned) | Minor |

## Target Structure

```
yinflow.life/
├── package.json                       # Root: Bun workspaces config
├── bun.lock                           # Single lockfile
├── .gitignore                         # Merged from both repos
├── lefthook.yml                       # Shared git hooks (scoped per app dir)
├── .github/                           # CI/CD workflows
├── .claude/                           # Monorepo-level Claude Code config
├── LICENSE
├── README.md
├── .cursor/                           # Editor config
├── .vscode/                           # Editor config
├── .env.example                       # Root env template (pointers only)
├── .node-version
├── .npmrc
├── apps/
│   ├── sara/                          # Next.js app
│   │   ├── package.json               # name: "sara"
│   │   ├── wrangler.toml              # sara.yinflow.life
│   │   ├── biome.jsonc                # Sara's config (extends ultracite)
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── open-next.config.ts
│   │   ├── drizzle.config.ts
│   │   ├── middleware.ts
│   │   ├── instrumentation.ts
│   │   ├── playwright.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   ├── docker-compose.waha.yml
│   │   ├── .env.local                 # Sara's env vars
│   │   ├── app/
│   │   ├── lib/
│   │   ├── components/
│   │   ├── workers/
│   │   ├── functions/
│   │   ├── hooks/
│   │   ├── i18n/
│   │   ├── messages/
│   │   ├── artifacts/
│   │   ├── public/
│   │   ├── scripts/
│   │   ├── tests/
│   │   └── docs/
│   └── iris/                          # Vite + tldraw app
│       ├── package.json               # name: "iris"
│       ├── wrangler.toml              # iris.yinflow.life
│       ├── biome.json                 # Iris's config (standalone)
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── playwright.config.ts
│       ├── .env                       # Iris's env vars
│       ├── .dev.vars                  # Iris's CF dev vars
│       ├── client/
│       ├── worker/
│       ├── shared/
│       ├── tests/
│       ├── public/
│       ├── scripts/
│       └── docs/
├── packages/                          # Future shared code (empty)
└── docs/                              # Monorepo-level docs (optional)
```

### Root package.json

```json
{
  "name": "yinflow.life",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:sara": "bun --filter sara dev",
    "dev:iris": "bun --filter iris dev",
    "build:sara": "bun --filter sara build",
    "build:iris": "bun --filter iris build",
    "typecheck": "bun --filter '*' typecheck"
  }
}
```

Note: No root `lint` script — Biome configs are per-app (incompatible presets). Run lint per-app via `bun --filter sara lint` / `bun --filter iris lint`.

## Migration Phases

### Phase 1: Move Sara into `apps/sara/`

Move all Sara app code and config into `apps/sara/`. Keep shared config at root.

**Files that move into `apps/sara/`:**
- App code: `app/`, `lib/`, `components/`, `workers/`, `functions/`, `hooks/`, `i18n/`, `messages/`, `artifacts/`, `public/`, `scripts/`, `tests/`, `docs/`
- App config: `package.json`, `tsconfig.json`, `next.config.ts`, `wrangler.toml`, `open-next.config.ts`, `drizzle.config.ts`, `playwright.config.ts`, `middleware.ts`, `instrumentation.ts`, `components.json`, `postcss.config.mjs`, `next-env.d.ts`, `docker-compose.waha.yml`, `vercel.json`, `vercel-template.json`, `biome.jsonc`
- App docs: `DEPLOYMENT.md`, `CLOUDFLARE_*.md`, `REGRESSION_TESTS.md`, `LOCAL_BUILD_TEST.md`
- App env: `.env.local`, `.env.example` (Sara-specific)

**Files that stay at root:**
- `.github/`, `.gitignore`, `LICENSE`, `README.md`
- `lefthook.yml`
- `.cursor/`, `.vscode/`
- `.node-version`, `.npmrc`
- `.claude/` (monorepo-level Claude Code config)

**Path updates needed:**
- CI workflows: add `working-directory: apps/sara` to all job steps
- CI workflows: **migrate `lint.yml` and `playwright.yml` from pnpm to Bun** (`oven-sh/setup-bun` instead of `pnpm/action-setup@v4`)
- Cloudflare Pages dashboard: update build command to `cd apps/sara && bun run build:workers`
- `lefthook.yml`: scope commands per app directory (only type-check/lint files in the changed app)
- `package.json`: rename `name` from `"ai-chatbot"` to `"sara"`
- `drizzle.config.ts`: verify `.env.local` path resolves correctly from `apps/sara/` (it should — drizzle runs from cwd)

Most internal imports use relative paths or Next.js `@/` alias (resolves from tsconfig location), so app code needs minimal changes.

### Phase 2: Import Iris via git subtree

```bash
git remote add iris https://github.com/yinflowltda/iris.git
git fetch iris
git subtree add --prefix=apps/iris iris main
git remote remove iris
```

One merge commit. Full Iris commit history preserved under `apps/iris/`. No path conflicts since Iris lands in its own subdirectory.

**Post-import cleanup:**
- Rename `package.json` `name` from `"tldraw-agent"` to `"iris"`
- Remove `apps/iris/bun.lock` (monorepo root lockfile takes over)
- Update `apps/iris/CLAUDE.md` to reflect new paths
- Remove `apps/iris/.claude/` if present (monorepo-level `.claude/` at root)
- Review `apps/iris/.gitignore` — merge relevant entries into root `.gitignore`, then delete it

### Phase 3: Align dependencies + set up workspaces

**Step 1: Resolve version conflicts.** Upgrade Sara's dependencies to match Iris (or vice versa). Recommended direction — upgrade Sara to match Iris since Iris is on newer versions:

| Package | Action |
|---|---|
| `ai` (Vercel AI SDK) | Upgrade Sara from v5 → v6 (breaking changes likely in API) |
| `zod` | Upgrade Sara from v3 → v4 (significant API changes) |
| `react` / `react-dom` | Unpin Sara to `^19.2.1` |
| `@types/react` / `@types/react-dom` | Upgrade Sara to `^19.x` |
| `workers-ai-provider` | Upgrade Sara from v2 → v3 |
| `@biomejs/biome` | Upgrade Sara to `^2.4.2` |

**Alternative (time-boxed escape hatch):** If upgrading Sara proves too disruptive (especially `zod@3→4` and `ai@5→6` which touch Sara's core AI pipeline), fall back to per-workspace dependency overrides in each app's `package.json` to pin different versions. This defeats some hoisting benefits but unblocks the monorepo setup. Decide within the first few hours of Phase 3 — don't spend days on upgrades when overrides work.

**Step 2: Set up workspaces.**
1. Create root `package.json` with workspace config
2. Remove per-app `bun.lock` files
3. Run `bun install` at root to generate unified lockfile
4. Verify both apps build: `bun --filter sara build` and `bun --filter iris build`
5. Merge `.gitignore` files

### Phase 4: Rename + cleanup

1. Rename GitHub repo: `yinflowltda/sara` → `yinflowltda/yinflow.life`
2. Archive `yinflowltda/iris` with README pointing to monorepo
3. Update Cloudflare Pages project if repo name is referenced (Sara only — Iris uses Workers direct deploy)
4. Update root `README.md` to describe the monorepo
5. Create root `CLAUDE.md` with monorepo-level instructions

## What Changes Per App

### Sara

| Area | Impact | Fix |
|---|---|---|
| `bun run dev` | Must run from `apps/sara/` | Root `dev:sara` script delegates via `--filter` |
| CI/CD workflows | Paths assume root = app root; 2 of 3 use pnpm | Add `working-directory`, migrate all to Bun |
| `.env` / `.env.local` | Currently at repo root | Move to `apps/sara/` |
| `bun.lock` | Own lockfile at root | Deleted — monorepo root lockfile |
| CF Pages build | Build command assumes root | `cd apps/sara && bun run build:workers` |
| `@/` alias | Root-relative | Still valid — tsconfig moves with code |
| `drizzle.config.ts` | Loads `.env.local` from cwd | Works if `bun run db:migrate` runs from `apps/sara/` |
| `package.json` name | `"ai-chatbot"` | Rename to `"sara"` |
| Dependencies | Older versions of shared packages | Upgrade to align with Iris (Phase 3) |

### Iris

| Area | Impact | Fix |
|---|---|---|
| Most code | Self-contained subtree | Works as-is |
| `bun.lock` | Own lockfile | Deleted — monorepo root lockfile |
| `CLAUDE.md` | References root-level paths | Update to `apps/iris/` paths |
| CF Workers deploy | `wrangler deploy` from root | Run from `apps/iris/` |
| Git worktrees | `.worktrees/` at repo root | Still works — repo-level |
| `.claude/` | Per-repo config | Remove — monorepo root `.claude/` takes over |
| `package.json` name | `"tldraw-agent"` | Rename to `"iris"` |

### Tooling

- **Biome:** Per-app configs. Sara uses `biome.jsonc` (extends `ultracite` preset). Iris uses `biome.json` (standalone, tabs, single quotes, no semicolons). These are incompatible — no shared root config.
- **Git hooks (lefthook):** Root-level, scoped to trigger per-app based on changed file paths.
- **TypeScript:** Per-app tsconfig. No root tsconfig needed.
- **Bun workspaces:** Hoists shared deps to root `node_modules/`.
- **Env files:** Per-app. Sara uses `.env.local` (Next.js convention). Iris uses `.env` + `.dev.vars` (Cloudflare convention). No consolidation.

## Risks

**High: Dependency version alignment (Phase 3).** Upgrading Sara from `zod@3` → `zod@4` and `ai@5` → `ai@6` will require code changes in Sara. These are major version bumps with breaking API changes. However, apps are not live — we can fix forward.
→ Do the upgrades in Phase 3 and fix Sara build errors before proceeding.

**Medium: Sara path aliases after move.** `drizzle.config.ts`, `open-next.config.ts` may have assumptions about cwd.
→ Verify each config after move. Most use relative paths that move with the code.

**Low: Iris subtree import.** Well-understood git operation, no path conflicts.

**Low: Cloudflare Pages rebinding.** Dashboard config update for Sara only. Iris deploys via `wrangler deploy` (Workers), not Pages.

## Rollback

If migration fails mid-way, the Sara repo can be restored from the pre-migration commit (`git reset --hard <pre-phase-1-commit>`). The original Iris repo remains untouched until Phase 4 (archive step).

## Out of Scope

- Shared packages extraction — defer until real duplication emerges
- Turborepo/Nx — not needed with 2 apps
- Unified auth — different needs per app (CF Access vs Auth.js)
- Shared CI pipeline — each app can have its own workflow
- Directus integration for Iris — feature decision, not monorepo concern
- Unified Biome config — presets are incompatible, keep per-app
