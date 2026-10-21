# Native Angular 11 interval picker

This branch contains a complete Angular 11 implementation independent of the Lit Web Component.

## Structure

- `projects/angular-interval-picker/src/lib/interval-calendar.component.*`: reusable standalone calendar with month navigation, hover and date-selection outputs.
- `projects/angular-interval-picker/src/lib/interval-date-picker.component.*`: interval selection, relative presets, two-month coordination, and outputs.
- `projects/angular-interval-picker/src/lib/date-utils.ts`: date arithmetic, presets and adapters.
- `projects/angular-interval-picker/src/lib/interval-picker.module.ts`: exported Angular module.
- `projects/angular-interval-picker/src/public-api.ts`: npm public API.
- `examples/angular11/`: Angular 11 consumer app importing the library as an npm dependency.

## Build and test locally

Use Node 14 with Angular 11. The library has its own dependencies to avoid conflicting with the root Lit project's TypeScript 5 toolchain.

```bash
cd projects/angular-interval-picker
nvm use 14
npm install
npm run format
npm run format:check
npm run build
```

The build creates `dist/angular-interval-picker` at the repository root.

Then run the Angular 11 demo:

```bash
cd ../../examples/angular11
npm install
npm start
```

The demo installs the local built package through `file:../../dist/angular-interval-picker`. Build the library **before** installing the demo.

## Install after npm publication

```bash
npm install @serbanples/angular-interval-picker
```

In your Angular module:

```ts
import { IntervalPickerModule } from '@serbanples/angular-interval-picker';

@NgModule({
  imports: [IntervalPickerModule],
})
export class AppModule {}
```

In your component template:

```html
<interval-date-picker
  [mode]="mode"
  [locale]="locale"
  [weekStart]="weekStart"
  [value]="range"
  (rangeChange)="onRangeChange($event)"
></interval-date-picker>
```

The component outputs `rangeChange` with `{ mode, value, preset }`, `modeChange` with the new mode, and `pickerClose` when closed. It accepts a `DateAdapter<T>` for custom value formats; the default adapter uses ISO `YYYY-MM-DD` strings.

`<interval-calendar>` can be used independently when you import `IntervalPickerModule`.

## Publishing

From `projects/angular-interval-picker`, after successful build:

```bash
cd ../../dist/angular-interval-picker
npm pack --dry-run
npm publish --access public
```

You must own the `@serbanples` npm scope and authenticate with npm. No publish has been performed.

## Behavior preserved

Fixed and relative modes, twelve relative presets, localized English/German preset labels, configurable Monday/Sunday week start, forward-only hover previews, two independently navigable months that cannot overlap, a save action, and date adapter serialization.

**Validation status:** Code is committed, but npm installation, ng-packagr, Prettier and Angular CLI builds have not been executed in this environment. Run the commands above before publishing.
