import { parseString } from 'fast-csv';
import * as puppeteer from 'puppeteer';
import type { AutomaticSetupSessionData, BranchSetupType } from '../../../dbacc/types/automaticSetup/AutomaticSetupSessionTypes';
import { Factory } from '../../../factory';
import { getBrowser } from '../prettyPrint/html2pdf';

// tslint:disable:readonly-array readonly-keyword strict-comparisons

export type DeepConflicts<T> =
    NonNullable<T> extends string | number | boolean ? NonNullable<T>[] :
    NonNullable<T> extends ReadonlyArray<infer U> ? Partial<Record<number, DeepConflicts<U>>> :
    { [K in keyof T]?: DeepConflicts<T[K]> };

type Primitive = string | number | boolean;
type Fields = Record<string, unknown>;
export type CsvRow = Record<string, string>;
export type Assignment = { path: string; value: Primitive };
export type FieldMap = Record<string, string[]>;
type Add = (path: string, value: unknown) => void;

export interface SetupImportState {
    data: AutomaticSetupSessionData;
    conflicts: DeepConflicts<AutomaticSetupSessionData>;
    assigned: Record<string, true>;
    htmlBranchValues?: Assignment[];
    latestCsvBranch?: string;
}

export interface BranchContext {
    organization: AutomaticSetupSessionData['organizationSetup'];
    branches: BranchSetupType[];
}

export interface BranchOptions {
    /** Called for EVERY new branch/template. Supports asynchronous factories. */
    createDefaults?: () => BranchSetupType | PromiseLike<BranchSetupType>;
    /** Receives detached snapshots. Mutate/return only the fresh branch. */
    initializeBranch?: (
        branch: BranchSetupType,
        context: BranchContext,
    ) => BranchSetupType | PromiseLike<BranchSetupType>;
}

export interface ImportOptions extends BranchOptions {
    browser?: puppeteer.Browser;
    delimiter?: string;
    /** HTML: undefined = latest CSV branch; null = cache only; number = explicit branch. */
    branchIndex?: number | null;
    /** CSV always appends a branch. Select one explicitly if the file has several. */
    csvBranchKey?: string;
    wheelServiceId?: string;
}

// Edit these maps when adding or renaming fields. Paths are relative to their scope.
export const organizationDetailsHtmlMap: FieldMap = {
    organization_name: ['OrganizationDetails.General.name'],
    world_name: ['OrganizationDetails.General.worldName'],
    component_soft_drop: ['OrganizationDetails.OnlineComponents.softDrop'],
    component_soft_drop_checkout: ['OrganizationDetails.OnlineComponents.softCheckout'],
    component_soft_confirm: ['OrganizationDetails.OnlineComponents.softConfirm'],
    component_soft_chat: ['OrganizationDetails.OnlineComponents.softChat'],
    component_soft_analytics: ['OrganizationDetails.OnlineComponents.softAnalytics'],
    external_wheel_storage: ['OrganizationDetails.ExternalInterfaces.xStorage'],
};

export const organizationSettingsHtmlMap: FieldMap = {
    component_soft_drop: ['Settings.JobToc.isDropEnabled'],
    component_soft_drop_checkout: ['Settings.JobToc.isDropCheckoutEnabled'],
    component_soft_confirm: ['Settings.JobToc.isRtxEnabled'],
    component_soft_chat: ['Settings.JobToc.isChatEnabled'],
};

export const branchDetailsHtmlMap: FieldMap = {
    dealer_name: ['BranchDetails.General.firma', 'BranchDetails.DealerInformation.dealerName'],
    dms_ip: ['BranchDetails.DealerInformation.DMSIP'],
    external_wheel_storage: ['BranchDetails.xWheels.enabled'],
};

export const branchSettingsHtmlMap: FieldMap = {
    component_soft_analytics: ['Settings.Analytics.analyticsDesire'],
    dms_company: ['Settings.BMWSettings.FIRM'],
    dms_branch: ['Settings.BMWSettings.BRANCH'],
    dealer_number: ['Settings.BMWSettings.distributionPartnerNumber'],
    business_location_number: ['Settings.BMWSettings.dealerOutlet'],
};

