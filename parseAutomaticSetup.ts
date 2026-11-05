import { isDeepStrictEqual } from 'node:util';
import { parseString } from '@fast-csv/parse';
import type { Browser } from 'puppeteer';
import { createEmptySetupData, createEmptyFile } from './automaticSetupDefaults';
import type { SetupData } from './automaticSetupDefaults';
export { createEmptySetupData } from './automaticSetupDefaults';
export type { SetupData } from './automaticSetupDefaults';

export type ImportInput = string | Buffer | Uint8Array;
export type CsvRecord = Record<string, string>;
type Value = string | boolean | number;
type ObjectData = Record<string, unknown>;

export type DeepPartial<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/** Each conflicting leaf is an array of distinct plain values. */
export type ConflictData<T> = [T] extends [Value | undefined]
  ? Exclude<T, undefined>[]
  : T extends Date
    ? T[]
    : T extends readonly (infer U)[]
      ? ConflictData<U>[]
      : T extends object
        ? { [K in keyof T]?: ConflictData<T[K]> }
        : T[];

export type SetupDraft = DeepPartial<SetupData>;
export type SetupConflictData = ConflictData<SetupData>;
export interface SetupProcessingResult {
  data: SetupData;
  conflicts: SetupConflictData;
  /** JSON-safe paths to actual values. Defaults are excluded from subsequent merges. */
  providedPaths: string[][];
}
export type SetupMergeInput =
  | SetupDraft
  | {
      data: SetupDraft;
      conflicts: SetupConflictData;
      /** Omitted for legacy sparse results, where every supplied value is considered present. */
      providedPaths?: string[][];
    };

export interface CsvProcessingOptions {
  /** Target slot in existing.branchSetups. No branch ID exists in the supplied type. */
  branchIndex?: number;
  languageOptions?: string[];
  countryByCode?: Record<string, string>;
  timezoneByLegacyKey?: Record<string, string>;
  confirmedBmwProfile?: boolean;
}
export interface HtmlProcessingOptions {
  browser: Browser;
  branchIndex?: number;
  timeoutMs?: number;
  /** For documents that initialize asynchronously after load. */
  waitForReady?: (page: import('puppeteer').Page) => Promise<unknown>;
}
export interface ParseOptions extends CsvProcessingOptions, HtmlProcessingOptions {}

function decode(input: ImportInput): string {
  return (typeof input === 'string' ? input : Buffer.from(input).toString('utf8')).replace(
    /^\uFEFF/,
    '',
  );
}
function object(value: unknown): value is ObjectData {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value instanceof Date) return new Date(value) as T;
  if (object(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) as T;
  return value;
}
function distinct(values: unknown[]): unknown[] {
  return values.filter(
    (value, index) => values.findIndex((other) => isDeepStrictEqual(value, other)) === index,
  );
}
function defaultValue(value: unknown): Value {
  if (typeof value === 'string') return '';
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return 0;
  throw new Error('Conflicts require string, boolean or number values');
}

interface NodeInput {
  data?: unknown;
  conflicts?: unknown;
}
interface NodeResult {
  data?: unknown;
  conflicts?: unknown;
}

