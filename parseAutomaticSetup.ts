/**
 * Dependencies: npm install fast-csv@5 puppeteer
 * Change the type import below to the location of your existing types.
 *
 * Usage:
 * const state = createSetupImportState(originalData);
 * processSetupFile({ path: 'input.html', type: 'HTML' }, state)
 *   .then(() => processSetupFile({ path: 'input.csv', type: 'CSV' }, state))
 *   .then(({ data, conflicts }) => { console.log(data, conflicts) });
 *
 * Preserve the WHOLE state between calls, including assigned. The original data
 * object is mutated; provide a clone if you want to preserve it. Calls must be
 * sequential. This module does not resolve conflicts; once conflicted, a field
 * stays empty and accumulates distinct source values.
 *
 * Empty source strings are ignored. Initial '', false and 0 are empty defaults.
 * If initial false/0 is a deliberate answer, pass its dotted path through
 * precompletedPaths. Imported false/0 is always recorded as a supplied value.
 *
 * Supply all mapped nested objects and primitive defaults for the target branch.
 * No inferred names, country/language/timezone normalization, URL construction,
 * handler selection, credentials, settings, createdAt or files metadata is added.
 * Shared DMS values populate the eight DMS interface blocks but never enable them.
 * DMSCompanyName remains untouched: the sources supply a number, not a name.
 * CSV cCounty and lTZKey remain raw strings in country and timezone respectively.
 *
 * For multiple CSV branches, call once per csvBranchKey with its target branchIndex.
 * For multiple wheel providers, select wheelServiceId explicitly (the type has one
 * xWheels slot). HTML always targets the specified branchIndex, defaulting to zero.
 */
import { readFile } from 'node:fs/promises';
import { parseString } from 'fast-csv';
import puppeteer, { Browser } from 'puppeteer';
import type { AutomaticSetupSessionData } from './AutomaticSetupSessionTypes';

/** Like DeepPartial, but primitive leaves contain the distinct conflicting values. */
export type DeepConflicts<T> =
    NonNullable<T> extends string | number | boolean ? Array<NonNullable<T>> :
    NonNullable<T> extends ReadonlyArray<infer U> ? Partial<Record<number, DeepConflicts<U>>> :
    { [K in keyof T]?: DeepConflicts<T[K]> };

type Primitive = string | number | boolean;
type Assignment = { path: string; value: Primitive };
type CsvRow = Record<string, string>;

export interface SetupImportState {
    /** The same object passed to createSetupImportState; modified in place. */
    data: AutomaticSetupSessionData;
    conflicts: DeepConflicts<AutomaticSetupSessionData>;
    /** Keep this alongside data/conflicts between calls (also JSON serializable). */
    assigned: Record<string, true>;
}

export interface ImportOptions {
    /** Optional existing browser. Only the temporary page is closed when supplied. */
    browser?: Browser;
    /** Target branch must already exist in the supplied default object. */
    branchIndex?: number;
    /** Required when the CSV contains more than one branch. */
    csvBranchKey?: string;
    /** Required if the selected CSV branch contains multiple wheel providers. */
    wheelServiceId?: string;
    delimiter?: string;
}

const dmsInterfaces = [
    'xClient', 'xAdditionalInfo', 'xPoolOpType', 'xOrder', 'xCatalog',
    'xPartsAvailability', 'xPriceInformation', 'xCarDataReadings',
];

const branchColumns: Record<string, string> = {
    cName: 'name', cDisplayName: 'displayName', cFirma: 'firma',
    cPLZ: 'zipCode', cCity: 'city', cCounty: 'country', cCountryCode: 'countryCode',
    cWebAddress: 'webAddress', cEmail: 'email', cTel: 'phone', cFax: 'fax',
    cOpeningHours: 'openingHours', cPreferredLangID: 'preferredLanguage', lTZKey: 'timezone',
};

const htmlOrganization: Record<string, string> = {
    organization_name: 'General.name', world_name: 'General.worldName',
    component_soft_drop: 'OnlineComponents.softDrop',
    component_soft_drop_checkout: 'OnlineComponents.softCheckout',
    component_soft_confirm: 'OnlineComponents.softConfirm',
    component_soft_chat: 'OnlineComponents.softChat',
    component_soft_analytics: 'OnlineComponents.softAnalytics',
    external_wheel_storage: 'ExternalInterfaces.xStorage',
};

function empty(value: Primitive): Primitive {
    return typeof value === 'boolean' ? false : typeof value === 'number' ? 0 : '';
}

function readPath(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((node, key) => {
        if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key)) return undefined;
        return (node as Record<string, unknown>)[key];
    }, root);
}

