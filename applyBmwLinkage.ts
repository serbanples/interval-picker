import type { BranchXServices, XServiceSetupBase } from './xServiceSetupTypes';
import type { BmwLinkageOptions, BmwLinkageResult, BmwServiceSelection } from './bmwLinkageTypes';
import { createXServiceSetup } from './xServiceDefaults';

type Fields = Record<string, unknown>;
interface BmwBranch {
    BranchDetails: BranchXServices & { DealerInformation?: { DMS?: string; DMSIP?: string } };
    Settings: object;
}
interface BmwSession {
    organizationSetup: {
        OrganizationDetails: { General: { bmw?: boolean }; ExternalInterfaces: object };
        Settings: object;
    };
    branchSetups?: BmwBranch[];
}

export const bmwOrganizationSettings = {
    'AdvancedSearchCustomer.freeTextSearch': false,
    'EditablePrinting.enable': true,
    'AdvancedSearchCustomer.advancedSearch': true,
    'Debtors.enable': true,
    'CBSReplacement.enable': true,
    'RootLevelPacksOnly.enable': true,
    'FeatureTags.standard': true,
    'SnapsExploreDeep.enable': true,
    'ExternalServiceCarDataReadings.BMWKeyReadings': true,
    'ExternalServiceCatalog.ispa5catalog': true,
    'ExternalServiceClientCar.ispa5clientcar': true,
    'ExternalServiceOrder.ispa5orders': true,
    'ExternalServicePartsAvailability.ispa5PartsAvailability': true,
    'ExternalServicePriceInformation.ispa5PriceInformation': true,
    'ExternalServiceAdditionalInfo.awp': true,
    'UserSettings.enableBMWSpecificUserSettings': true,
    'UserSettings.enableUserSettings': true,
    'SnapLockForAppointmentReservation.isEnabled': true,
} as const;

export const bmwBranchSettings = {
    'EnabledFeatures.searchShouldCheckSkillLoadingSA': false,
    'EnabledFeatures.searchShouldCheckSkillLoading': false,
    'EnabledFeatures.deleteClientCarOnLastAppointment': true,
    'EnabledFeatures.clearMissingDMSData': true,
    'EnabledFeatures.opQuantityLocked': false,
    'EnabledFeatures.emailPreselected': false,
    'EnabledFeatures.smsPreselected': false,
    'SkillLoadDistribution.enabled': true,
    'EnabledFeatures.liveUpdateDMSOnly': true,
    'EnabledFeatures.mergeCandidatesDMSOnly': false,
    'EnabledFeatures.clientCarManualMerge': true,
    'EnabledFeatures.signAppointmentContract': true,
    'EnabledFeatures.quotation': true,
    'EnabledFeatures.strictBrandExternalCatalogs': true,
} as const;

const ispaSelection = { typeContains: 'ISPA5' } as const;
export const bmwServiceProfiles = {
    xClient: { name: 'F1 Kundendaten', handler: 'ispa5clientcar', selection: { ...ispaSelection, userLabel: 'SoftNRG' } },
    xAdditionalInfo: { name: 'AWP', handler: 'awp', selection: { userLabel: 'AWP' } },
    // Canonical values from the supplied backend enums, not the checklist's aliases.
    xOrder: { name: 'F1 Auftrassynchronisation', handler: 'ispa5orders', selection: ispaSelection },
    xCatalog: { name: 'F1 Pakete', handler: 'ispa5catalog', selection: ispaSelection },
    xPartsAvailability: { name: 'F1 Teileverfuegbarkeit', handler: 'ispa5PartsAvailability', selection: ispaSelection },
    xPriceInformation: { name: 'F1 Preisabfrage', handler: 'ispa5PriceInformation', selection: { ...ispaSelection, fallbackTypeLabel: 'ISPA price information' } },
    xCarDataReadings: { name: 'Keyreader', handler: 'BMWKeyReadings', selection: { userLabel: 'BMW Key Readings' } },
} as const;
export type BmwServiceKey = keyof typeof bmwServiceProfiles;

