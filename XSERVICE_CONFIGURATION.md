# xService setup and creation

This branch extends `csv-parse` and its latest `automaticSetupParser.simple.ts`.
The repository contains integration snippets, not the Django/NRG backend application.
No checked-in `AutomaticSetupSessionBzl`, `_createDmsServices`, or `_createWheelsService`
was available to edit. `createExternalServices.ts` supplies their consolidated
replacement; the application must connect it to its existing external-service BZL.

## Files

- `xServiceSetupTypes.ts`: backend-derived config types, flat import options,
  full `serviceConfig`/`handlerConfig`, certificates, mappings and arrays.
- `AutomaticSetupSessionTypes.ts`: extends the application's original DTO/schema
  while retaining non-service fields. Import this extension in the consuming setup
  flow, or merge its `BranchXServices` fields into the original declarations.
- `xServiceDefaults.ts`: fresh editing defaults for all eleven backend service types.
- `xServiceSchemas.ts`: UI schemas and nested/array validation with stable error indexes.
- `createBranch.ts`: initializes new service fields and inherits organization flags.
- `automaticSetupParser.simple.ts`: adds `setBranchXService`, including structured
  config assignment and conflict tracking by array index.
- `createExternalServices.ts`: pure payload mapping and sequential create/publish.

The import aliases remain `xClient` -> `xClientCar`, `xWheels` -> `xStorage`.
The rental organization flag is `xRent`, with `xRentProvider` accepted for older data.
The DTO extension adds optional `xOrderTTS` to organization flags as well as its
branch configuration; the original backend DTO does not declare that flag.

## Configuration

Service-specific fields can stay flat so existing forms and CSV mappings retain
their paths. `serviceConfig`, when supplied, overrides the matching flat fields.
For example:

```ts
parser.setBranchXService(branch, 'xOrder', {
    enabled: true,
    name: 'DMS orders',
    handler: xOrderHandlerEnum.ispa5orders,
    baseURL: 'https://dms.example',
    autoSyncOrder: true,
    statusMapping: [{ orderStatus: 'OPEN', appointmentStatus: 'scheduled' }],
    createOrUpdateBasedOnStatuses: true,
    createOrderBasedOnStatuses: ['scheduled'],
});
```

`enableText` is accepted for older client imports and converted to backend
`textEnable`; an explicit `textEnable` wins. `authentication` now uses the real
`HttpAuthentication` type, rather than a string. Branch initialization removes
legacy empty-string authentication defaults. Nonempty legacy strings must be
converted using the application's authentication format before creation.

The schema adds `object` and `array` nodes to the original primitive row shape.
Use `validateXServiceSchema(section, schemas[key])` for each present service,
skipping absent optional objects. A primitive-only validator cannot handle these
new nodes. `createXServiceSchemas(overrides)` accepts authoritative nested schemas
for application types whose fields were not provided: authentication, certificates,
headers, mandatory fields and specialized provider configs. Their default nodes
validate the container shape without inventing fields. Business rules such as
allowed auto-select policies or positive timing limits belong in the validator.

Arrays are matched by index in the parser's conflict tracker. A different value
at an existing array leaf becomes a conflict; these setters do not implement
whole-array replacement or deletion. Input objects are read without mutation.

## Replace the service-creation loops

Call the consolidated creator once per newly created backend branch. The writer
interface matches the existing create/publish sequence and accepts native promises
or Bluebird thenables. Bind methods through closures to preserve their receivers:

```ts
import { createExternalServices } from './createExternalServices';

// In the existing branch-creation promise chain:
return createExternalServices(
    {
        create: (context, payload) => externalServiceBzl.create(context, payload),
        publishOnBranches: (context, serviceIds, branchIds) =>
            externalServiceBzl.publishOnBranches(context, serviceIds, branchIds),
    },
    accesscontext,
    branchSetup.BranchDetails,
    organization._id,
    branch._id,
    {
        // Adapter around the application's existing service/handler defaults factory.
        getDefaults: (key, handler) => getExistingServiceDefaults(key, handler),
        // Keep the existing dmsServiceHeaders / 4Wheels / proxy mapping here.
        // Return the final handlerConfig, preserving explicit config values.
        resolveLegacyHandler: (key, section, handler, config) =>
            applyExistingHandlerParameters(key, section, handler, config),
    },
);
```

`getExistingServiceDefaults` and `applyExistingHandlerParameters` above are
application integration adapters, not exports from this repository. Their exact
source and default-factory API were not available. `resolveLegacyHandler` is
required whenever populated dealer/DMS, proxy, wheel credentials or package-size
fields need mapping: the converter rejects those values instead of dropping them
or guessing their header names. Sections containing only native backend config
can omit it.

The converter copies the final authentication, parameter headers, HTTP headers,
brand/mandatory-field mappings, key-reader bindings, certificate data and extraData.
It does not copy factory IDs, versions or certificate identity into new services.
Factory handler defaults are retained. To explicitly clear a factory header array,
supply `handlerConfig: { baseURL: '...', headers: [] }`.

Absent/disabled editing placeholders are skipped. Use `includeDisabled: true`
only when disabled service documents should also be created. Payload validation
for the whole branch runs before the first write. Writes then run sequentially;
a create or publish failure rejects and stops later writes. Earlier successful
writes are not rolled back; retain the application's existing transaction/retry
policy at that boundary.

## Definitions not supplied

`xPriceInformationConfig`, `xRentProviderConfig`, `HandlerConfigEuromobil`,
`HttpAuthentication`, `HttpHeader`, certificate and mandatory-field definitions
are imported from the application's real backend types rather than redefined.
Price and rental creation require complete `serviceConfig` or backend factory
defaults. Vamoso/Euromobil require complete provider `handlerConfig`; Vamoso's
`baseUrl` and its `{ key, value }[]` extraData remain untouched. TTS requires an
explicit handler and backend defaults that confirm the type/handler combination.
The converter does not assume that TTS uses the ordinary order configuration.

Zero/false/empty-array values are empty editing defaults, not operational timing
recommendations. Review them through the normal setup validation before creation.

## Checks

Run `npm test` with Node 24+ (the harness uses native TypeScript stripping).
The production helpers use APIs available in Node 20; no production dependencies
were added. Tests cover mapping, configuration precedence, clone isolation,
legacy adapters, absent/disabled services, provider/TTS requirements, stable array
error indexes, branch inheritance, parser conflicts, write order and failures.
CSV/browser/factory IO is mocked only at the test boundary and must not execute.

The core modules can also be checked against the supplied contract subset:

```sh
npx -p typescript@5.7.3 tsc --noEmit --strict --target es2022 --module commonjs --skipLibCheck test/backend-contract.d.ts xServiceSetupTypes.ts xServiceDefaults.ts createExternalServices.ts xServiceSchemas.ts
```

The fixture deliberately keeps unavailable backend types opaque. It is test-only;
do not include it in an application build. This check is not a substitute for
compiling against the actual backend barrel, settings types and BZL implementation.