// Paths come only from our mappings or validated numeric branch indices.
function writePath(root: object, path: string, value: unknown): void {
    const keys = path.split('.');
    let node = root as Record<string, unknown>;
    keys.slice(0, -1).forEach(key => {
        if (!node[key]) node[key] = {};
        node = node[key] as Record<string, unknown>;
    });
    node[keys[keys.length - 1]] = value;
}

/** Optional explicit paths distinguish precompleted false/0 from initial defaults. */
export function createSetupImportState(
    data: AutomaticSetupSessionData,
    precompletedPaths: string[] = [],
): SetupImportState {
    const assigned: Record<string, true> = {};
    precompletedPaths.forEach(path => {
        const value = readPath(data, path);
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
            throw new Error(`Not a primitive field: ${path}`);
        }
        assigned[path] = true;
    });
    return { data, conflicts: {}, assigned };
}

function assign(state: SetupImportState, { path, value }: Assignment): void {
    const current = readPath(state.data, path) as Primitive;
    const conflicts = readPath(state.conflicts, path) as Primitive[] | undefined;
    if (conflicts) {
        if (!conflicts.includes(value)) conflicts.push(value);
        writePath(state.data, path, empty(current));
    } else if ((state.assigned[path] || current !== empty(current)) && current !== value) {
        writePath(state.conflicts, path, [current, value]);
        writePath(state.data, path, empty(current));
    } else {
        writePath(state.data, path, value);
    }
    state.assigned[path] = true;
}

function collector(state: SetupImportState) {
    const assignments: Assignment[] = [];
    return {
        add(path: string, raw: unknown): void {
            // Empty source strings mean missing data, never an explicit clearing command.
            if (raw === undefined || raw === null || raw === '') return;
            const current = readPath(state.data, path);
            if (current === undefined) throw new Error(`Missing default field: ${path}`);
            let value: Primitive;
            if (typeof current === 'string' && typeof raw === 'string') value = raw;
            else if (typeof current === 'boolean') {
                if (raw === true || raw === 'true' || raw === '1') value = true;
                else if (raw === false || raw === 'false' || raw === '0') value = false;
                else throw new Error(`Invalid boolean at ${path}: ${String(raw)}`);
            } else if (typeof current === 'number' &&
                (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) &&
                Number.isFinite(Number(raw))) value = Number(raw);
            else throw new Error(`Incompatible source value at ${path}`);
            assignments.push({ path, value });
        },
        commit(): SetupImportState {
            // Parsing, branch selection and type validation finish before any mutation.
            assignments.forEach(assignment => assign(state, assignment));
            return state;
        },
    };
}

function branchPrefix(state: SetupImportState, options: ImportOptions): string {
    const index = options.branchIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || !state.data.branchSetups?.[index]) {
        throw new Error(`Provide a prefilled branchSetups[${index}]`);
    }
    return `branchSetups.${index}`;
}

/** No normalization: these are shared raw DMS identifiers, not adapter configuration. */
function addDms(
    add: (path: string, raw: unknown) => void,
    branch: string,
    key: string,
    value: unknown,
): void {
    if (key !== 'DMSCompanyNumber') add(`${branch}.DealerInformation.${key}`, value);
    dmsInterfaces.forEach(service => add(`${branch}.${service}.${key}`, value));
}

function readHtmlFields(html: string, options: ImportOptions): Promise<Record<string, unknown>> {
    return (options.browser ? Promise.resolve(options.browser) : puppeteer.launch()).then(browser => {
        return browser.newPage().then(page => {
            return page.setJavaScriptEnabled(false)
                .then(() => page.setRequestInterception(true))
                .then(() => {
                    page.on('request', request => { void request.abort().catch(() => undefined); });
                    return page.setContent(html, { waitUntil: 'domcontentloaded' });
                })
                .then(() => page.evaluate(() => {
                    const embedded = document.querySelectorAll(
                        'script#migration-customer-planning-data[type="application/json"]',
                    );
                    if (embedded.length > 1) throw new Error('Multiple saved HTML data blocks');
                    if (embedded.length) {
                        const saved: unknown = JSON.parse(embedded[0].textContent ?? '');
                        if (!saved || typeof saved !== 'object' || !('fields' in saved) ||
                            !saved.fields || typeof saved.fields !== 'object' || Array.isArray(saved.fields)) {
                            throw new Error('HTML saved data must contain a fields object');
                        }
                        return saved.fields as Record<string, unknown>;
                    }
                    const fields: Record<string, unknown> = {};
                    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
                        'input[id][data-field], textarea[id][data-field], select[id][data-field]',
                    ).forEach(control => {
                        fields[control.id] = control instanceof HTMLInputElement && control.type === 'checkbox'
                            ? control.checked : control.value;
                    });
                    return fields;
                }))
                .finally(() => page.close());
        }).finally(() => options.browser ? undefined : browser.close());
    });
}