/** Recursively merge all candidates at once; never compare intermediate default values. */
function mergeNode(nodes: NodeInput[], path: string): NodeResult {
  const present = nodes.filter((n) => n.data !== undefined || n.conflicts !== undefined);
  if (!present.length) return {};
  const values = present.map((n) => n.data).filter((v) => v !== undefined);
  if (values.every((v) => !object(v) && !Array.isArray(v))) {
    const candidates = distinct(
      present.flatMap((n) => {
        if (n.conflicts !== undefined) {
          if (!Array.isArray(n.conflicts) || n.conflicts.length < 2)
            throw new Error(`Invalid conflict history at ${path}`);
          return n.conflicts;
        }
        return n.data === undefined ? [] : [n.data];
      }),
    );
    if (!candidates.length) return {};
    if (candidates.some((v) => typeof v !== typeof candidates[0]))
      throw new Error(`Incompatible value types at ${path}`);
    const conflict = candidates.length > 1;
    const value = conflict ? defaultValue(candidates[0]) : copy(candidates[0]);
    return { data: value, ...(conflict ? { conflicts: copy(candidates) } : {}) };
  }

  const arrays = values.filter(Array.isArray);
  if (arrays.length) {
    if (arrays.length !== values.length) throw new Error(`Incompatible container types at ${path}`);
    const data: unknown[] = [];
    const conflicts: unknown[] = [];
    const length = Math.max(...arrays.map((a) => a.length));
    for (let index = 0; index < length; index++) {
      const merged = mergeNode(
        present.map((n) => ({
          data: Array.isArray(n.data) ? (n.data[index] ?? undefined) : undefined,
          conflicts: Array.isArray(n.conflicts) ? (n.conflicts[index] ?? undefined) : undefined,
        })),
        `${path}[${index}]`,
      );
      if (merged.data !== undefined) data[index] = merged.data;
      if (merged.conflicts !== undefined) conflicts[index] = merged.conflicts;
    }
    return { data, ...(conflicts.length ? { conflicts } : {}) };
  }

  if (values.some((v) => !object(v))) throw new Error(`Incompatible container types at ${path}`);
  const keys = new Set(
    present.flatMap((n) => [
      ...Object.keys(object(n.data) ? n.data : {}),
      ...Object.keys(object(n.conflicts) ? n.conflicts : {}),
    ]),
  );
  const data: ObjectData = {};
  const conflicts: ObjectData = {};
  for (const key of keys) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error(`Unsupported key at ${path}.${key}`);
    const merged = mergeNode(
      present.map((n) => ({
        data: object(n.data) ? n.data[key] : undefined,
        conflicts: object(n.conflicts) ? n.conflicts[key] : undefined,
      })),
      `${path}.${key}`,
    );
    if (merged.data !== undefined) data[key] = merged.data;
    if (merged.conflicts !== undefined) conflicts[key] = merged.conflicts;
  }
  return { data, ...(Object.keys(conflicts).length ? { conflicts } : {}) };
}

/**
 * Existing values participate equally, including explicit '', false and 0.
 * Pass the entire previous result to preserve conflict history and distinguish defaults
 * from actual values. Passing only result.data treats every default as an explicit value.
 * Array items are matched by index. Inputs are never mutated.
 */
export function mergeAutomaticSetup(
  existing: SetupMergeInput,
  ...processed: SetupMergeInput[]
): SetupProcessingResult {
  const nodes = [existing, ...processed].map((input): NodeInput => {
    if (!('data' in input && 'conflicts' in input)) return { data: input };
    const paths = input.providedPaths;
    return {
      data:
        paths === undefined
          ? input.data
          : selectProvided(input.data, new Set(paths.map((path) => JSON.stringify(path)))),
      conflicts: input.conflicts,
    };
  });
  const result = mergeNode(nodes, 'setup');
  const draft = (result.data ?? {}) as SetupDraft;
  const defaults = createEmptySetupData(Math.max(1, draft.branchSetups?.length ?? 0));
  defaults.files = Array.from({ length: draft.files?.length ?? 0 }, createEmptyFile);
  return {
    data: fillDefaults(defaults, draft) as SetupData,
    conflicts: (result.conflicts ?? {}) as SetupConflictData,
    providedPaths: collectProvidedPaths(draft).sort((a, b) => {
      const left = JSON.stringify(a);
      const right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    }),
  };
}

/** Fill only after resolving source values, so placeholders never become candidates. */
function fillDefaults(defaults: unknown, value: unknown): unknown {
  if (value === undefined || value === null) return copy(defaults);
  if (Array.isArray(defaults) && Array.isArray(value))
    return Array.from({ length: Math.max(defaults.length, value.length) }, (_, index) =>
      fillDefaults(defaults[index], value[index]),
    );
  if (object(defaults) && object(value))
    return Object.fromEntries(
      [...new Set([...Object.keys(defaults), ...Object.keys(value)])].map((key) => [
        key,
        fillDefaults(defaults[key], value[key]),
      ]),
    );
  return copy(value);
}

function collectProvidedPaths(value: unknown, path: string[] = []): string[][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) || object(value))
    return Object.entries(value).flatMap(([key, child]) =>
      collectProvidedPaths(child, [...path, key]),
    );
  return [path];
}

function selectProvided(value: unknown, paths: Set<string>, path: string[] = []): unknown {
  if (Array.isArray(value))
    return value.map((child, index) => selectProvided(child, paths, [...path, String(index)]));
  if (object(value))
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, selectProvided(child, paths, [...path, key])])
        .filter(([, child]) => child !== undefined),
    );
  return paths.has(JSON.stringify(path)) ? value : undefined;
}

