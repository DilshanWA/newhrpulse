# North architecture

A map of where things live and how data and styles flow. For finding a specific symbol, use graphify (below) before reading files.

## Stack

| Layer | What |
|---|---|
| App framework | TanStack Start (React 19, Vite 8, file-based routing, server functions) |
| UI | Astryx design system (`@astryxdesign/core`, Neutral theme) + Tailwind v4 for layout. Rules: [UI_RULES.md](UI_RULES.md) |
| Drag and drop | dnd-kit (boards, calendar, shoot days) |
| Charts | recharts (Astryx charts are not stable yet) |
| Data | Neon Postgres (Singapore) via Drizzle ORM + `postgres` driver |
| Files | Neon object storage (`src/server/storage.ts`, `object-store.ts`) |
| Auth | better-auth, Microsoft single sign-on (company accounts, Authenticator approval) |
| Hosting | Vercel (project `northstar`), Nitro build output in `.vercel/output` |
| Tooling | bun (package manager + scripts), TypeScript, ESLint + Prettier, graphify |

## Folders

```
src/
  routes/            File routes. `_shell.tsx` is the signed-in layout (sidebar, topbar, command palette).
                     `_shell.<page>.tsx` = a board/list page; `_shell.<page>_.$id.tsx` / `_.new.tsx` = its form pages.
                     `api/` = HTTP endpoints (auth, files, social sync, backup). See src/routes/README.md.
  components/
    app/             Shared app components built on Astryx (ItemCard, tags, page frame, boards, people, links…)
    forms/           One form per record type (task, idea, content, editing, expense, partner, shoot, team)
    ui/              LEGACY shadcn/Radix. Being removed. Do not import in new code.
    icons.tsx        Phosphor icon exports. brand-icons.tsx = platform logos.
    astryx-provider.tsx  Astryx <Theme> + LinkProvider (router links)
  lib/               Browser-side helpers: data.ts (query builder), types.ts, tags.ts (colour vocabulary),
                     companies.ts, content.ts (platforms/statuses), format.ts (dates), links.ts, people.ts …
  api/               Server functions called from the browser (data.functions.ts: runQuery, session, files)
  server/            Server-only code: policies.ts (access rules), session, env, storage, backups, Meta sync
  auth/              better-auth server + client, allowed email domains
  db/                Drizzle schema and client
  styles.css         Layer order, Tailwind ↔ Astryx token mapping, a few legacy utilities
scripts/             bun scripts run via package.json (db:migrate, backup, restore, users, copy-to-neon…)
docs/                These guidelines
graphify-out/        Knowledge graph of the codebase (generated)
```

## Data flow

1. A page calls `db.from("tasks").select(...).eq(...)` from `src/lib/data.ts`. It has the familiar Supabase-like chain, but it is not a public database API.
2. That builds a query request and calls the server function `runQuery` in `src/api/data.functions.ts`.
3. On the server, `src/server/policies.ts` checks the table, the columns and the signed-in user's rights. These rules replaced the old Postgres row-level security.
4. Drizzle (`src/db`) runs it against Neon Postgres.

Pages keep themselves fresh by polling every `LIVE_POLL_MS` (`src/lib/polling.ts`). Rows are loosely typed; pages cast them to the interfaces in `src/lib/types.ts` (use `Pick<>` for partial rows).

Linked records (task ↔ idea ↔ content ↔ shoot ↔ partner) go through `src/lib/links.ts`:
- `useLinkOptions(kind)` returns cached options with titles and companies.
- `linkTo(kind, id)` returns the record page.
- `invalidateLinks(...)` refreshes the cache after writes.

## Styling stack

`src/styles.css`, in order:

1. **The `@layer` line comes first.** It fixes the cascade as `reset → theme → base → astryx-base → astryx-theme → components → utilities`. If it moves below the Tailwind import, Astryx's reset outranks Tailwind utilities, silently.
2. Tailwind, then the Astryx `reset.css`, `astryx.css` and Neutral `theme.css`.
3. **Token mapping.** Tailwind names the app uses (`bg-card`, `text-muted-foreground`, `border-border`, `bg-accent`…) point at Astryx tokens:
   - `@theme inline reference` holds the names Astryx also defines (`accent`, `border`, `success`, `warning`), so they are never redeclared.
   - `@theme inline` holds the rest.
   - No colour values are written there.
4. **Company colours.** They are data, so they keep fixed values.
5. **Legacy utilities.** `card-elevated`, `num`, `seg`, `tile-*` are left over from the old brand and are being replaced by Astryx components.

North is **dark-only**: `<html data-theme="dark">` is rendered by the server and Astryx `<Theme mode="dark">` keeps it. There is no light mode.

## graphify

The codebase has a knowledge graph in `graphify-out/`. Use it before reading raw files:

```bash
graphify query "<question>"     # scoped subgraph for a question
graphify path "<A>" "<B>"       # how two things connect
graphify explain "<concept>"    # one concept in focus
graphify update .               # after changing code (AST only, no API cost)
```

## Commands

```bash
bun run dev            # local dev server
bun run typecheck      # tsc --noEmit
bun run lint           # eslint (fails on shadcn imports / hard-coded colours in new code)
bun run build          # production build (Vercel output)
bun run astryx -- …    # Astryx CLI: search, component, template, docs
bun run db:migrate     # apply Drizzle migrations
bun run backup / restore
```
