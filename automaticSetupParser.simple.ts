import { parseString } from 'fast-csv';
import * as puppeteer from 'puppeteer';
import type { AutomaticSetupSessionData, BranchSetupType } from './AutomaticSetupSessionTypes';
import { getBrowser } from '../prettyPrint/html2pdf';
import { createBranch } from './createBranch';
import { BmwLinkageTracker } from './bmwLinkageTracker';
import type { BmwLinkageOptions, BmwLinkageResult } from './bmwLinkageTypes';
import { createXServiceSetup } from './xServiceDefaults';
import type { XServiceKey, XServiceSetup } from './xServiceSetupTypes';

// One instance per organization/import session. Process its files sequentially.
// Conflicts are tracked across all setter calls in this instance, including false/0.
// Only processHtml/processCsv and their readers return promises.
// All setters, defaults, inheritance, and object updates are synchronous.
// Existing defaults must be fresh, complete, plain objects with a plain Settings object.

type Primitive = string | number | boolean;
export type DeepConflicts<T> =
    NonNullable<T> extends Primitive ? NonNullable<T>[] :
    NonNullable<T> extends ReadonlyArray<infer U> ? Partial<Record<number, DeepConflicts<U>>> :
    { [K in keyof T]?: DeepConflicts<T[K]> };

type Organization = AutomaticSetupSessionData['organizationSetup'];
type BranchDetails = BranchSetupType['BranchDetails'];
type HtmlFields = Record<string, unknown>;
type CsvRow = Record<string, string>;
type DmsValues = Partial<{
    dealerNumber: string;
    outletNumber: string;
    DMS: string;
    DMSCompanyNumber: string;
    DMSBranchNumber: string;
}>;

const dmsInterfaces = [
    'xClient', 'xAdditionalInfo', 'xPoolOpType', 'xOrder', 'xCatalog',
    'xPartsAvailability', 'xPriceInformation', 'xCarDataReadings',
] as const;

function text(value: unknown): string | undefined {
    return value === undefined || value === null || value === '' ? undefined : String(value);
}
function boolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    throw new Error(`Invalid boolean: ${String(value)}`);
}

export class AutomaticSetupParser {
    // Shared HTML branch defaults, needed when CSV branches arrive after the HTML.
    private htmlFields: HtmlFields[] = [];
    private analytics: boolean[] = [];
    private externalWheelStorage: boolean[] = [];
    // Object identity keeps branches independent, even before they are appended.
    // Existing populated fields and subsequent setter assignments are tracked.
    // Newly created branch defaults are not seeded as imported evidence.
    private assigned = new WeakMap<object, Record<string, Primitive[]>>();

    public readonly data: AutomaticSetupSessionData;
    private readonly bmwLinkage = new BmwLinkageTracker();
    public bmwLinkageOptions: BmwLinkageOptions = {};
    public bmwLinkageResult: BmwLinkageResult = { appliedBranchIndexes: [], issues: [] };

    /** Derived linkage runs after source/conflict assignments, never from a manual flag. */
    public finalizeImport(): AutomaticSetupSessionData {
        this.bmwLinkageResult = this.bmwLinkage.apply(this.data, this.bmwLinkageOptions);
        return this.data;
    }

    constructor(data: AutomaticSetupSessionData) {
        this.data = data;
        this.trackExistingData(data);
    }