function branchIndex(index = 0): number {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error('branchIndex must be a non-negative integer');
  return index;
}
function readCsv(input: ImportInput): Promise<CsvRecord[]> {
  return new Promise((resolve, reject) => {
    const records: CsvRecord[] = [];
    let hasHeaders = false;
    const stream = parseString<CsvRecord, CsvRecord>(decode(input), {
      headers: true,
      delimiter: ';',
      ignoreEmpty: true,
      strictColumnHandling: true,
    });
    stream.on('headers', (headers: string[]) => {
      hasHeaders = headers.includes('Interface');
      if (!hasHeaders) stream.destroy(new Error('Missing CSV Interface column'));
    });
    stream.on('data', (record) => records.push(record));
    stream.on('data-invalid', () => stream.destroy(new Error('Invalid CSV column count')));
    stream.on('error', reject);
    stream.on('end', () =>
      hasHeaders ? resolve(records) : reject(new Error('Missing CSV headers')),
    );
  });
}

/** Also accepts the already parsed JSON export, without reparsing CSV. */
export function processParsedCsv(
  records: readonly CsvRecord[],
  options: CsvProcessingOptions = {},
): SetupProcessingResult {
  const index = branchIndex(options.branchIndex);
  // Normalize source strings once; blank and masked cells leave the defaults untouched.
  const rows = records.map(
    (record) =>
      Object.fromEntries(
        Object.entries(record)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value !== '' && value !== '[MASKED]'),
      ) as CsvRecord,
  );
  const masters = rows.filter((record) => record.Interface === 'Branches');
  if (new Set(masters.map((record) => record.lBranchKey)).size > 1)
    throw new Error('Multiple branches: select one branch before processing');

  const profile: SetupProcessingResult = {
    data: createEmptySetupData(index + 1),
    conflicts: {},
    providedPaths: [],
  };
  if (options.confirmedBmwProfile === true) {
    profile.data.organizationSetup.general.bmw = true;
    profile.providedPaths.push(['organizationSetup', 'general', 'bmw']);
  }
  if (!masters.length) return profile;
  const key = masters[0].lBranchKey;
  if (!key) throw new Error('Missing legacy branch key');
  const wheels = rows.filter(
    (record) => record.Interface === 'External wheels' && record.lBranchKey === key,
  );
  if (new Set(wheels.map((record) => record.cFullServiceID)).size > 1)
    throw new Error('Multiple wheel services cannot fit one xWheels slot');

  const results: SetupProcessingResult[] = [];
  for (const record of rows) {
    if (
      record.lBranchKey !== key ||
      !['Branches', 'DMS parameters', 'External wheels'].includes(record.Interface)
    )
      continue;
    const result: SetupProcessingResult = {
      data: createEmptySetupData(index + 1),
      conflicts: {},
      providedPaths: [],
    };
    const branch = result.data.branchSetups[index];
    const paths = result.providedPaths;

    if (record.Interface === 'Branches') {
      if (record.cName !== undefined) {
        branch.general.name = record.cName;
        paths.push(['branchSetups', String(index), 'general', 'name']);
      }
      if (record.cDisplayName !== undefined) {
        branch.general.displayName = record.cDisplayName;
        paths.push(['branchSetups', String(index), 'general', 'displayName']);
      }
      if (record.cFirma !== undefined) {
        branch.general.firma = record.cFirma;
        paths.push(['branchSetups', String(index), 'general', 'firma']);
      }
      if (record.cPLZ !== undefined) {
        branch.general.zipCode = record.cPLZ;
        paths.push(['branchSetups', String(index), 'general', 'zipCode']);
      }
      if (record.cCity !== undefined) {
        branch.general.city = record.cCity;
        paths.push(['branchSetups', String(index), 'general', 'city']);
      }
      if (record.cCountryCode !== undefined) {
        branch.general.countryCode = record.cCountryCode;
        paths.push(['branchSetups', String(index), 'general', 'countryCode']);
      }
      if (record.cWebAddress !== undefined) {
        branch.general.webAddress = record.cWebAddress;
        paths.push(['branchSetups', String(index), 'general', 'webAddress']);
      }
      if (record.cEmail !== undefined) {
        branch.general.email = record.cEmail;
        paths.push(['branchSetups', String(index), 'general', 'email']);
      }
      if (record.cTel !== undefined) {
        branch.general.phone = record.cTel;
        paths.push(['branchSetups', String(index), 'general', 'phone']);
      }
      if (record.cOpeningHours !== undefined) {
        branch.general.openingHours = record.cOpeningHours;
        paths.push(['branchSetups', String(index), 'general', 'openingHours']);
      }
      if (record.cFirma !== undefined) {
        branch.dealerInfo.dealerName = record.cFirma;
        paths.push(['branchSetups', String(index), 'dealerInfo', 'dealerName']);
      }
      const country = options.countryByCode?.[record.cCountryCode]?.trim();
      if (country && country !== '[MASKED]') {
        branch.general.country = country;
        paths.push(['branchSetups', String(index), 'general', 'country']);
      }
      const timezone = options.timezoneByLegacyKey?.[record.lTZKey]?.trim();
      if (timezone && timezone !== '[MASKED]') {
        branch.general.timezone = timezone;
        paths.push(['branchSetups', String(index), 'general', 'timezone']);
      }
      if (record.cPreferredLangID && options.languageOptions?.includes(record.cPreferredLangID)) {
        branch.general.preferredLanguage = record.cPreferredLangID;
        paths.push(['branchSetups', String(index), 'general', 'preferredLanguage']);
      }
    }

    if (record.Interface === 'DMS parameters' && record.cValue !== undefined) {
      switch (record.cOptionID) {
        case 'DistributionPartnerNumber':
          branch.dealerInfo.dealerNumber = record.cValue;
          paths.push(['branchSetups', String(index), 'dealerInfo', 'dealerNumber']);
          break;
        case 'OutletNumber':
          branch.dealerInfo.outlerNumber = record.cValue;
          paths.push(['branchSetups', String(index), 'dealerInfo', 'outlerNumber']);
          break;
        case 'Firm':
          branch.dealerInfo.dmsCompanyNumber = record.cValue;
          paths.push(['branchSetups', String(index), 'dealerInfo', 'dmsCompanyNumber']);
          break;
        case 'Branch':
          branch.dealerInfo.dmsBranchNumber = record.cValue;
          paths.push(['branchSetups', String(index), 'dealerInfo', 'dmsBranchNumber']);
          break;
      }
    }

    if (record.Interface === 'External wheels') {
      const service = branch.externalServices.xWheels;
      if (/^4wheels_/i.test(record.cFullServiceID ?? '')) {
        service.handler = '4Wheels';
        paths.push(['branchSetups', String(index), 'externalServices', 'xWheels', 'handler']);
      }
      if (record.cValue !== undefined) {
        switch (record.cOptionID) {
          case 'Name':
            service.name = record.cValue;
            paths.push(['branchSetups', String(index), 'externalServices', 'xWheels', 'name']);
            break;
          case 'EndpointURL':
            service.baseUrl = record.cValue;
            paths.push(['branchSetups', String(index), 'externalServices', 'xWheels', 'baseUrl']);
            break;
          case 'DealerNumber':
            service.dealerNumber = record.cValue;
            paths.push([
              'branchSetups',
              String(index),
              'externalServices',
              'xWheels',
              'dealerNumber',
            ]);
            break;
          case 'QueryPackageSize':
            service.queryPackageSize = record.cValue;
            paths.push([
              'branchSetups',
              String(index),
              'externalServices',
              'xWheels',
              'queryPackageSize',
            ]);
            break;
          case 'Active':
            if (record.cValue === '0' || record.cValue === '1') {
              service.enabled = record.cValue === '1';
              paths.push(['branchSetups', String(index), 'externalServices', 'xWheels', 'enabled']);
            }
            break;
        }
      }
    }
    if (paths.length) results.push(result);
  }
  return mergeAutomaticSetup(profile, ...results);
}

