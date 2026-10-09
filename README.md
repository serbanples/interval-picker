# Interval Picker

Framework-independent Lit Web Component for selecting fixed or relative date intervals.

## Build

```bash
npm install
npm run build
```

Import the generated `dist/interval-date-picker.js` module and use:

```html
<interval-date-picker mode="fixed" locale="en"></interval-date-picker>
```

Supports `mode`, `locale`, `week-start`, `value`, `adapter`, and `open` properties. Emits `range-change`, `mode-change`, and `picker-close` custom events.

For Angular 11, enable `CUSTOM_ELEMENTS_SCHEMA`. For Qwik, import the bundle on the client.

Initial implementation: not yet production tested.