export const branchColumns: FieldMap = {
    cName: ['BranchDetails.General.name'], cDisplayName: ['BranchDetails.General.displayName'],
    cFirma: ['BranchDetails.General.firma', 'BranchDetails.DealerInformation.dealerName'],
    cPLZ: ['BranchDetails.General.zipCode'], cCity: ['BranchDetails.General.city'],
    cCounty: ['BranchDetails.General.country'], cCountryCode: ['BranchDetails.General.countryCode'],
    cWebAddress: ['BranchDetails.General.webAddress'], cEmail: ['BranchDetails.General.email'],
    cTel: ['BranchDetails.General.phone'], cFax: ['BranchDetails.General.fax'],
    cOpeningHours: ['BranchDetails.General.openingHours'],
    cPreferredLangID: ['BranchDetails.General.preferredLanguage'], lTZKey: ['BranchDetails.General.timezone'],
};

export const branchSettingsCsvMap: FieldMap = {
    Firm: ['Settings.BMWSettings.FIRM'],
    Branch: ['Settings.BMWSettings.BRANCH'],
    DistributionPartnerNumber: ['Settings.BMWSettings.distributionPartnerNumber'],
    OutletNumber: ['Settings.BMWSettings.dealerOutlet'],
};

const dmsInterfaces = [
    'xClient', 'xAdditionalInfo', 'xPoolOpType', 'xOrder', 'xCatalog',
    'xPartsAvailability', 'xPriceInformation', 'xCarDataReadings',
];
const htmlDmsKeys: Record<string, string> = {
    dealer_number: 'dealerNumber', business_location_number: 'outletNumber',
    dms_name: 'DMS', dms_company: 'DMSCompanyNumber', dms_branch: 'DMSBranchNumber',
};
const csvDmsKeys: Record<string, string> = {
    DistributionPartnerNumber: 'dealerNumber', OutletNumber: 'outletNumber',
    Firm: 'DMSCompanyNumber', Branch: 'DMSBranchNumber',
};
const wheelKeys: Record<string, string> = {
    Name: 'name', Active: 'enabled', EndpointURL: 'baseURL',
    DealerNumber: 'dealerNumber', QueryPackageSize: 'queryPackageSize',
};

function isPrimitive(value: unknown): value is Primitive {
    return typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value));
}
function empty(value: Primitive): Primitive {
    return typeof value === 'boolean' ? false : typeof value === 'number' ? 0 : '';
}
function pathKeys(path: string): string[] {
    const keys = path.split('.');
    if (keys.some(key => !key || ['__proto__', 'prototype', 'constructor'].includes(key))) {
        throw new Error(`Invalid path: ${path}`);
    }
    return keys;
}
export function readPath(root: unknown, path: string): unknown {
    return pathKeys(path).reduce<unknown>((node, key) => {
        if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, key)) return undefined;
        return (node as Fields)[key];
    }, root);
}
function writePath(root: object, path: string, value: unknown): void {
    const keys = pathKeys(path);
    let node = root as Fields;
    keys.slice(0, -1).forEach(key => {
        if (node[key] === undefined) node[key] = {};
        if (!node[key] || typeof node[key] !== 'object') throw new Error(`Invalid parent at ${path}`);
        node = node[key] as Fields;
    });
    node[keys[keys.length - 1]] = value;
}
/** Config trees contain only JSON data. Never clone a promise before resolving it. */
function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/** Settings in the supplied output were serialized from a promise inspection. */
function resolveSettings(value: unknown): Promise<unknown> {
    return Promise.resolve(value).then(resolved => {
        if (resolved && typeof resolved === 'object' && 'isFulfilled' in resolved) {
            const wrapper = resolved as Fields;
            if (wrapper.isFulfilled !== true || !('fulfillmentValue' in wrapper)) {
                throw new Error('Settings promise did not fulfill');
            }
            return resolveSettings(wrapper.fulfillmentValue);
        }
        if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
            throw new Error('Settings must resolve to an object');
        }
        return resolved;
    });
}
function normalizeConfig<T extends object>(config: T): Promise<T> {
    return resolveSettings((config as Fields).Settings).then(Settings => clone({ ...config, Settings }));
}

