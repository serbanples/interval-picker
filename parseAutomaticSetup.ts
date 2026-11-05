import { isDeepStrictEqual } from 'node:util';
import { parseString } from '@fast-csv/parse';
import type { Browser } from 'puppeteer';
import type { AutomaticSetupSessionData } from './AutomaticSetupSessionTypes';

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

export type SetupDraft = DeepPartial<AutomaticSetupSessionData>;
export type SetupConflictData = ConflictData<AutomaticSetupSessionData>;
export interface SetupProcessingResult {
  data: SetupDraft;
  conflicts: SetupConflictData;
}
export type SetupMergeInput = SetupDraft | SetupProcessingResult;

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
 * Pass the entire previous result to preserve unresolved conflict history.
 * Array items are matched by index. Inputs are never mutated.
 */
export function mergeAutomaticSetup(
  existing: SetupMergeInput,
  ...processed: SetupMergeInput[]
): SetupProcessingResult {
  const nodes = [existing, ...processed].map((input) =>
    'data' in input && 'conflicts' in input ? (input as SetupProcessingResult) : { data: input },
  );
  const result = mergeNode(nodes, 'setup');
  return {
    data: result.data as SetupDraft,
    conflicts: (result.conflicts ?? {}) as SetupConflictData,
  };
}

function branchIndex(index = 0): number {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error('branchIndex must be a non-negative integer');
  return index;
}
function text(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.trim() === '[MASKED]') return undefined;
  return value.trim();
}
function toggle(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
function set(target: ObjectData, path: string, value: unknown): void {
  if (value === undefined) return;
  const parts = path.split('.');
  let current = target;
  parts.slice(0, -1).forEach((key) => {
    if (!object(current[key])) current[key] = {};
    current = current[key] as ObjectData;
  });
  current[parts[parts.length - 1]] = value;
}
function branchDraft(branch: ObjectData, index: number): SetupDraft {
  const branchSetups: NonNullable<SetupDraft['branchSetups']> = [];
  if (Object.keys(branch).length) branchSetups[index] = branch;
  return branchSetups.length ? { branchSetups } : {};
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

const BRANCH_FIELDS = {
  cName: 'name',
  cDisplayName: 'displayName',
  cFirma: 'firma',
  cPLZ: 'zipCode',
  cCity: 'city',
  cCountryCode: 'countryCode',
  cWebAddress: 'webAddress',
  cEmail: 'email',
  cTel: 'phone',
  cOpeningHours: 'openingHours',
} as const;
const DMS_FIELDS = {
  DistributionPartnerNumber: 'dealerNumber',
  OutletNumber: 'outlerNumber',
  Firm: 'dmsCompanyNumber',
  Branch: 'dmsBranchNumber',
} as const;
const WHEEL_FIELDS = {
  Name: 'name',
  EndpointURL: 'baseUrl',
  DealerNumber: 'dealerNumber',
  QueryPackageSize: 'queryPackageSize',
} as const;

/** Also accepts the already parsed JSON export, without reparsing CSV. */
export function processParsedCsv(
  records: readonly CsvRecord[],
  options: CsvProcessingOptions = {},
): SetupProcessingResult {
  const index = branchIndex(options.branchIndex);
  const masters = records.filter((r) => r.Interface === 'Branches');
  const keys = new Set(masters.map((r) => r.lBranchKey));
  if (keys.size > 1) throw new Error('Multiple branches: select one branch before processing');
  const profile: SetupDraft =
    options.confirmedBmwProfile === true
      ? { organizationSetup: { general: { bmw: toggle(true) } } }
      : {};
  if (!masters.length) return { data: profile, conflicts: {} };
  const key = masters[0].lBranchKey;
  if (!key?.trim()) throw new Error('Missing legacy branch key');
  const drafts: SetupDraft[] = masters.map((master) => {
    const branch: ObjectData = {};
    Object.entries(BRANCH_FIELDS).forEach(([source, target]) =>
      set(branch, `general.${target}`, text(master[source])),
    );
    set(branch, 'general.country', text(options.countryByCode?.[master.cCountryCode?.trim()]));
    set(branch, 'general.timezone', text(options.timezoneByLegacyKey?.[master.lTZKey?.trim()]));
    set(branch, 'dealerInfo.dealerName', text(master.cFirma));
    const language = master.cPreferredLangID?.trim();
    if (language && options.languageOptions?.includes(language)) {
      set(branch, 'general.preferredLanguage', language);
    }
    return branchDraft(branch, index);
  });
  const wheels = records.filter((r) => r.Interface === 'External wheels' && r.lBranchKey === key);
  if (new Set(wheels.map((r) => r.cFullServiceID)).size > 1)
    throw new Error('Multiple wheel services cannot fit one xWheels slot');
  records
    .filter((r) => r.lBranchKey === key)
    .forEach((record) => {
      const branch: ObjectData = {};
      if (record.Interface === 'DMS parameters') {
        const target = Object.prototype.hasOwnProperty.call(DMS_FIELDS, record.cOptionID)
          ? DMS_FIELDS[record.cOptionID as keyof typeof DMS_FIELDS]
          : undefined;
        if (target) set(branch, `dealerInfo.${target}`, text(record.cValue));
      }
      if (record.Interface === 'External wheels') {
        const target = Object.prototype.hasOwnProperty.call(WHEEL_FIELDS, record.cOptionID)
          ? WHEEL_FIELDS[record.cOptionID as keyof typeof WHEEL_FIELDS]
          : undefined;
        if (target) set(branch, `externalServices.xWheels.${target}`, text(record.cValue));
        if (/^4wheels_/i.test(record.cFullServiceID))
          set(branch, 'externalServices.xWheels.handler', text('4Wheels'));
        if (record.cOptionID === 'Active' && ['0', '1'].includes(record.cValue)) {
          set(branch, 'externalServices.xWheels.enabled', toggle(record.cValue === '1'));
        }
      }
      drafts.push(branchDraft(branch, index));
    });
  return mergeAutomaticSetup(profile, ...drafts);
}

export function processCsv(
  input: ImportInput,
  options: CsvProcessingOptions = {},
): Promise<SetupProcessingResult> {
  return readCsv(input).then((records) => processParsedCsv(records, options));
}

const HTML_FIELDS = {
  dealer_name: ['general.firma', 'dealerInfo.dealerName'],
  dealer_number: ['dealerInfo.dealerNumber'],
  business_location_number: ['dealerInfo.outlerNumber'],
  dms_name: ['dealerInfo.dms'],
  dms_company: ['dealerInfo.dmsCompanyNumber'],
  dms_branch: ['dealerInfo.dmsBranchNumber'],
  dms_ip: ['dealerInfo.dmsIP'],
} as const;
const ONLINE_FIELDS = {
  component_soft_drop: 'softDrop',
  component_soft_drop_checkout: 'softCheckout',
  component_soft_chat: 'softChat',
  component_soft_confirm: 'softConfirm',
  component_soft_analytics: 'softAnalytics',
} as const;
function mapHtml(fields: ObjectData, index: number): SetupDraft {
  const organization: ObjectData = {};
  set(organization, 'general.name', text(fields.organization_name));
  set(organization, 'general.worldName', text(fields.world_name));
  Object.entries(ONLINE_FIELDS).forEach(([source, target]) =>
    set(organization, `onlineComponents.${target}`, toggle(fields[source])),
  );
  const branch: ObjectData = {};
  Object.entries(HTML_FIELDS).forEach(([source, targets]) =>
    targets.forEach((target) => set(branch, target, text(fields[source]))),
  );
  return {
    ...(Object.keys(organization).length ? { organizationSetup: organization } : {}),
    ...branchDraft(branch, index),
  };
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
      .then((fields) => ({ data: mapHtml(fields, index), conflicts: {} }))
      .finally(() => page.close());
  });
}

/** Convenience wrapper. The return value is now { data, conflicts }. */
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
