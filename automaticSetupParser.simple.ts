import { parseString } from 'fast-csv';
import * as puppeteer from 'puppeteer';
import type { AutomaticSetupSessionData, BranchSetupType } from '../../../dbacc/types/automaticSetup/AutomaticSetupSessionTypes';
import { Factory } from '../../../factory';
import { getBrowser } from '../prettyPrint/html2pdf';

// One instance per organization. Reuse it while importing that organization's files.
// Only processHtml/processCsv and their readers return promises.
// All setters, defaults, inheritance, and object updates are synchronous.
// Existing defaults must be fresh, complete, plain objects with a plain Settings object.

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

// Missing/blank source fields leave defaults unchanged; false and 0 are assigned.
function assignPresent<T extends object>(target: T, values: Partial<T>): void {
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            Object.assign(target, { [key]: value });
        }
    });
}
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
    private htmlFields: HtmlFields = {};
    private analytics?: boolean;
    private externalWheelStorage?: boolean;

    constructor(
        public readonly data: AutomaticSetupSessionData,
        private readonly createBranchDefaults: () => BranchSetupType = () =>
            Factory.getInstance().getBzl().AutomaticSetupSessionBzl.getDefaultBranchSetup(),
    ) {}

    // ORGANIZATION SETTERS ---------------------------------------------------

    public setOrganizationGeneral(values: Partial<Organization['OrganizationDetails']['General']>): void {
        assignPresent(this.data.organizationSetup.OrganizationDetails.General, values);
    }

    public setDatabaseId(databaseId: string): void {
        this.data.organizationSetup.OrganizationDetails.LegacyTKP.databaseId = databaseId;
    }

    public setSoftDrop(enabled: boolean): void {
        this.data.organizationSetup.OrganizationDetails.OnlineComponents.softDrop = enabled;
        this.data.organizationSetup.Settings.JobToc.isDropEnabled = String(enabled);
    }

    public setSoftCheckout(enabled: boolean): void {
        this.data.organizationSetup.OrganizationDetails.OnlineComponents.softCheckout = enabled;
        this.data.organizationSetup.Settings.JobToc.isDropCheckoutEnabled = String(enabled);
    }

    public setSoftConfirm(enabled: boolean): void {
        this.data.organizationSetup.OrganizationDetails.OnlineComponents.softConfirm = enabled;
        this.data.organizationSetup.Settings.JobToc.isRtxEnabled = String(enabled);
    }

    public setSoftChat(enabled: boolean): void {
        this.data.organizationSetup.OrganizationDetails.OnlineComponents.softChat = enabled;
        this.data.organizationSetup.Settings.JobToc.isChatEnabled = String(enabled);
    }

    public setAnalytics(enabled: boolean): void {
        this.analytics = enabled;
        this.data.organizationSetup.OrganizationDetails.OnlineComponents.softAnalytics = enabled;
        (this.data.branchSetups ?? []).forEach(branch => this.setBranchAnalytics(branch, enabled));
    }

    public setExternalWheelStorage(enabled: boolean): void {
        this.externalWheelStorage = enabled;
        this.data.organizationSetup.OrganizationDetails.ExternalInterfaces.xStorage = enabled;
        (this.data.branchSetups ?? []).forEach(branch => this.setBranchExternalWheelStorage(branch, enabled));
    }

    // BRANCH SETTERS ---------------------------------------------------------

    public setBranchGeneral(branch: BranchSetupType, values: Partial<BranchDetails['General']>): void {
        assignPresent(branch.BranchDetails.General, values);
    }

    public setBranchDealer(branch: BranchSetupType, values: Partial<BranchDetails['DealerInformation']>): void {
        assignPresent(branch.BranchDetails.DealerInformation, values);
    }

    public setBranchAnalytics(branch: BranchSetupType, enabled: boolean): void {
        branch.Settings.Analytics.analyticsDesire = String(enabled);
    }

    public setBranchExternalWheelStorage(branch: BranchSetupType, enabled: boolean): void {
        branch.BranchDetails.xWheels.enabled = enabled;
    }

    public setBranchWheels(branch: BranchSetupType, values: Partial<BranchDetails['xWheels']>): void {
        assignPresent(branch.BranchDetails.xWheels, values);
    }

    public setBranchBMWSettings(branch: BranchSetupType, values: Partial<BranchSetupType['Settings']['BMWSettings']>): void {
        assignPresent(branch.Settings.BMWSettings, values);
    }

    public setBranchDms(branch: BranchSetupType, values: DmsValues): void {
        const { DMSCompanyNumber, ...dealerValues } = values;
        this.setBranchDealer(branch, dealerValues);
        dmsInterfaces.forEach(service => assignPresent(branch.BranchDetails[service], values));
        this.setBranchBMWSettings(branch, {
            FIRM: DMSCompanyNumber,
            BRANCH: values.DMSBranchNumber,
            distributionPartnerNumber: values.dealerNumber,
            dealerOutlet: values.outletNumber,
        });
    }

    // BRANCH CREATION / INHERITANCE ------------------------------------------

    /** Extend this method to copy chosen fields from the organization/other branches.
     * For example:
     * this.setBranchGeneral(branch, {
     *     preferredLanguage: this.data.organizationSetup.OrganizationDetails.General.preferredLanguage,
     * });
     * Never assign another branch's entire nested object by reference.
     */
    public inheritBranch(branch: BranchSetupType): void {
        this.applyHtmlBranch(this.htmlFields, branch);
        this.applySharedComponents(branch);
    }

    public createBranch(): BranchSetupType {
        const branch = this.createBranchDefaults();
        this.inheritBranch(branch);
        return branch;
    }

    public addBranch(branch: BranchSetupType = this.createBranch()): BranchSetupType {
        // Explicit shared component choices also apply to branches added later.
        this.applySharedComponents(branch);
        if (!this.data.branchSetups) this.data.branchSetups = [];
        this.data.branchSetups.push(branch);
        return branch;
    }

    public applySharedComponents(branch: BranchSetupType): void {
        if (this.analytics !== undefined) this.setBranchAnalytics(branch, this.analytics);
        if (this.externalWheelStorage !== undefined) this.setBranchExternalWheelStorage(branch, this.externalWheelStorage);
    }

    // SYNCHRONOUS HTML MAPPING -----------------------------------------------

    public applyHtml(fields: HtmlFields): AutomaticSetupSessionData {
        this.htmlFields = fields;
        this.applyHtmlOrganization(fields);
        (this.data.branchSetups ?? []).forEach(branch => this.applyHtmlBranch(fields, branch));
        return this.data;
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
        const branch = this.createBranch();
        rows.forEach(row => {
            if (row.Interface === 'Branches') this.applyCsvBranch(row, branch);
            if (row.Interface === 'DMS parameters') this.applyCsvDms(row, branch);
            if (row.Interface === 'External wheels') this.applyCsvWheels(row, branch);
        });
        rows.forEach(row => {
            if (row.Interface === 'Database ID' && row.cClientID) this.setDatabaseId(row.cClientID);
        });
        this.addBranch(branch);
        return this.data;
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
