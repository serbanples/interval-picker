# Angular 11 npm consumer

This Angular 11 example consumes the packaged Lit Web Component, without compiling its source.

## Once published to npm

```bash
cd examples/angular11
nvm use 14
npm install
npm start
```

Open http://localhost:4200.

The demo depends on `@serbanples/interval-picker@^0.1.0`. This version must exist on npm before a normal `npm install` works.

## Test locally before publishing

From the repository root, with Node 20:

```bash
npm install
npm run format
npm run build
npm pack
```

Copy the generated `serbanples-interval-picker-0.1.0.tgz` archive into the Angular project (or use its absolute path). In `examples/angular11/package.json`, temporarily replace the package dependency with:

```json
"@serbanples/interval-picker": "file:./serbanples-interval-picker-0.1.0.tgz"
```

Then use Node 14 to install and start Angular 11:

```bash
cd examples/angular11
nvm use 14
npm install
npm start
```

Angular CLI 11 loads `node_modules/@serbanples/interval-picker/dist/interval-picker.global.js` via the `scripts` array in `angular.json`. The bundle contains Lit and is compatible with the older Angular CLI toolchain. No copying generated files into the app's source tree is required.

## API

- `CUSTOM_ELEMENTS_SCHEMA` permits the `<interval-date-picker>` tag.
- `@ViewChild` accesses the element's JavaScript properties.
- Native `range-change`, `mode-change`, and `picker-close` events are subscribed and removed in Angular lifecycle hooks.
