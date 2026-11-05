# Automatic setup import

`processCsv`, `processParsedCsv`, `processHtml`, and `mergeAutomaticSetup` return:

```ts
interface SetupProcessingResult {
  data: SetupData;
  conflicts: SetupConflictData;
  providedPaths: string[][];
}
```

`data` always includes all declared organization fields and complete branch objects,
including dealer information and every external service. Missing strings are `''`
and missing booleans are `false`. `files` defaults to `[]`; settings default to `{}`
because the supplied schema declares no settings keys. No metadata is invented:
`createdAt` is `''` until supplied. `SetupData` allows this empty timestamp and an
empty file type for partial existing file metadata; the original persisted-session
type remains unchanged.

There is one empty branch by default. With `branchIndex: n`, every slot through `n`
is initialized with a complete branch, and the imported values go into slot `n`.
Each branch and service is a separate object.

The processors start with `createEmptySetupData(branchCount)` and assign values directly
to its fields. Use your existing defaults factory at this import boundary; it must return
fresh objects and initialize the requested number of branches. No path setter or row-value
conversion is used. Source strings are trimmed once before mapping, and blank or masked
values leave the defaults untouched. Presence paths are recorded alongside assignments
so actual `false` values still participate in conflicts.

```ts
Promise.all([
  processCsv(csvBuffer),
  processHtml(htmlBuffer, { browser }),
]).then(([csvResult, htmlResult]) => {
  const result = mergeAutomaticSetup(existingSession, csvResult, htmlResult);
  return result;
});
```

Pass the **whole result** into subsequent merges and persist it if you need to merge
again. `providedPaths` records actual source values as arrays of path segments; it
survives JSON serialization. Generated defaults do not overwrite existing values
or cause conflicts. Explicit existing `''`, `false`, and `0` still participate in
conflicts, as do actual imported `false` values. Passing just `result.data` treats
every field, including defaults, as explicitly supplied.

Conflicts retain the same nested structure, with arrays of distinct values at
conflicting leaves. Conflicting values reset to `''`, `false`, or `0` by type.
Prior conflict history remains available when merging complete results.

CSV accepts buffers using `@fast-csv/parse`; HTML accepts buffers using the supplied
Puppeteer browser and reads form state from the DOM. No embedded-script data is
parsed. Invalid CSV and browser failures still reject rather than returning an
empty success result.

The regression tests in `automaticSetup.test.ts` use Node's test runner. Compile
them together with the parser in the consuming TypeScript project, then run
`node --test <output-directory>/automaticSetup.test.js`. That project must provide
the original `@nrg/datetime` and `with_id` types, plus the parser dependencies.
The HTML test mocks Puppeteer's page boundary; it is not a Chromium integration test.