export function processCsv(
  input: ImportInput,
  options: CsvProcessingOptions = {},
): Promise<SetupProcessingResult> {
  return readCsv(input).then((records) => processParsedCsv(records, options));
}

function mapHtml(fields: Record<string, string | boolean>, index: number): SetupProcessingResult {
  fields = Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== '' && value !== '[MASKED]'),
  );
  const result: SetupProcessingResult = {
    data: createEmptySetupData(index + 1),
    conflicts: {},
    providedPaths: [],
  };
  const organization = result.data.organizationSetup;
  const branch = result.data.branchSetups[index];
  const paths = result.providedPaths;
  if (typeof fields.organization_name === 'string') {
    organization.general.name = fields.organization_name;
    paths.push(['organizationSetup', 'general', 'name']);
  }
  if (typeof fields.world_name === 'string') {
    organization.general.worldName = fields.world_name;
    paths.push(['organizationSetup', 'general', 'worldName']);
  }
  if (typeof fields.dealer_name === 'string') {
    branch.general.firma = fields.dealer_name;
    paths.push(['branchSetups', String(index), 'general', 'firma']);
    branch.dealerInfo.dealerName = fields.dealer_name;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dealerName']);
  }
  if (typeof fields.dealer_number === 'string') {
    branch.dealerInfo.dealerNumber = fields.dealer_number;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dealerNumber']);
  }
  if (typeof fields.business_location_number === 'string') {
    branch.dealerInfo.outlerNumber = fields.business_location_number;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'outlerNumber']);
  }
  if (typeof fields.dms_name === 'string') {
    branch.dealerInfo.dms = fields.dms_name;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dms']);
  }
  if (typeof fields.dms_company === 'string') {
    branch.dealerInfo.dmsCompanyNumber = fields.dms_company;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dmsCompanyNumber']);
  }
  if (typeof fields.dms_branch === 'string') {
    branch.dealerInfo.dmsBranchNumber = fields.dms_branch;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dmsBranchNumber']);
  }
  if (typeof fields.dms_ip === 'string') {
    branch.dealerInfo.dmsIP = fields.dms_ip;
    paths.push(['branchSetups', String(index), 'dealerInfo', 'dmsIP']);
  }
  if (typeof fields.component_soft_drop === 'boolean') {
    organization.onlineComponents.softDrop = fields.component_soft_drop;
    paths.push(['organizationSetup', 'onlineComponents', 'softDrop']);
  }
  if (typeof fields.component_soft_drop_checkout === 'boolean') {
    organization.onlineComponents.softCheckout = fields.component_soft_drop_checkout;
    paths.push(['organizationSetup', 'onlineComponents', 'softCheckout']);
  }
  if (typeof fields.component_soft_chat === 'boolean') {
    organization.onlineComponents.softChat = fields.component_soft_chat;
    paths.push(['organizationSetup', 'onlineComponents', 'softChat']);
  }
  if (typeof fields.component_soft_confirm === 'boolean') {
    organization.onlineComponents.softConfirm = fields.component_soft_confirm;
    paths.push(['organizationSetup', 'onlineComponents', 'softConfirm']);
  }
  if (typeof fields.component_soft_analytics === 'boolean') {
    organization.onlineComponents.softAnalytics = fields.component_soft_analytics;
    paths.push(['organizationSetup', 'onlineComponents', 'softAnalytics']);
  }
  return result;
}