    // Only '', false and 0 are initial empty defaults. The strings "false" and "0"
    // are populated values. Once imported, false/0 are tracked like any other value.
    private trackExistingData(target: object): void {
        Object.entries(target).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
                this.trackExistingData(value);
            } else if (typeof value === 'string' || typeof value === 'boolean' ||
                (typeof value === 'number' && Number.isFinite(value))) {
                const empty = typeof value === 'boolean' ? false : typeof value === 'number' ? 0 : '';
                if (value !== empty) {
                    this.markCompleted(target, key);
                }
            }
        });
    }

    /** Call before importing to mark an existing false/0/empty string as intentional.
     * Does not overwrite an existing assignment history or resolve conflicts.
     */
    public markCompleted(target: object, key: string): void {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`Invalid key: ${key}`);
        const value = (target as Record<string, unknown>)[key];
        if (typeof value !== 'string' && typeof value !== 'boolean' &&
            !(typeof value === 'number' && Number.isFinite(value))) {
            throw new Error(`Expected a primitive value for ${key}`);
        }
        let fields = this.assigned.get(target);
        if (!fields) {
            fields = Object.create(null) as Record<string, Primitive[]>;
            this.assigned.set(target, fields);
        }
        if (!fields[key]) fields[key] = [value];
    }

    /** All future setters should use this helper. Blank source values are ignored.
     * Once conflicting, a field stays empty for the remainder of this session.
     */
    public assignValue(target: object, key: string, value: unknown): void {
        if (value === undefined || value === null || value === '') return;
        if (typeof value !== 'string' && typeof value !== 'boolean' &&
            !(typeof value === 'number' && Number.isFinite(value))) {
            throw new Error(`Expected a primitive value for ${key}`);
        }
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`Invalid key: ${key}`);
        let fields = this.assigned.get(target);
        if (!fields) {
            fields = Object.create(null) as Record<string, Primitive[]>;
            this.assigned.set(target, fields);
        }
        const values = fields[key] ?? (fields[key] = []);
        if (!values.includes(value)) values.push(value);
        const first = values[0];
        const empty = typeof first === 'boolean' ? false : typeof first === 'number' ? 0 : '';
        Object.assign(target, { [key]: values.length > 1 ? empty : value });
    }

    public assignPresent<T extends object>(target: T, values: Partial<T>): void {
        Object.entries(values).forEach(([key, value]) => this.assignValue(target, key, value));
    }

    /** JSON-serializable snapshot with the same nesting as data.
     * Read after imports; snapshots do not update themselves. Keep this parser instance
     * for the entire session and do not replace its nested data objects externally.
     */
    public get conflicts(): DeepConflicts<AutomaticSetupSessionData> {
        const collect = (node: object): Record<string, unknown> => {
            const result: Record<string, unknown> = {};
            const fields = this.assigned.get(node);
            Object.entries(node).forEach(([key, value]) => {
                const values = fields?.[key];
                if (values && values.length > 1) result[key] = [...values];
                else if (value && typeof value === 'object') {
                    const children = collect(value);
                    if (Object.keys(children).length) result[key] = children;
                }
            });
            return result;
        };
        return collect(this.data) as DeepConflicts<AutomaticSetupSessionData>;
    }

    // ORGANIZATION SETTERS ---------------------------------------------------

    public setOrganizationGeneral(values: Partial<Organization['OrganizationDetails']['General']>): void {
        this.assignPresent(this.data.organizationSetup.OrganizationDetails.General, values);
    }

    public setDatabaseId(databaseId: string): void {
        this.assignValue(this.data.organizationSetup.OrganizationDetails.LegacyTKP, 'databaseId', databaseId);
    }

    public setSoftDrop(enabled: boolean): void {
        this.assignValue(this.data.organizationSetup.OrganizationDetails.OnlineComponents, 'softDrop', enabled);
        this.assignValue(this.data.organizationSetup.Settings.JobToc, 'isDropEnabled', String(enabled));
    }

    public setSoftCheckout(enabled: boolean): void {
        this.assignValue(this.data.organizationSetup.OrganizationDetails.OnlineComponents, 'softCheckout', enabled);
        this.assignValue(this.data.organizationSetup.Settings.JobToc, 'isDropCheckoutEnabled', String(enabled));
    }

    public setSoftConfirm(enabled: boolean): void {
        this.assignValue(this.data.organizationSetup.OrganizationDetails.OnlineComponents, 'softConfirm', enabled);
        this.assignValue(this.data.organizationSetup.Settings.JobToc, 'isRtxEnabled', String(enabled));
    }

    public setSoftChat(enabled: boolean): void {
        this.assignValue(this.data.organizationSetup.OrganizationDetails.OnlineComponents, 'softChat', enabled);
        this.assignValue(this.data.organizationSetup.Settings.JobToc, 'isChatEnabled', String(enabled));
    }

    public setAnalytics(enabled: boolean): void {
        const components = this.data.organizationSetup.OrganizationDetails.OnlineComponents;
        this.assignValue(components, 'softAnalytics', enabled);
        this.analytics = this.assigned.get(components)!.softAnalytics as boolean[];
        (this.data.branchSetups ?? []).forEach(branch =>
            this.analytics.forEach(value => this.setBranchAnalytics(branch, value)));
    }

    public setExternalWheelStorage(enabled: boolean): void {
        const interfaces = this.data.organizationSetup.OrganizationDetails.ExternalInterfaces;
        this.assignValue(interfaces, 'xStorage', enabled);
        this.externalWheelStorage = this.assigned.get(interfaces)!.xStorage as boolean[];
        (this.data.branchSetups ?? []).forEach(branch =>
            this.externalWheelStorage.forEach(value => this.setBranchExternalWheelStorage(branch, value)));
    }

    // BRANCH SETTERS ---------------------------------------------------------

    private ensureXService<K extends XServiceKey>(branch: BranchSetupType, key: K): XServiceSetup<K> {
        if (!branch.BranchDetails[key]) Object.assign(branch.BranchDetails, { [key]: createXServiceSetup(key) });
        return branch.BranchDetails[key] as XServiceSetup<K>;
    }

    /** Structured settings are assigned recursively so false/0 and array items track conflicts. */
    public setBranchXService<K extends XServiceKey>(branch: BranchSetupType, key: K, values: Partial<XServiceSetup<K>>): void {
        const apply = (target: object, source: object): void => {
            Object.entries(source).forEach(([field, value]) => {
                if (['__proto__', 'prototype', 'constructor'].includes(field)) throw new Error(`Invalid key: ${field}`);
                if (value !== null && typeof value === 'object') {
                    const fields = target as Record<string, unknown>;
                    if (fields[field] === undefined) fields[field] = Array.isArray(value) ? [] : {};
                    const current = fields[field];
                    if (!current || typeof current !== 'object' || Array.isArray(current) !== Array.isArray(value)) {
                        throw new Error(`Incompatible configuration container: ${field}`);
                    }
                    apply(current, value);
                } else this.assignValue(target, field, value);
            });
        };
        apply(this.ensureXService(branch, key), values);
    }

    public setBranchGeneral(branch: BranchSetupType, values: Partial<BranchDetails['General']>): void {
        this.assignPresent(branch.BranchDetails.General, values);
    }

    public setBranchDealer(branch: BranchSetupType, values: Partial<BranchDetails['DealerInformation']>): void {
        if (!branch.BranchDetails.DealerInformation) {
            branch.BranchDetails.DealerInformation = {
                dealerName: '', dealerNumber: '', outletNumber: '', DMS: '',
                DMSCompanyName: '', DMSIP: '', DMSBranchNumber: '',
            };
        }
        this.assignPresent(branch.BranchDetails.DealerInformation, values);
    }

    public setBranchAnalytics(branch: BranchSetupType, enabled: boolean): void {
        this.assignValue(branch.Settings.Analytics, 'analyticsDesire', String(enabled));
    }

    public setBranchExternalWheelStorage(branch: BranchSetupType, enabled: boolean): void {
        this.assignValue(this.ensureXService(branch, 'xWheels'), 'enabled', enabled);
    }

    public setBranchWheels(branch: BranchSetupType, values: Partial<BranchDetails['xWheels']>): void {
        this.assignPresent(this.ensureXService(branch, 'xWheels'), values);
    }

    public setBranchBMWSettings(branch: BranchSetupType, values: Partial<BranchSetupType['Settings']['BMWSettings']>): void {
        const settings = branch.Settings as Record<string, unknown>;
        if (!settings.BMWSettings) settings.BMWSettings = {};
        this.assignPresent(settings.BMWSettings as object, values);
    }

    public setBranchDms(branch: BranchSetupType, values: DmsValues): void {
        const { DMSCompanyNumber, ...dealerValues } = values;
        this.setBranchDealer(branch, dealerValues);
        dmsInterfaces.forEach(service => this.assignPresent(this.ensureXService(branch, service), values));
        this.setBranchBMWSettings(branch, {
            FIRM: DMSCompanyNumber,
            BRANCH: values.DMSBranchNumber,
            distributionPartnerNumber: values.dealerNumber,
            dealerOutlet: values.outletNumber,
        });
    }

    // SESSION IMPORT VALUES / APPENDING -------------------------------------

    public addBranch(
        branch: BranchSetupType = createBranch(this.data.organizationSetup),
    ): BranchSetupType {
        // Creation is standalone; replaying source evidence belongs to the import session.
        this.htmlFields.forEach(fields => this.applyHtmlBranch(fields, branch));
        this.applySharedComponents(branch);
        if (!this.data.branchSetups) this.data.branchSetups = [];
        this.data.branchSetups.push(branch);
        return branch;
    }

    public applySharedComponents(branch: BranchSetupType): void {
        this.analytics.forEach(enabled => this.setBranchAnalytics(branch, enabled));
        this.externalWheelStorage.forEach(enabled => this.setBranchExternalWheelStorage(branch, enabled));
    }

    // SYNCHRONOUS HTML MAPPING -----------------------------------------------

    public applyHtml(fields: HtmlFields): AutomaticSetupSessionData {
        this.bmwLinkage.restore(this.data);
        this.htmlFields.push({ ...fields });
        this.applyHtmlOrganization(fields);
        (this.data.branchSetups ?? []).forEach(branch => this.applyHtmlBranch(fields, branch));
        return this.finalizeImport();
    }

    public applyHtmlOrganization(fields: HtmlFields): void {
        this.setOrganizationGeneral({ name: text(fields.organization_name), worldName: text(fields.world_name) });
        const softDrop = boolean(fields.component_soft_drop);
        const checkout = boolean(fields.component_soft_drop_checkout);
        const confirm = boolean(fields.component_soft_confirm);
        const chat = boolean(fields.component_soft_chat);
        const analytics = boolean(fields.component_soft_analytics);
        const wheels = boolean(fields.external_wheel_storage);
        if (softDrop !== undefined) this.setSoftDrop(softDrop);
        if (checkout !== undefined) this.setSoftCheckout(checkout);
        if (confirm !== undefined) this.setSoftConfirm(confirm);
        if (chat !== undefined) this.setSoftChat(chat);
        if (analytics !== undefined) this.setAnalytics(analytics);
        if (wheels !== undefined) this.setExternalWheelStorage(wheels);
    }

    public applyHtmlBranch(fields: HtmlFields, branch: BranchSetupType): void {
        this.setBranchGeneral(branch, { firma: text(fields.dealer_name) });
        this.setBranchDealer(branch, { dealerName: text(fields.dealer_name), DMSIP: text(fields.dms_ip) });
        this.setBranchDms(branch, {
            dealerNumber: text(fields.dealer_number), outletNumber: text(fields.business_location_number),
            DMS: text(fields.dms_name), DMSCompanyNumber: text(fields.dms_company), DMSBranchNumber: text(fields.dms_branch),
        });
    }

    // SYNCHRONOUS CSV MAPPING: ONE FILE = ONE NEW BRANCH ----------------------

    public applyCsv(rows: CsvRow[]): AutomaticSetupSessionData {
        if (!rows.some(row => row.Interface === 'Branches')) throw new Error('CSV has no Branches row');
        this.bmwLinkage.restore(this.data);
        const branch = createBranch(this.data.organizationSetup);
        this.htmlFields.forEach(fields => this.applyHtmlBranch(fields, branch));
        this.applySharedComponents(branch);
        rows.forEach(row => {
            if (row.Interface === 'Branches') this.applyCsvBranch(row, branch);
            if (row.Interface === 'DMS parameters') this.applyCsvDms(row, branch);
            if (row.Interface === 'External wheels') this.applyCsvWheels(row, branch);
        });
        rows.forEach(row => {
            if (row.Interface === 'Database ID' && row.cClientID) this.setDatabaseId(row.cClientID);
        });
        this.addBranch(branch);
        return this.finalizeImport();
    }

    public applyCsvBranch(row: CsvRow, branch: BranchSetupType): void {
        this.setBranchGeneral(branch, {
            name: row.cName, displayName: row.cDisplayName, firma: row.cFirma,
            zipCode: row.cPLZ, city: row.cCity, country: row.cCounty, countryCode: row.cCountryCode,
            webAddress: row.cWebAddress, email: row.cEmail, phone: row.cTel, fax: row.cFax,
            openingHours: row.cOpeningHours, preferredLanguage: row.cPreferredLangID, timezone: row.lTZKey,
        });
        this.setBranchDealer(branch, { dealerName: row.cFirma });
    }

    public applyCsvDms(row: CsvRow, branch: BranchSetupType): void {
        switch (row.cOptionID) {
            case 'DMS': this.setBranchDms(branch, { DMS: row.cValue }); break;
            case 'DistributionPartnerNumber': this.setBranchDms(branch, { dealerNumber: row.cValue }); break;
            case 'OutletNumber': this.setBranchDms(branch, { outletNumber: row.cValue }); break;
            case 'Firm': this.setBranchDms(branch, { DMSCompanyNumber: row.cValue }); break;
            case 'Branch': this.setBranchDms(branch, { DMSBranchNumber: row.cValue }); break;
        }
    }

    public applyCsvWheels(row: CsvRow, branch: BranchSetupType): void {
        switch (row.cOptionID) {
            case 'Name': this.setBranchWheels(branch, { name: row.cValue }); break;
            case 'Active': {
                const enabled = boolean(row.cValue);
                if (enabled !== undefined) this.setBranchExternalWheelStorage(branch, enabled);
                break;
            }
            case 'EndpointURL': this.setBranchWheels(branch, { baseURL: row.cValue }); break;
            case 'DealerNumber': this.setBranchWheels(branch, { dealerNumber: row.cValue }); break;
            case 'QueryPackageSize': this.setBranchWheels(branch, { queryPackageSize: row.cValue }); break;
        }
    }

    // ASYNCHRONOUS READERS ONLY ----------------------------------------------

    public processHtml(html: string, browser?: puppeteer.Browser): Promise<AutomaticSetupSessionData> {
        return readHtmlFields(html, browser).then(fields => this.applyHtml(fields));
    }

    public processCsv(csv: string, delimiter = ';'): Promise<AutomaticSetupSessionData> {
        return readCsvRows(csv, delimiter).then(rows => this.applyCsv(rows));
    }
}