export function processHtml(
    html: string,
    state: SetupImportState,
    options: ImportOptions = {},
): Promise<SetupImportState> {
    return readHtmlFields(html, options).then(fields => {
        const branch = branchPrefix(state, options);
        const { add, commit } = collector(state);
        Object.entries(htmlOrganization).forEach(([source, target]) =>
            add(`organizationSetup.${target}`, fields[source]));
        add(`${branch}.General.firma`, fields.dealer_name);
        add(`${branch}.DealerInformation.dealerName`, fields.dealer_name);
        add(`${branch}.DealerInformation.DMSIP`, fields.dms_ip);
        add(`${branch}.xWheels.enabled`, fields.external_wheel_storage);
        const mapping: Record<string, string> = {
            dealer_number: 'dealerNumber', business_location_number: 'outletNumber',
            dms_name: 'DMS', dms_company: 'DMSCompanyNumber', dms_branch: 'DMSBranchNumber',
        };
        Object.entries(mapping).forEach(([source, target]) => addDms(add, branch, target, fields[source]));
        return commit();
    });
}

function parseCsv(content: string, delimiter: string): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
        const rows: CsvRow[] = [];
        parseString(content.replace(/^\uFEFF/, ''), { headers: true, delimiter, ignoreEmpty: true })
            .on('error', reject)
            .on('data', (row: CsvRow) => rows.push(row))
            .on('end', () => resolve(rows));
    });
}

export function processCsv(
    csv: string,
    state: SetupImportState,
    options: ImportOptions = {},
): Promise<SetupImportState> {
    return parseCsv(csv, options.delimiter ?? ';').then(rows => {
        const branch = branchPrefix(state, options);
        const keys = rows.filter(row => ['Branches', 'DMS parameters', 'External wheels'].includes(row.Interface))
            .map(row => row.lBranchKey || row.lBranchKey_PK)
            .filter((key, index, all) => Boolean(key) && all.indexOf(key) === index);
        if (!options.csvBranchKey && keys.length > 1) {
            throw new Error('Multiple CSV branches: supply csvBranchKey and branchIndex');
        }
        const branchKey = options.csvBranchKey ?? keys[0];
        if (options.csvBranchKey && !keys.includes(options.csvBranchKey)) {
            throw new Error(`CSV branch not found: ${options.csvBranchKey}`);
        }
        const branchRows = rows.filter(row => branchKey !== undefined &&
            (row.lBranchKey || row.lBranchKey_PK) === branchKey);
        const wheels = branchRows.filter(row => row.Interface === 'External wheels');
        const services = wheels.map(row => row.cFullServiceID)
            .filter((id, index, all) => all.indexOf(id) === index);
        if (!options.wheelServiceId && services.length > 1) {
            throw new Error('Multiple wheel services: supply wheelServiceId');
        }
        if (options.wheelServiceId && !services.includes(options.wheelServiceId)) {
            throw new Error(`Wheel service not found: ${options.wheelServiceId}`);
        }
        const wheelService = options.wheelServiceId ?? services[0];
        const { add, commit } = collector(state);
        rows.filter(row => row.Interface === 'Database ID').forEach(row =>
            add('organizationSetup.LegacyTKP.databaseId', row.cClientID));
        branchRows.forEach(row => {
            if (row.Interface === 'Branches') {
                Object.entries(branchColumns).forEach(([column, target]) =>
                    add(`${branch}.General.${target}`, row[column]));
                add(`${branch}.DealerInformation.dealerName`, row.cFirma);
            }
            if (row.Interface === 'DMS parameters') {
                const target: Record<string, string> = {
                    DistributionPartnerNumber: 'dealerNumber', OutletNumber: 'outletNumber',
                    Firm: 'DMSCompanyNumber', Branch: 'DMSBranchNumber',
                };
                if (target[row.cOptionID]) addDms(add, branch, target[row.cOptionID], row.cValue);
            }
            if (row.Interface === 'External wheels' && row.cFullServiceID === wheelService) {
                const target: Record<string, string> = {
                    Name: 'name', Active: 'enabled', EndpointURL: 'baseURL',
                    DealerNumber: 'dealerNumber', QueryPackageSize: 'queryPackageSize',
                };
                if (target[row.cOptionID]) add(`${branch}.xWheels.${target[row.cOptionID]}`, row.cValue);
            }
        });
        return commit();
    });
}

/** Call sequentially with the same state. type accepts the existing enum's HTMl spelling. */
export function processSetupFile(
    file: { path: string; type: 'CSV' | 'HTML' | 'HTMl' },
    state: SetupImportState,
    options: ImportOptions = {},
): Promise<SetupImportState> {
    return readFile(file.path, 'utf8').then(content => {
        if (file.type === 'CSV') return processCsv(content, state, options);
        if (file.type === 'HTML' || file.type === 'HTMl') return processHtml(content, state, options);
        throw new Error(`Unsupported file type: ${file.type}`);
    });
}
