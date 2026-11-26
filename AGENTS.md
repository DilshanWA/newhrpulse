<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Before building or changing any UI (required)

North's UI is the **Astryx design system** (Neutral theme). Do not write custom UI code.

1. Read [docs/UI_RULES.md](docs/UI_RULES.md), [docs/BRAND_GUIDELINES.md](docs/BRAND_GUIDELINES.md) and follow [docs/NEW_FEATURE_CHECKLIST.md](docs/NEW_FEATURE_CHECKLIST.md). Architecture map: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. **Search Astryx first** for every UI need: `bun run astryx -- search "<need>"`, then `bun run astryx -- component <Name>` for props. New page: `bun run astryx -- build "<idea>"`.
3. Then reuse North's shared Astryx-based pieces in `src/components/app/` (`ItemCard`, tag components, `PageHeader`, `FilterBar`, `EmptyState`, `BoardColumnShell`, `FormPage`, `useConfirm`, `RelatedChips`, `RowControl`).
4. Colours only from component props, `src/lib/tags.ts` or Astryx tokens. Never `#hex`/`rgb()`/`bg-[#…]`/gradients.
5. Never import from `src/components/ui/*` (legacy shadcn, being removed). Lint fails on both.
6. **Rows line up.** Everything in a row shares one centre line, and chips side by side are the same size. Build rows with `HStack vAlign="center"`; wrap a control inside a clickable card or row in `RowControl`, never a bare inline `<span>`/`<button>`. Check it in a screenshot (BRAND_GUIDELINES §3, "Alignment").


<!-- ASTRYX:START -->
Astryx v0.7.16 · 174 components
CLI: run every command as `bunx @astryxdesign/cli@0.7.16 <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.
- THEMES: palettes and custom colors go through the theme, never :root overrides. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` and open the PNGs it writes (changes nothing in the app); a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
