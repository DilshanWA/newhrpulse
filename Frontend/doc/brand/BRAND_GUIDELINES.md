# North brand guidelines

How North looks and talks. Read this before you design or write any screen, label or message.
Rules for *building* UI are in [UI_RULES.md](UI_RULES.md).

## 1. Look: stock Astryx Neutral

- The app uses the **Astryx Neutral theme** as-is: warm grays and the Figtree font. There is no custom theme.
- Do not add a theme, override Astryx tokens in `:root`, or hard-code colours. If the look needs to change, change it through Astryx theming (`bun run astryx -- docs theme`), never in components.
- **Font:** Figtree is loaded in `src/routes/__root.tsx`. Use the Astryx `Heading` and `Text` components, or plain text with Tailwind size utilities. Don't load other fonts.
- **Dark only.** North has no light mode and no theme switch.
  - `src/components/astryx-provider.tsx` sets Astryx `<Theme mode="dark">`, and `src/routes/__root.tsx` renders `<html data-theme="dark">` so nothing flashes light while loading.
  - Don't add a light/dark toggle, `prefers-color-scheme` rules, `light:` styles or `dark:` variants. Tokens already give the dark values.

## 2. Colour: where colours may come from

Use only these, in this order:

1. **Component props:** Astryx `Badge variant`, `Token color`, `Card variant`, `ProgressBar variant`, `Button variant`.
2. **The app's tag vocabulary** in [`src/lib/tags.ts`](../src/lib/tags.ts), through the tag components in `src/components/app/tags.tsx`.
3. **Astryx tokens:**
   - in CSS: `var(--color-text-secondary)`, `var(--color-background-pink)`, …
   - in Tailwind, through the mapped names in `src/styles.css`: `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-accent` (hover tint), `text-destructive`.

Never use `#hex`, `rgb()`, `hsl()`, `bg-[#…]` or inline gradients. Lint fails on hard-coded colours in `.tsx` files.

### The tag vocabulary (from `src/lib/tags.ts`)

A colour always means the same thing everywhere. To change one, edit `tags.ts` only.

| Tag | Values → colour |
|---|---|
| Priority | Urgent → solid red · High → red · Medium → orange · Low → blue |
| Due date | Overdue → solid red · Today → solid amber · Upcoming → blue · No date → show nothing |
| Task status | To do → blue · Review → orange · Done → green (the task card on the board takes the same colour) |
| Idea status | Pending → orange · Accepted → green · Rejected → red |
| Content status | Idea → blue · Script → purple · Filming → cyan · Editing → pink · Scheduled → teal · Published → green |
| Platform | Instagram → pink · Facebook → blue · TikTok → gray |
| Linked item | Idea → purple · Task → blue · Content → pink · Partner → teal · Shoot → cyan · Expense → green |

Status colours (red, amber, green) are for state only. Don't use them for decoration.

### Status colours: one meaning per colour

Every status in North, on every page, takes its colour from what it means. A new status picks its colour from this table, and the colour is set in `tags.ts` only (`TASK_STATUS_TONE`, `TASK_STATUS_CARD`, `CONTENT_STATUS_TONE`, `IDEA_STATUS_TONE`).

| Colour | Means | Statuses |
|---|---|---|
| **Blue** | Not started yet | Task To do · Editing To edit · Content Idea |
| **Cyan** | Being worked on | Editing Editing · Content Filming |
| **Orange** | Waiting for someone to check | Task Review · Editing Review · Idea Pending |
| **Red** | Needs fixing, said no, or late | Editing Changes · Idea Rejected · Overdue |
| **Green** | Finished | Task Done · Editing Done · Idea Accepted · Content Published |
| Purple · Pink · Teal | Content pipeline steps only | Content Script · Content Editing · Content Scheduled |

On the Tasks board a card's background is its status colour; priority is the small text on the card, and Urgent shows as a solid red badge so it still stands out.

### Company colours

- SIG red, Grman blue, Institute yellow and "All companies" navy live in `src/lib/companies.ts` and `src/styles.css`.
- They are **data** (each company's own identity), not theme. Show them only as:
  - a `CompanyTag` badge (colour dot + short name, e.g. SIG). `ItemCard company=…` shows it automatically, or
  - a small company dot (`CompanyDot`, and inside `ContentChip`) or the company filter.
  - Never as an unlabelled coloured stripe: people can't tell what it means.
- Never use them for buttons, backgrounds or text.

### Company logos

- Served logos live in `public/logos/companies/`, one file per company id: `sig.png` (Studyingermany.lk), `grman.svg` (Grman Exams), `institute.svg` (Grman Institute, grman.lk). "All companies" has no logo and shows its colour dot.
- Paths are set on each company in `src/lib/companies.ts` (`logo`). Show a logo with `CompanyLogo` (or `CompanyDot` / `CompanyTag`) from `src/components/app/company.tsx`, never with a raw `<img>`.
- Full-size originals are kept in `docs/brand/` (e.g. `sig-logo-source.svg`) and are not shipped. To update a logo, export a small file (128px PNG or a clean SVG) into `public/logos/companies/` under the company id.

## 3. Shape and space

- **Corners:** from Astryx (`--radius-inner`, `--radius-element`, `--radius-container`, `--radius-page`). Tailwind `rounded-sm/md/lg/xl` are mapped to them. No arbitrary radii.
- **Spacing:** the 4px scale (Tailwind `gap-2` = 8px, `p-3` = 12px …, which matches Astryx `--spacing-*`). No arbitrary values like `p-[13px]`.
- **Shadows:** Astryx `elevation` on `Card` and `IconButton` (`none`, `low`, `med`, `high`). Cards are flat by default; raise a card only while it is being dragged or floats.
- **Alignment: rows line up.** Everything in one row (text, chips, buttons, avatars) shares one centre line; nothing sits a little up or down.
  - Chips side by side use the same component at the same size (Badge next to Badge), so they're the same height.
  - Build a row with `HStack vAlign="center"`. Put any control inside a clickable card or row in `RowControl` (`src/components/app/row-control.tsx`), never in a bare inline `<span>` or `<button>`.
  - Check it in a screenshot before calling a UI change done.

## 4. Icons

- **UI icons:** Phosphor, exported from `src/components/icons.tsx` (`import { Plus } from "@/components/icons"`). If an icon is missing, add an export line there; don't import icon packages directly.
- **Platform logos:** `src/components/brand-icons.tsx`.
- **Sizes:** `h-3 w-3` inside tags, `h-4 w-4` in buttons and rows.

## 5. Writing style

North is an internal tool for a marketing team. Write like a helpful colleague: short, plain, specific.

- **Sentence case** everywhere: "New shoot day", not "New Shoot Day". No ALL-CAPS labels.
- **Buttons say what they do:** "Add to shoot", "Mark as completed", "Delete day". Not "Submit" or "OK".
- **Empty states** say what will appear and how to get it there:
  - "Nothing to shoot yet. Drop an item here, or add one below."
- **Toasts** say what happened: "Shot! Given to Shahjath." / "Assigned to Ruwan". Errors show the real message.
- **Confirmations** name the thing and the consequence: `Delete "Tamil Shoot day 2" and its 4 shoot items? This can't be undone.`
- **Dates:** `EEE, d MMM` ("Wed, 27 Aug") in cards, `d MMM yyyy` when the year matters. Use `formatDate` from `src/lib/format.ts`.
- **No emoji** in UI text. No exclamation marks except the "Shot!" style success toast. No marketing words ("seamless", "powerful").
- Product name: **North**.
