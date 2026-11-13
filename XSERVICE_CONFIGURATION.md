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

## BMW linkage after HTML/CSV processing

The trigger is now the **resolved branch DMS value**, not a manual BMW toggle:

```ts
branch.BranchDetails.DealerInformation?.DMS?.trim() === 'formel1'
```

`AutomaticSetupParser.applyHtml` and `applyCsv` call `finalizeImport()` after their
source assignments and conflict handling. Their asynchronous `processHtml` and
`processCsv` wrappers therefore return the linked data too. CSV DMS parameters
support the explicit option `cOptionID: 'DMS', cValue: 'formel1'`; HTML uses its
existing `dms_name` mapping. No service handler or BMW flag is used to infer DMS.
A conflicting DMS that resolves to `''` does not activate BMW linkage.

Only matching branches receive the BMW branch settings, services and ATBAS setup.
If any branch matches, the organization BMW flag, the seven interface flags and
all organization settings in `bmwOrganizationSettings` are applied. `xPoolOpType`,
wheel storage and rental are not added by this BMW profile.

`BmwLinkageTracker` restores prior derived values before the next source import,
while retaining later explicit edits. This keeps derived names, flags, endpoints
and settings out of source conflict tracking. If a later HTML/CSV file introduces
a DMS conflict, BMW values generated earlier in the same parser session are removed.
The tracker belongs to that parser instance; it is not a persisted migration or a
reverse-BMW operation on previously saved sessions.

A manually added branch gets the usual organization defaults. It receives the BMW
profile only when `finalizeImport()` sees its own DMS as `formel1`. A manual BMW flag
alone does not apply the profile. The older alternative parsers in this repository
are retained as historical snippets; this linkage is wired into the latest simple parser.

### Profile data and remaining application inputs

`applyBmwLinkage.ts` includes the complete organization/branch settings checklist,
service names, config booleans, URLs and logical handler parameters. Existing string
boolean settings retain their representation; missing settings use actual booleans.
Full nested `serviceConfig`/`handlerConfig` representations are updated alongside
flat import fields so stale nested values cannot override the profile.

The supplied backend enum spellings are authoritative:

| Checklist spelling | Backend value used |
| --- | --- |
| `ispa5order` | `ispa5orders` |
| `ispa5partsAvailability` | `ispa5PartsAvailability` |
| `bmwCarDataReadings` | `BMWKeyReadings` |

`SERVICECASE_HEADER_BUSINESSCONTEXTv` is retained literally, including the trailing
`v`, because no backend parameter definition was supplied to justify changing it.

Configure deployment-specific values before processing:

```ts
parser.bmwLinkageOptions = {
    catalogHttpHeader: configuredCatalogHttpHeader,
    atbasBaseUrl: completeAtbasUrl,
    atbasAuthentication: configuredBasicAuthentication,
};

return parser.processCsv(csv).then(() => parser.processHtml(html)).then(data => {
    // These are editable validation issues, not fabricated endpoint/credential defaults.
    const issues = parser.bmwLinkageResult.issues;
    return { data, issues };
});
```

The specification's ATBAS URL ends in `notifyAp…` and cannot be reconstructed.
The catalog entry `application soft-planning` does not unambiguously specify a
header name/value. Those inputs, a valid DMS IP/host, and the actual Basic auth
object are exposed as issues when missing. The username intention is `softplanning`;
no password is invented. `createAtbasSchema()` supplies its import/UI schema.

### Creation adapters

In addition to the existing defaults/legacy handler adapters, BMW creation requires:

- `resolveBmwSelection(key, selection, handlerConfig)`: resolve User/Type dropdown
  intentions to actual configured options and authentication. `selectBmwOption`
  supports unique ISPA5 matching, exact user labels, and the price-information
  fallback. Missing or ambiguous options throw rather than picking an arbitrary one.
- `resolveHandlerParameters(key, parameters, currentHeaders)`: upsert `LANGUAGE`,
  AWP auth-header parameters and order flags into the actual backend `HttpHeader`
  structure. Logical parameters are kept in `section.handlerParameters` until then.
- `writer.createAtbas(context, setup, organizationId, branchId)`: persist the separate
  ATBAS integration, which has no member in the supplied external-service enum.

The resolver cannot override the linked BMW endpoint. Profile HTTP headers and
encoded handler parameters are preserved in the created payload. If the exact
catalog header is supplied only at creation, use `catalogApplicationHeader` in the
build options. Complete ATBAS URL/authentication and all required adapters are
checked before any service writes. ATBAS is written after external services are
published; the returned array still contains external-service documents only.
The real ATBAS backend type/API was not supplied, so its adapter receives the typed
setup and performs the application-specific mapping.

These are application adapter boundaries, not guessed backend account IDs, header
formats or ATBAS document fields. The consuming backend build and BZL wiring are
still required outside this snippets repository.
