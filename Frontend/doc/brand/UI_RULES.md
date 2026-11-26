# UI rules: Astryx first, no custom UI code

North's UI is built with the **Astryx design system** (`@astryxdesign/core`, v0.7.16, Neutral theme).
Before you write or change any UI, follow the order below. **Do not write a custom component when Astryx or the app already has one.**

Look and wording rules are in [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md). The step list is in [NEW_FEATURE_CHECKLIST.md](NEW_FEATURE_CHECKLIST.md).

## The order: search, reuse, compose

### Step 1: search Astryx

Run these from the project root. The `astryx` script in `package.json` runs the project's own pinned CLI.

```bash
bun run astryx -- search "<what you need>"   # e.g. "status tag", "date picker", "confirm dialog"
bun run astryx -- build "<page idea>"        # names the template + blocks to start a new page from
bun run astryx -- template --list            # whole-page and block templates
bun run astryx -- component <Name>           # props, examples, do/don't for one component
bun run astryx -- docs <topic>               # tokens, layout, theme, styling-libraries/tailwind
```

Always read `component <Name>` before you use a component for the first time. Prop names differ from shadcn (see the gotchas below).

### Step 2: reuse North's shared pieces

These are already built on Astryx. Use them instead of rebuilding.

| Need | Use | File |
|---|---|---|
| A card on a board (task, idea, edit, shoot item…) | `ItemCard`, `ItemSection`, `GroupHeading` | `src/components/app/item-card.tsx` |
| Priority / due / status / platform tag | `PriorityTag`, `DueTag`, `TaskStatusTag`, `ContentStatusTag`, `IdeaStatusTag`, `PlatformTag` | `src/components/app/tags.tsx` |
| Any colour for a tag | the maps in `tags.ts` (`PRIORITY_TONE`, `LINK_TONE`, `PLATFORM_HUE`, `hueStyle`…) | `src/lib/tags.ts` |
| A status colour (chip, board card, column count) | `TASK_STATUS_TONE`, `TASK_STATUS_CARD`, `CONTENT_STATUS_TONE`, `IDEA_STATUS_TONE`; pick by meaning from the "Status colours" table in BRAND_GUIDELINES §2 | `src/lib/tags.ts` |
| A post as a small tag (calendar, dashboard) | `ContentChip` | `src/components/app/content-chip.tsx` |
| A bar split into coloured parts (workload, idea decisions) | `SegmentBar`, `SegmentLegend`, `IdeaSplitBar` | `src/components/app/segment-bar.tsx`, `idea-split.tsx` |
| Reference links (platform icons that open the link in a new tab) | `ReferenceLinks`; helpers `parseLink`, `extractLinks`, `mergeLinks` | `src/components/app/reference-links.tsx`, `src/lib/reference-links.ts` |
| A published post's story (idea → shoot → edit → post, credits, stats vs average) | `PostStoryDrawer`; helpers `loadPostStory`, `suggestContent`, `linkPost`, `accountAverages` | `src/components/app/post-story.tsx`, `src/lib/post-story.ts` |
| An idea's costs (actors, transport, food, props; real expenses linked to the idea) | `IdeaCosts` | `src/components/app/idea-costs.tsx` |
| Chart styling (Recharts) | `barTooltip`, `lineTooltip`, `legendProps`, `axis`, `grid`, `SERIES` | `src/lib/chart.ts` |
| Links to other records (idea, task, content…) | `RelatedChips` | `src/components/app/links.tsx` |
| Picking a linked record | `LinkPicker` | `src/components/app/links.tsx` |
| Page frame, title, filters, empty state, stats | `PageContainer`, `PageHeader`, `FilterBar`, `SearchInput`, `EmptyState`, `SectionCard`, `StatCard` | `src/components/app/page.tsx` |
| Board columns (personal order / hide) | `BoardColumnShell`, `ColumnsButton`, `useBoardColumns` | `src/components/app/board.tsx` |
| People | `PersonAvatar`, `PeopleStack`, `PersonPicker` | `src/components/app/people.tsx` |
| Company | `CompanyTag` (badge on cards and rows), `CompanyDot`, `CompanyFilter`, `CompanySelect` | `src/components/app/company.tsx` |
| Form pages | `FormPage`, `FormSection`, `Field`, `SaveBar`, `useFormState`, `useRecord` | `src/components/app/form-page.tsx` |
| "Are you sure?" | `useConfirm()` | `src/components/app/confirm.tsx` |
| A control (menu, button, checkbox, chip) inside a clickable card or row | `RowControl`: keeps it on the row's centre line and stops the click from opening or dragging the card | `src/components/app/row-control.tsx` |
| Description text with its links as buttons in place | `DescriptionText`; helper `splitLinks` | `src/components/app/description-links.tsx`, `src/lib/reference-links.ts` |

If one of these is close but not quite right, **extend it** (add a prop) rather than copying it.

### Step 3: compose Astryx components

Only when steps 1–2 have nothing ready-made, build from Astryx parts:

- Import each component from its own entry: `import { Badge } from "@astryxdesign/core/Badge"`.
- For **new** code, prefer Astryx layout components (`Stack`, `HStack`, `VStack`, `Grid`, `Layout`, `Section`) over hand-made `<div>` layouts. Existing pages still use Tailwind `div` layouts; leave them unless you are changing that section.
- Tailwind is for **layout only**: flex/grid, gap, padding, margin, width, responsive breakpoints. Never use Tailwind to build a control (button, input, menu, chip) or to colour something outside the token names.

### Step 4: nothing fits