export function createSetupImportState(
    data: AutomaticSetupSessionData,
    precompletedPaths: string[] = [],
): SetupImportState {
    const state: SetupImportState = { data, conflicts: {}, assigned: {} };
    precompletedPaths.forEach(path => {
        if (!isPrimitive(readPath(data, path))) throw new Error(`Not a primitive field: ${path}`);
        state.assigned[path] = true;
    });
    return state;
}

function decodeValue(current: unknown, raw: unknown, path: string): Primitive {
    // String-valued settings accept actual booleans/numbers from HTML/JSON.
    if (typeof current === 'string' && isPrimitive(raw)) return String(raw);
    if (typeof current === 'boolean') {
        if (raw === true || raw === 'true' || raw === '1' || raw === 1) return true;
        if (raw === false || raw === 'false' || raw === '0' || raw === 0) return false;
    }
    if (typeof current === 'number' &&
        (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) &&
        Number.isFinite(Number(raw))) return Number(raw);
    throw new Error(`Incompatible source value at ${path}: ${String(raw)}`);
}
function assign(state: SetupImportState, { path, value }: Assignment): void {
    const current = readPath(state.data, path);
    if (!isPrimitive(current)) throw new Error(`Missing primitive default: ${path}`);
    const conflicts = readPath(state.conflicts, path) as Primitive[] | undefined;
    if (conflicts) {
        if (!conflicts.includes(value)) conflicts.push(value);
        writePath(state.data, path, empty(current));
    } else if (state.assigned[path] && current !== value) {
        writePath(state.conflicts, path, [current, value]);
        writePath(state.data, path, empty(current));
    } else {
        writePath(state.data, path, value);
    }
    state.assigned[path] = true;
}

/** Public update methods take relative paths and validate all values before applying. */
function updateScope(state: SetupImportState, scope: string, values: Fields): void {
    const assignments: Assignment[] = [];
    Object.entries(values).forEach(([relative, raw]) => {
        if (raw === undefined || raw === null || raw === '') return;
        const path = `${scope}.${relative}`;
        assignments.push({ path, value: decodeValue(readPath(state.data, path), raw, path) });
    });
    assignments.forEach(item => assign(state, item));
}
export function updateOrganization(state: SetupImportState, values: Fields): void {
    updateScope(state, 'organizationSetup', values);
}
export function updateBranch(state: SetupImportState, index: number, values: Fields): void {
    requireBranch(state, index);
    updateScope(state, `branchSetups.${index}`, values);
}
function requireBranch(state: SetupImportState, index: number): void {
    if (!Number.isInteger(index) || index < 0 || !state.data.branchSetups?.[index]) {
        throw new Error(`Unknown branch index: ${index}`);
    }
}
function applyMap(fields: Fields, map: FieldMap, add: Add): void {
    Object.entries(map).forEach(([source, targets]) => targets.forEach(path => add(path, fields[source])));
}
function addDms(add: Add, key: string, value: unknown): void {
    if (key !== 'DMSCompanyNumber') add(`BranchDetails.DealerInformation.${key}`, value);
    dmsInterfaces.forEach(service => add(`BranchDetails.${service}.${key}`, value));
}

// Separate mapping functions make organization/branch settings independently editable.
export function mapOrganizationHtml(fields: Fields, add: Add): void {
    applyMap(fields, organizationDetailsHtmlMap, add);
    applyMap(fields, organizationSettingsHtmlMap, add);
}
export function mapOrganizationCsv(rows: CsvRow[], add: Add): void {
    rows.filter(row => row.Interface === 'Database ID')
        .forEach(row => add('OrganizationDetails.LegacyTKP.databaseId', row.cClientID));
    // Add organization CSV settings mappings here when their source columns are known.
}
export function mapBranchHtml(fields: Fields, add: Add): void {
    applyMap(fields, branchDetailsHtmlMap, add);
    applyMap(fields, branchSettingsHtmlMap, add);
    Object.entries(htmlDmsKeys).forEach(([source, key]) => addDms(add, key, fields[source]));
}
export function mapBranchCsv(rows: CsvRow[], add: Add, wheelServiceId?: string): void {
    const services = Array.from(new Set(rows.filter(row => row.Interface === 'External wheels')
        .map(row => row.cFullServiceID).filter(Boolean)));
    if (services.length > 1 && wheelServiceId === undefined) {
        throw new Error('Multiple wheel services: specify wheelServiceId');
    }
    const service = wheelServiceId ?? services[0];
    if (wheelServiceId !== undefined && !services.includes(wheelServiceId)) {
        throw new Error(`Unknown wheel service: ${wheelServiceId}`);
    }
    rows.forEach(row => {
        if (row.Interface === 'Branches') applyMap(row, branchColumns, add);
        if (row.Interface === 'DMS parameters') {
            const key = csvDmsKeys[row.cOptionID];
            if (key) addDms(add, key, row.cValue);
            applyMap({ [row.cOptionID]: row.cValue }, branchSettingsCsvMap, add);
        }
        if (row.Interface === 'External wheels' && row.cFullServiceID === service) {
            const key = wheelKeys[row.cOptionID];
            if (key) add(`BranchDetails.xWheels.${key}`, row.cValue);
        }
    });
}

