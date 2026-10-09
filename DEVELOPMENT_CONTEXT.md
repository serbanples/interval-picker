# Interval Picker — Development Context

> Maintainer/AI handoff document. Updated 2026-10-09. Keep this document current when changing behavior or architecture.

## Project and goal

- Repository: https://github.com/serbanples/interval-picker
- Current development branch: `feat/initial-implementation` (PR #1 into `main`).
- Goal: one framework-independent interval/date-range picker usable in Angular 11, Qwik, and other browser frameworks without duplicating the UI implementation.
- Technology: Lit 3, TypeScript, native Custom Elements/Shadow DOM, Vite 5 for the local playground, Node.js 20 for development/builds.
- Custom element tag: `<interval-date-picker>`.
- Initial design was based on a provided screenshot, with Relative and Fixed tabs, two calendars, interval highlighting, and action buttons.

## Repository files

- `src/interval-date-picker.ts`: Lit component, reactive state, event dispatching, and calendar rendering; re-exports public types and ISO adapter for backwards compatibility.
- `src/types.ts`: shared public TypeScript types and adapter interface.
- `src/date-adapters.ts`: default ISO date adapter.
- `src/date-utils.ts`: reusable calendar date arithmetic and comparisons.
- `src/presets.ts`: relative interval presets and translated labels.
- `src/picker-styles.ts`: component Shadow DOM CSS.
- `test.html`: interactive standalone playground for visual and behavioral testing.
- `package.json`: dependencies and scripts (`dev`, `check`, `build`).
- `tsconfig.json`: ES2020 browser build, Bundler module resolution, declarations, decorators, strict checking; `types: []` and `skipLibCheck: true` to isolate browser code from ambient Node type conflicts.
- `.nvmrc`: Node 20.
- `.github/workflows/node20.yml`: install, type-check, and build on Node 20.
- `README.md`: basic setup and usage.

## Run locally

```bash
git checkout feat/initial-implementation
nvm use 20
npm install
npm run check
npm run build
npm run dev
```

Open `http://localhost:5173/test.html`. Vite loads the TypeScript source directly for development; the production build uses `tsc`.

## Public API currently implemented

- `mode: 'fixed' | 'relative'` (default `fixed`).
- `locale` (default `en`; English and German preset labels provided).
- `week-start: 'monday' | 'sunday'` (default `monday`).
- `open: boolean` (default true).
- `value: Range<unknown> | null` as a JS property (not JSON string attribute).
- `adapter: DateAdapter<unknown>` as a JS property.
- `preset` default `thisWeek`.
- `DateAdapter<T>` interface: `parse(value: T): Date` and `serialize(date: Date): T`. Built-in `isoAdapter` serializes local calendar dates as YYYY-MM-DD.
- Events are bubbling and composed: `range-change` with `{mode, value, preset}`, `mode-change` with `{mode}`, and `picker-close`.
- Styles use Shadow DOM and CSS custom properties `--picker-accent` and `--picker-range`.

## Relative mode

Presets: yesterday/today/tomorrow; last/this/next week; last/this/next month; last/this/next year. Clicking a preset computes the corresponding inclusive date interval and immediately emits `range-change`. The week-based presets currently assume Monday as week start independently of the configurable calendar weekday header; consider aligning these.

## Fixed mode and calendar behavior

- Two calendars are rendered, each with previous and next arrows.
- The left month (`visibleMonth`) and right month (`rightMonth`) are separate reactive state values.
- Navigation keeps the right calendar **at least one month after** the left:
  - Left moves earlier: right stays put.
  - Left moves forward to or beyond right: right advances to one month after left.
  - Right moves later: left stays put.
  - Right moves backward to or before left: left moves to one month before right.
  - Example October/November -> move right forward: October/December; move right backward from October/November: September/October.
- First day click begins a new range (`selectingEnd=true`).
- Hovering/focusing a day **on or after the selected start date** previews a highlighted interval. Hovering an earlier date does not preview a range, matching the existing end-date selection constraint. Preview works across visible months and clears when leaving the calendars.
- Second day click completes the range. **Current implementation clamps an end date earlier than the start to the start**; this is a known behavior to revisit if reverse range selection is desired.
- Completed range stays highlighted. Save commits `value` through the configured adapter and emits `range-change`.
- Close hides the component and emits `picker-close`.
- Summary below calendars shows the draft interval.

## Test playground

`test.html` includes controls for mode, language, week start, opening/closing, reset, and a JSON event output panel. Use it to inspect hover preview, cross-month selections, navigation constraints, and emitted events.

## Integration notes

- Angular 11: register the JS bundle once; add `CUSTOM_ELEMENTS_SCHEMA` to the Angular module; consume native custom events.
- Qwik: load/register the element on the client; integrate native custom events with Qwik handlers.
- A typed wrapper and proper framework integration tests have not yet been implemented.

## Known limitations / follow-ups

1. Build and browser interactions have **not been independently verified** in this chat. Run CI and manual checks before merging/publishing.
2. Date math, presets, adapter, types, and styles have been extracted. Calendar rendering remains inside the Lit component; consider splitting it further if it grows.
3. Accessibility: full keyboard navigation, focus management, ARIA range semantics, and screen-reader behavior need work.
4. Date boundaries: min/max dates, disabled days, configurable presets, and validation are not implemented.
5. Adapter typing uses `unknown` on the custom element; typed wrappers could improve ergonomics.
6. The current `syncDraft()` reacts to `value` updates and resets visible months to the selected start month. Consider whether saving should preserve navigated months.
7. Reset in `test.html` sets `value=null`, but `syncDraft()` does not explicitly clear `draft` for null values; verify and fix if needed.
8. Weekday labels use a hard-coded reference week (October 2026) to generate localized names. Refactor to a clearer reference-date helper.
9. No npm release workflow, lockfile, or production distribution packaging has been established.
10. The component renders inline; popup positioning/triggering remains the host application's responsibility.

## Development conventions

- Preserve framework independence and native DOM event contracts.
- Keep date math local-date based unless explicitly introducing timezone semantics.
- Maintain left/right month separation and non-overlap when changing navigation.
- Preview must not commit values or emit `range-change` until selection is finalized and saved.
- Prefer adding tests for navigation edge cases, hover preview, adapter serialization, and preset boundaries.
- Update this document when implementing features or changing public API.

## Formatting convention
- Prettier 3 is configured in `.prettierrc.json`.
- Before future code commits run `npm run format`, then `npm run format:check`.
- GitHub Actions has a formatter workflow for the feature branch; do not assume it has run without checking the workflow status.