- Run `bun run astryx -- search` with two or three different phrasings first.
- If you still have to write a new component, keep it in `src/components/app/`, build it from Astryx parts and tokens, and say in your summary / PR which searches came back empty.
- If Astryx is missing something real, file it with `bun run astryx -- gap-report`.

## Not allowed

- **Importing from or adding files to `src/components/ui/*`.** That is the old shadcn/Radix layer and it is being removed. Lint errors on new imports.
- Hand-made buttons, inputs, selects, menus, dialogs, popovers, tooltips, toasts, tabs or chips (`<button className="rounded-full px-2 …">`). Use Astryx.
- **Hard-coded colours:** `#hex`, `rgb()`, `hsl()`, `bg-[#…]`, inline `style={{ background: "linear-gradient(…)" }}`. Lint errors on these in `.tsx` files.
- New global CSS, `@apply`, or new `@utility` blocks in `src/styles.css`. The custom utilities still there (`card-elevated`, `tile-*`, `seg`, `num`) are legacy and are being replaced; don't use them in new code.
- **Editing generated files:** `src/astryx-themes.ts` (run `bun run astryx -- theme …`), `src/routeTree.gen.ts`.
- Overriding Astryx tokens in `:root` or creating a custom theme.

## Old (shadcn) → Astryx map

Use this when you touch a file that still imports `@/components/ui/*`. Move it over while you are there.

| Old | Astryx |
|---|---|
| `Button` | `Button` (text) / `IconButton` (icon only, needs `label`) |
| `Input` | `TextInput` |
| `Textarea` | `TextArea` |
| `Label` + field wrapper | `Field` (or the component's own `label` prop) |
| `Select` | `Selector` (single) / `MultiSelector` / `Typeahead` |
| `Checkbox` | `CheckboxInput` |
| `Switch` | `Switch` |
| `RadioGroup` | `RadioList` |
| `Toggle` / `ToggleGroup` | `ToggleButton` / `ToggleButtonGroup` / `SegmentedControl` |
| `Tabs` | `TabList` + `Tab` |
| `Dialog` | `Dialog` |
| `AlertDialog` | `AlertDialog` (or `useConfirm()` in North) |
| `Sheet` / vaul `Drawer` | `Drawer` / `BottomSheet` |
| `Popover` | `Popover` |
| `HoverCard` | `HoverCard` |
| `Tooltip` | `Tooltip` (or the `tooltip` prop on `IconButton`) |
| `DropdownMenu` / `ContextMenu` | `DropdownMenu` / `ContextMenu` / `MoreMenu` |
| `Command` (cmdk) | `CommandPalette` |
| `Badge` | `Badge` (status/category) / `Token` (removable or clickable chip) |
| `Card` | `Card` (or North's `ItemCard`) |
| `Progress` | `ProgressBar` |
| `Avatar` | `Avatar` / `AvatarGroup` |
| `Separator` | `Divider` |
| `Skeleton` | `Skeleton` |
| `Table` | `Table` + `TableHeader`/`TableBody`/`TableRow`/`TableCell` |
| `Calendar` / day picker | `Calendar`, `DateInput`, `DateRangeInput` |
| `ScrollArea` | `ScrollableArea` |
| `Breadcrumb` | `Breadcrumbs` |
| `Pagination` | `Pagination` |
| sonner `toast` | `Toast` / `useToast` |

## Astryx gotchas (learned in this codebase)

- **Labels are props, not children:** `<Badge label="Done" />`, `<Button label="Save" />`, `<IconButton label="Delete" icon={<Trash2 />} />`. `IconButton`'s `label` is its accessible name; add `tooltip` for a visible hint.
- **Inputs give you the value first:** `TextInput onChange={(value, event) => …}`. Use `onEnter` for submit-on-Enter. Every input needs a `label`; use `isLabelHidden` when the design has no visible label.
- **Booleans start with `is`:** `isDisabled`, `isLoading`, `isLabelHidden`, `isIndeterminate`.
- **`<fieldset disabled>` doesn't lock Astryx inputs.** It only reaches plain HTML controls; `Selector`, `MultiSelector`, `PersonPicker`, `CompanySelect` and friends stay clickable inside it. Pass `isDisabled` to the component, plus `disabledMessage` to say why on hover ("Only Isum can change this").
- **`className` and `style` work** on Astryx components for layout (`className="flex-1"`). For deeper styling use the `xstyle` prop with `stylex.create()`, not inline style.
- **Links:** Astryx components take `href`. `LinkProvider` (in `astryx-provider.tsx`) sends in-app paths through the TanStack router, so `href="/tasks/123"` navigates client-side.
- **A control inside a clickable card or row** (menu, button, checkbox, clickable `Token`): wrap it in `RowControl`, so the click works on the control and doesn't open or drag the card.
- **Inline wrappers push chips off the line.** A bare `<span>` or `<button>` around a `Badge` sits on the text baseline and adds line height, so that chip ends up a few pixels lower (and looks bigger) than its neighbours. In a row, use `RowControl` or an `HStack vAlign="center"`. A custom menu trigger (`DropdownMenu renderTrigger`) needs `className="inline-flex items-center leading-none"`. Text beside chips takes `hasCapsize` so its box hugs the letters.
- **Drag and drop (dnd-kit) stays.** Put `useDraggable` / `useDroppable` refs on a wrapper or handle, and keep Astryx components inside.
- **Badge vs Token:** `Badge` = a read-only state or category. `Token` = a chip you can click, link or remove. Badge has no gray tint; use `neutral`.
- **North is dark-only.** Astryx components and the mapped Tailwind names already give dark values. Don't add a theme toggle, light styles or `dark:` colour classes.