/** Copy ONLY explicitly selected primitive paths; later calls take precedence.
 * These are baseline values, not imported evidence, so they are not marked assigned.
 * Example: copyInheritedFields(branch, context.organization, {
 *   'OrganizationDetails.General.preferredLanguage': 'BranchDetails.General.preferredLanguage',
 * });
 * copyInheritedFields(branch, context.branches[0], {
 *   'Settings.Morning.startTime': 'Settings.Morning.startTime',
 * });
 */
export function copyInheritedFields(target: BranchSetupType, source: unknown, paths: Record<string, string>): void {
    Object.entries(paths).forEach(([from, to]) => {
        const raw = readPath(source, from);
        if (raw === undefined) return;
        writePath(target, to, decodeValue(readPath(target, to), raw, to));
    });
}

function createBranchTemplate(state: SetupImportState, options: BranchOptions): Promise<BranchSetupType> {
    const factory = options.createDefaults ?? (() =>
        Factory.getInstance().getBzl().AutomaticSetupSessionBzl.getDefaultBranchSetup());
    return Promise.resolve().then(factory).then(normalizeConfig).then(branch => {
        if (!options.initializeBranch) return branch;
        const context = clone({ organization: state.data.organizationSetup, branches: state.data.branchSetups ?? [] });
        return Promise.resolve(options.initializeBranch(branch, context)).then(normalizeConfig);
    });
}

/** Each file/new-branch operation is atomic. Calls on one state must be sequential.
 * Preserve the original data object; replaced nested config references must be re-read.
 */
function transaction<T>(state: SetupImportState, work: (draft: SetupImportState) => Promise<T>): Promise<T> {
    return Promise.all([
        normalizeConfig(state.data.organizationSetup),
        Promise.all((state.data.branchSetups ?? []).map(branch => normalizeConfig(branch))),
    ]).then(([organizationSetup, branchSetups]) => {
        const draft: SetupImportState = {
            ...state,
            data: { ...state.data, organizationSetup, branchSetups },
            conflicts: clone(state.conflicts), assigned: { ...state.assigned },
            htmlBranchValues: clone(state.htmlBranchValues ?? []),
        };
        return work(draft).then(result => {
            state.data.organizationSetup = draft.data.organizationSetup;
            state.data.branchSetups = draft.data.branchSetups;
            state.conflicts = draft.conflicts;
            state.assigned = draft.assigned;
            state.htmlBranchValues = draft.htmlBranchValues;
            state.latestCsvBranch = draft.latestCsvBranch;
            return result;
        });
    });
}

/** Standalone branch creation, without CSV or implicit replay of HTML. Returns its index. */
export function addNewBranch(state: SetupImportState, options: BranchOptions = {}): Promise<number> {
    return transaction(state, draft => createBranchTemplate(draft, options).then(branch => {
        const branches = draft.data.branchSetups ?? (draft.data.branchSetups = []);
        return branches.push(branch) - 1;
    }));
}