/** Reads the form state after the page has initialized. */
export function processHtml(
  input: ImportInput,
  options: HtmlProcessingOptions,
): Promise<SetupProcessingResult> {
  const index = branchIndex(options.branchIndex);
  return options.browser.newPage().then((page) => {
    const html = decode(input);
    return page
      .setContent(html, { waitUntil: 'load', timeout: options.timeoutMs ?? 30000 })
      .then(() => options.waitForReady?.(page))
      .then(() =>
        page.evaluate(() => {
          const fields: Record<string, string | boolean> = {};
          document
            .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
              'input[id], textarea[id], select[id]',
            )
            .forEach((element) => {
              if (element instanceof HTMLInputElement && element.type === 'checkbox') {
                fields[element.id] = element.checked;
              } else if (
                !(element instanceof HTMLInputElement && element.type === 'radio') ||
                element.checked
              ) {
                if (element.value.trim()) fields[element.id] = element.value.trim();
              }
            });
          return fields;
        }),
      )
      .then((fields) => mapHtml(fields, index))
      .finally(() => page.close());
  });
}

/** Convenience wrapper returning complete data, conflicts and source-presence metadata. */
export function parseAutomaticSetup(
  csv: ImportInput,
  html: ImportInput,
  options: ParseOptions,
  existing: SetupMergeInput = {},
): Promise<SetupProcessingResult> {
  return Promise.all([processCsv(csv, options), processHtml(html, options)]).then((results) =>
    mergeAutomaticSetup(existing, ...results),
  );
}
