# Angular 11 native picker demo

This example imports `@serbanples/angular-interval-picker` as an Angular module. It does not use Lit or custom elements.

First build the library:

```bash
cd projects/angular-interval-picker
nvm use 14
npm install
npm run build
```

Then run the demo:

```bash
cd ../../examples/angular11
npm install
npm start
```

The dependency is configured as `file:../../dist/angular-interval-picker` so it works without publishing to npm.