export function readHtmlFields(html: string, options: ImportOptions = {}): Promise<Fields> {
    // getBrowser is treated as a shared-browser provider. Always close our temporary page.
    return (options.browser ? Promise.resolve(options.browser) : getBrowser()).then(browser =>
        browser.newPage().then(page => page.setJavaScriptEnabled(false)
            .then(() => page.setRequestInterception(true))
            .then(() => {
                page.on('request', request => { void request.abort().catch(() => undefined); });
                return page.setContent(html, { waitUntil: 'domcontentloaded' });
            })
            .then(() => page.evaluate(() => {
                const embedded = document.querySelectorAll('script#migration-customer-planning-data[type="application/json"]');
                if (embedded.length > 1) throw new Error('Multiple saved HTML data blocks');
                if (embedded.length) {
                    const saved = JSON.parse(embedded[0].textContent ?? '') as { fields?: unknown } | null;
                    if (!saved || !saved.fields || typeof saved.fields !== 'object' || Array.isArray(saved.fields)) {
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
            .finally(() => page.close())),
    );
}

/** Cached HTML is a reusable template for subsequent CSV branches, as in the original.
 * An explicit branchIndex updates only that branch and does NOT change the template.
 */
export function processHtml(html: string, state: SetupImportState, options: ImportOptions = {}): Promise<SetupImportState> {
    return readHtmlFields(html, options).then(fields => transaction(state, draft => {
        mapOrganizationHtml(fields, (path, value) => updateOrganization(draft, { [path]: value }));
        return createBranchTemplate(draft, { createDefaults: options.createDefaults }).then(template => {
            let index = options.branchIndex;
            if (index === undefined && draft.latestCsvBranch) {
                const match = /^branchSetups\.(\d+)$/.exec(draft.latestCsvBranch);
                if (!match) throw new Error('Invalid latestCsvBranch');
                index = Number(match[1]);
            }
            if (index !== undefined && index !== null) requireBranch(draft, index);
            const values: Assignment[] = [];
            mapBranchHtml(fields, (path, raw) => {
                if (raw === undefined || raw === null || raw === '') return;
                values.push({ path, value: decodeValue(readPath(template, path), raw, path) });
            });
            if (index !== undefined && index !== null) {
                const target = index;
                values.forEach(({ path, value }) => updateBranch(draft, target, { [path]: value }));
            }
            if (options.branchIndex === undefined || options.branchIndex === null) {
                draft.htmlBranchValues = [...(draft.htmlBranchValues ?? []), ...values];
            }
        });
    })).then(() => state);
}

export function parseCsv(content: string, delimiter = ';'): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
        const rows: CsvRow[] = [];
        parseString(content.replace(/^\uFEFF/, ''), { headers: true, delimiter, ignoreEmpty: true })
            .on('error', reject).on('data', (row: CsvRow) => rows.push(row)).on('end', () => resolve(rows));
    });
}
function selectBranchRows(rows: CsvRow[], selected?: string): CsvRow[] {
    const keys = Array.from(new Set(rows.filter(row => ['Branches', 'DMS parameters', 'External wheels'].includes(row.Interface))
        .map(row => row.lBranchKey || row.lBranchKey_PK).filter(Boolean)));
    if (!keys.length) throw new Error('No branch found in CSV');
    if (keys.length > 1 && selected === undefined) throw new Error('Multiple branches: specify csvBranchKey');
    const key = selected ?? keys[0];
    if (!keys.includes(key)) throw new Error(`Unknown CSV branch: ${key}`);
    return rows.filter(row => (row.lBranchKey || row.lBranchKey_PK) === key);
}
export function processCsv(csv: string, state: SetupImportState, options: ImportOptions = {}): Promise<SetupImportState> {
    return parseCsv(csv, options.delimiter).then(rows => {
        const branchRows = selectBranchRows(rows, options.csvBranchKey);
        return transaction(state, draft => {
            mapOrganizationCsv(rows, (path, value) => updateOrganization(draft, { [path]: value }));
            return createBranchTemplate(draft, options).then(branch => {
                const branches = draft.data.branchSetups ?? (draft.data.branchSetups = []);
                const index = branches.push(branch) - 1;
                const add: Add = (path, value) => updateBranch(draft, index, { [path]: value });
                (draft.htmlBranchValues ?? []).forEach(({ path, value }) => add(path, value));
                mapBranchCsv(branchRows, add, options.wheelServiceId);
                draft.latestCsvBranch = `branchSetups.${index}`;
            });
        });
    }).then(() => state);
}
