# Angular 11 demo

This app uses the existing Lit `<interval-date-picker>` Web Component, not an Angular rewrite.

## Build the Web Component (Node 20)

From the repository root:

```bash
nvm use 20
npm install
npm run build:angular-element
```

This generates `examples/angular11/src/assets/interval-picker.js` using esbuild. Angular 11 consumes the browser-ready bundle through the `scripts` setting in `angular.json`; its old TypeScript compiler does not need to compile Lit 3 source.

## Run Angular 11 (Node 14)

```bash
cd examples/angular11
nvm use 14
npm install
npm start
```

Open http://localhost:4200.

Angular CLI 11 is not compatible with the root project's Node 20 requirement. Use Node 14 for the demo's CLI.

## Integration

- `CUSTOM_ELEMENTS_SCHEMA` allows Angular to render the custom element.
- `@ViewChild` sets native custom-element properties, including complex `value`.
- Native `range-change`, `mode-change`, and `picker-close` events are subscribed and cleaned up in lifecycle hooks.
- The default date value format is `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`.

After changing the Lit source, rebuild the bundle from the repository root.