export function readCsvRows(csv: string, delimiter = ';'): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
        const rows: CsvRow[] = [];
        parseString(csv.replace(/^\uFEFF/, ''), { headers: true, delimiter, ignoreEmpty: true })
            .on('error', reject)
            .on('data', (row: CsvRow) => rows.push(row))
            .on('end', () => resolve(rows));
    });
}

export function readHtmlFields(html: string, existingBrowser?: puppeteer.Browser): Promise<HtmlFields> {
    // getBrowser provides the shared browser; only the temporary page is closed here.
    return (existingBrowser ? Promise.resolve(existingBrowser) : getBrowser()).then(browser =>
        browser.newPage().then(page => page.setJavaScriptEnabled(false)
            .then(() => page.setRequestInterception(true))
            .then(() => {
                page.on('request', request => { void request.abort().catch(() => undefined); });
                return page.setContent(html, { waitUntil: 'domcontentloaded' });
            })
            .then(() => page.evaluate(() => {
                // Read saved JSON as data; no scripts are executed.
                const saved = document.querySelector('script#migration-customer-planning-data[type="application/json"]');
                if (saved) {
                    const parsed = JSON.parse(saved.textContent ?? '') as { fields?: unknown } | null;
                    if (!parsed || !parsed.fields || typeof parsed.fields !== 'object' || Array.isArray(parsed.fields)) {
                        throw new Error('Saved HTML must contain a fields object');
                    }
                    return parsed.fields as Record<string, unknown>;
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