/** Retain the existing settings representation (string booleans or actual booleans). */
function setSettings(settings: object, values: Readonly<Record<string, boolean>>): void {
    Object.entries(values).forEach(([path, value]) => {
        const keys = path.split('.');
        let node = settings as Fields;
        keys.slice(0, -1).forEach(key => {
            const child = node[key];
            if (child === undefined) node[key] = {};
            else if (!child || typeof child !== 'object' || Array.isArray(child)) throw new Error(`Invalid settings topic: ${key}`);
            node = node[key] as Fields;
        });
        const key = keys[keys.length - 1];
        node[key] = typeof node[key] === 'string' ? String(value) : value;
    });
}

function dmsUrl(ip: string | undefined): string | undefined {
    const host = ip?.trim();
    if (!host || /[\s/@?#]/.test(host)) return undefined;
    try {
        const address = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
        const url = new URL(`http://${address}:8888/ispa/glue`);
        return url.port === '8888' ? url.href : undefined;
    } catch { return undefined; }
}

function setServiceOptions(service: XServiceSetupBase, values: Record<string, unknown>): void {
    Object.assign(service, values);
    // Full config normally overrides flat values; linkage must update both representations.
    const config = (service as unknown as Fields).serviceConfig;
    if (config && typeof config === 'object') Object.assign(config, values);
}

/**
 * Apply after parsed source assignments/conflicts. The resolved branch DMS, not the
 * manual organization BMW flag, is the sole trigger. Other branches are untouched.
 */
export function applyBmwLinkage(data: BmwSession, options: BmwLinkageOptions = {}): BmwLinkageResult {
    const result: BmwLinkageResult = { appliedBranchIndexes: [], issues: [] };
    const branches = (data.branchSetups ?? []).map((branch, index) => ({ branch, index }))
        .filter(({ branch }) => branch.BranchDetails.DealerInformation?.DMS?.trim() === 'formel1');
    if (!branches.length) return result;

    const organization = data.organizationSetup;
    organization.OrganizationDetails.General.bmw = true;
    Object.keys(bmwServiceProfiles).forEach(key => {
        (organization.OrganizationDetails.ExternalInterfaces as Fields)[key] = true;
    });
    setSettings(organization.Settings, bmwOrganizationSettings);

    branches.forEach(({ branch, index }) => {
        result.appliedBranchIndexes.push(index);
        setSettings(branch.Settings, bmwBranchSettings);
        const baseURL = dmsUrl(branch.BranchDetails.DealerInformation?.DMSIP);
        if (!baseURL) result.issues.push({ path: `branchSetups.${index}.BranchDetails.DealerInformation.DMSIP`, message: 'A valid DMS host/IP is required to build the ISPA5 URL.' });
        (Object.keys(bmwServiceProfiles) as BmwServiceKey[]).forEach(key => {
            const profile = bmwServiceProfiles[key];
            if (!branch.BranchDetails[key]) Object.assign(branch.BranchDetails, { [key]: createXServiceSetup(key) });
            const service = branch.BranchDetails[key]!;
            service.name = profile.name;
            service.enabled = true;
            service.handler = profile.handler as XServiceSetupBase['handler'];
            service.bmwSelection = structuredClone(profile.selection) as BmwServiceSelection;
            service.baseURL = key === 'xAdditionalInfo' ? 'https://awp.bmwgroup.com' :
                key === 'xCarDataReadings' ? 'https://ckf.bmwgroup.com' : baseURL ?? '';
            if (service.handlerConfig) Object.assign(service.handlerConfig, { baseURL: service.baseURL });
            // Header names are logical parameter IDs; the backend adapter encodes HttpHeader.
            if (key !== 'xCarDataReadings') service.handlerParameters = { ...service.handlerParameters, LANGUAGE: 'de-DE' };
        });
        const additional = branch.BranchDetails.xAdditionalInfo!;
        setServiceOptions(additional, { alwaysUpdate: true, alwaysDelete: true, autoSelect: 'full' });
        additional.handlerParameters = {
            ...additional.handlerParameters,
            LEADS_HEADER_AUTHSCHEME: 'B2D', LEADS_HEADER_AUTHTYPE: 'WEN_TOKEN',
            SERVICECASE_HEADER_AUTHSCHEME: 'B2D', SERVICECASE_HEADER_AUTHTYPE: 'WEN_TOKEN',
            SERVICECASE_HEADER_AUTHREALM: 'internetb2x',
            // Preserve the literal key supplied in the linkage specification.
            SERVICECASE_HEADER_BUSINESSCONTEXTv: 'B2D',
        };
        const order = branch.BranchDetails.xOrder!;
        setServiceOptions(order, { autoUpdateOrder: true });
        order.handlerParameters = { ...order.handlerParameters, OUTLET: '1', DISTPARTNER: '1', RELEASEORDER_AFTER_STOREORDER: '0', DATE_IN_LOCALTIME: '1' };
        const catalog = branch.BranchDetails.xCatalog!;
        setServiceOptions(catalog, { isOnTheFlyByRefNrEnabled: true, supportPacks: true, supportSublets: true });
        if (options.catalogHttpHeader) {
            const existing = catalog.httpHeaders ?? [];
            catalog.httpHeaders = existing.some(header => JSON.stringify(header) === JSON.stringify(options.catalogHttpHeader)) ?
                existing : [...existing, structuredClone(options.catalogHttpHeader)];
            if (catalog.handlerConfig) Object.assign(catalog.handlerConfig, { httpHeaders: structuredClone(catalog.httpHeaders) });
            catalog.bmwCatalogHeaderRequired = false;
        } else if (catalog.bmwCatalogHeaderRequired !== false) {
            catalog.bmwCatalogHeaderRequired = true;
            result.issues.push({ path: `branchSetups.${index}.BranchDetails.xCatalog.httpHeaders`, message: 'Supply the exact header name/value for "application soft-planning".' });
        }

        const previous = branch.BranchDetails.ATBAS;
        branch.BranchDetails.ATBAS = {
            ...previous, name: 'ATBAS', description: 'ATBAS', enabled: true,
            baseUrl: options.atbasBaseUrl ?? previous?.baseUrl ?? '',
            authenticationType: 'basic', authenticationUser: 'softplanning',
            ...(options.atbasAuthentication ? { authentication: structuredClone(options.atbasAuthentication) } : {}),
            ScopingAppointment: true, ScopingCustomer: true, ScopingOrders: true,
            ScopingRepairDetails: true, ScopingVehicle: true,
        };
        if (!branch.BranchDetails.ATBAS.baseUrl || /…|\.\.\./.test(branch.BranchDetails.ATBAS.baseUrl)) {
            result.issues.push({ path: `branchSetups.${index}.BranchDetails.ATBAS.baseUrl`, message: 'The ATBAS URL in the specification is truncated; supply the complete URL.' });
        }
        if (!branch.BranchDetails.ATBAS.authentication) {
            result.issues.push({ path: `branchSetups.${index}.BranchDetails.ATBAS.authentication`, message: 'Supply the backend Basic authentication configuration for softplanning.' });
        }
    });
    return result;
}

/** Select exactly one configured dropdown option; ambiguity must not choose an arbitrary account. */
export function selectBmwOption<T extends { label: string }>(options: readonly T[], rule: { contains?: string; exact?: string; fallback?: string }): T {
    const normalized = (value: string) => value.trim().toLocaleLowerCase('en');
    let matches = options.filter(option => rule.exact ? normalized(option.label) === normalized(rule.exact) :
        rule.contains ? normalized(option.label).includes(normalized(rule.contains)) : false);
    if (!matches.length && rule.fallback) matches = options.filter(option => normalized(option.label) === normalized(rule.fallback!));
    if (matches.length !== 1) throw new Error(`BMW selection requires exactly one matching option; found ${matches.length}`);
    return matches[0];
}
