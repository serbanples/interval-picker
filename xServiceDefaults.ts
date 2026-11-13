import type { BranchXServices, CompleteXServices, XServiceKey, XServiceSetup } from './xServiceSetupTypes';

export const xServiceDefinitions = {
    xClient: { type: 'xClientCar', handler: 'xClientCarStandard', flag: 'xClient' },
    xWheels: { type: 'xStorage', handler: 'xStorageStandard', flag: 'xStorage' },
    xAdditionalInfo: { type: 'xAdditionalInfo', handler: 'xAdditionalInfoStandard', flag: 'xAdditionalInfo' },
    xPoolOpType: { type: 'xPoolOpType', handler: 'xPoolOpTypeStandard', flag: 'xPoolOpType' },
    xOrder: { type: 'xOrder', handler: 'xOrderStandard', flag: 'xOrder' },
    xCatalog: { type: 'xCatalog', handler: 'xCatalogStandard', flag: 'xCatalog' },
    xPartsAvailability: { type: 'xPartsAvailability', handler: 'xPartsAvailabilityStandard', flag: 'xPartsAvailability' },
    xPriceInformation: { type: 'xPriceInformation', handler: 'xPriceInformationStandard', flag: 'xPriceInformation' },
    xCarDataReadings: { type: 'xCarDataReadings', handler: 'xCarDataReadingsStandard', flag: 'xCarDataReadings' },
    xRentProvider: { type: 'xRentProvider', handler: 'xRentProviderStandard', flag: 'xRent' },
    // No handler association was supplied for TTS. Require it explicitly on creation.
    xOrderTTS: { type: 'xOrderTTS', handler: '', flag: 'xOrderTTS' },
} as const;
export const xServiceKeys = Object.keys(xServiceDefinitions) as XServiceKey[];

/** Empty editing defaults, not recommended operational settings. Arrays are always fresh. */
export function serviceConfigDefaults(key: XServiceKey): Record<string, unknown> {
    switch (key) {
        case 'xClient': return { autoAddCustomer: false, autoChangeCustomer: false, textEnable: false };
        case 'xWheels': return { minHoursRequest: 0, minHoursRequestExpress: 0, minHoursStornoRequest: 0, addCustomerVehicleToRequest: false };
        case 'xAdditionalInfo': return { autoSelect: 'none', alwaysUpdate: false, alwaysDelete: false };
        case 'xPoolOpType': return { autoSelect: 'none' };
        case 'xOrder': return {
            autoCreateOrder: false, autoUpdateOrder: false, autoSyncOrder: false, autoUpdateStatus: false,
            statusMapping: [], createOrUpdateBasedOnStatuses: false, createOrderBasedOnStatuses: [],
            updateOrderBasedOnStatuses: [], createOrUpdateOrderBasedOnStatuses: [],
        };
        case 'xCatalog': return { isOnTheFlyByRefNrEnabled: false, supportOps: false, supportPacks: false, supportSublets: false };
        default: return {};
    }
}

export function createXServiceSetup<K extends XServiceKey>(key: K): XServiceSetup<K> {
    return {
        name: '', description: '', enabled: false, global: false, baseURL: '',
        dealerNumber: '', outletNumber: '', DMS: '', DMSCompanyNumber: '', DMSBranchNumber: '',
        headers: [], httpHeaders: [], extraData: [],
        ...serviceConfigDefaults(key),
    } as unknown as XServiceSetup<K>;
}

/** Extend existing defaults without discarding already configured values. */
export function initializeBranchXServices<T extends { BranchDetails: BranchXServices }>(branch: T): T {
    xServiceKeys.forEach(key => {
        const setup = { ...createXServiceSetup(key), ...branch.BranchDetails[key] };
        // Older defaults represented missing authentication as an empty string.
        const legacy = setup as unknown as Record<string, unknown>;
        if (legacy.authentication === '') delete legacy.authentication;
        Object.assign(branch.BranchDetails, { [key]: setup });
    });
    return branch;
}

export function createXServiceDefaults(): CompleteXServices {
    return Object.fromEntries(xServiceKeys.map(key => [key, createXServiceSetup(key)])) as CompleteXServices;
}
