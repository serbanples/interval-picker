# Interval Picker

Reusable Lit 3 date-range picker and standalone calendar, distributed as an npm package.

## Install

```bash
npm install @serbanples/interval-picker
```

> The package must first be published to npm under the `@serbanples` scope. This repository configuration does not publish it automatically.

## Angular 11

Angular 11's older build tooling can load the **prebundled browser script** without compiling Lit 3 or its TypeScript definitions.

In `angular.json`:

```json
{
  "scripts": ["node_modules/@serbanples/interval-picker/dist/interval-picker.global.js"]
}
```

Add `CUSTOM_ELEMENTS_SCHEMA` to your Angular module:

```ts
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}
```

Use the custom element in your template:

```html
<interval-date-picker #picker mode="fixed" locale="en"></interval-date-picker>
```

Use `@ViewChild('picker')` to set JavaScript properties such as `value`, `adapter`, and `weekStart`, and `addEventListener('range-change', ...)` for native custom events. See `examples/angular11` for a full application.

## Modern bundlers

```ts
import '@serbanples/interval-picker';
import { isoAdapter } from '@serbanples/interval-picker';
import '@serbanples/interval-picker/calendar';
```

The calendar subpath can be imported independently if you only need `<interval-calendar>`.

## Build and publish

Use Node.js 20 for package development.

```bash
npm install
npm run format
npm run format:check
npm run check
npm run build
npm run pack:check
npm pack
```

The build creates ESM and CommonJS bundles, a browser-ready global bundle, and TypeScript declarations in `dist/`. `npm pack` creates a local `.tgz` package that can be installed into a test application.

To publish, first ensure you own the `@serbanples` scope, are authenticated with npm (`npm login`), and have incremented the package version:

```bash
npm publish --access public
```

The `prepack` script rebuilds the package automatically. Publishing is not performed by this repository change.

## API

The picker supports `mode`, `locale`, `week-start`, `value`, `adapter`, `preset`, and `open`. It emits `range-change`, `mode-change`, and `picker-close` custom events.

The default ISO date range is `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`.

See `DEVELOPMENT_CONTEXT.md` for architecture and known limitations.
