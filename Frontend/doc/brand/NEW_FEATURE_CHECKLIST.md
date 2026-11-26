# New feature checklist

Follow these steps, in order, for every new page, feature or UI change.

## Before writing code

- [ ] **Find related code with graphify:** `graphify query "<what you're building>"`. Check whether something similar already exists.
- [ ] **Read the rules:** [UI_RULES.md](UI_RULES.md) (Astryx first, what's not allowed) and [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md) (colours, wording).
- [ ] **New page?** Run `bun run astryx -- build "<page idea>"` and start from the template it names. Also check how the nearest existing page does it (for example `_shell.tasks.tsx` for a board, `_shell.tasks_.$id.tsx` for a form page).
- [ ] **Search Astryx for every UI need:** `bun run astryx -- search "<need>"`, then `bun run astryx -- component <Name>` for its props.
- [ ] **Check North's shared pieces** (the table in UI_RULES.md): `ItemCard`, tag components, `PageHeader`, `FilterBar`, `EmptyState`, `BoardColumnShell`, `FormPage`, `useConfirm`, `RelatedChips`.

## While writing code

- [ ] **Imports:** UI comes from `@astryxdesign/core/<Name>` or `@/components/app/*`, never from `@/components/ui/*`.
- [ ] **Colours** come from component props, `src/lib/tags.ts` or Astryx tokens. No `#hex`, `rgb()`, `bg-[#…]` or gradients.
- [ ] **Need a new tag colour or status?** Add it to `src/lib/tags.ts` (and a tag component in `tags.tsx` if needed). Don't colour it in the page.
- [ ] **Tailwind** is used for layout only.
- [ ] **Text** follows the writing style: sentence case, buttons say what they do, empty states explain what to do next.
- [ ] **Data** goes through `db.from()` (`src/lib/data.ts`). For a new table or column, update `src/server/policies.ts` too.
- [ ] **Links to other records** use `RelatedChips` / `LinkPicker`, and `invalidateLinks()` runs after writes.

## Before you say it's done

- [ ] `bun run typecheck` passes.
- [ ] `bunx eslint <changed files>` has no errors.
- [ ] `bun run build` passes.
- [ ] **In the browser:** run `bun run dev` and check the page (dark mode, the only mode) at desktop and phone width.
- [ ] **Interactions work:** clicking, drag and drop, saving, empty and loading states.
- [ ] **Rows line up:** in the screenshot, every chip, text and button in a row shares one centre line, and chips side by side are the same height (BRAND_GUIDELINES §3, "Alignment").
- [ ] Run `graphify update .`.
- [ ] **Added a shared component, tag colour or rule?** Update the matching doc in `docs/`.
- [ ] **Wrote a component from scratch?** Say which Astryx searches came back empty.
