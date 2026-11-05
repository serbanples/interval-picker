import type {
  AutomaticSetupSessionData,
  AutomaticSetupFile,
  BranchSetupType,
  BranchServiceBase,
} from './AutomaticSetupSessionTypes';

/** Full editable data, including empty sentinels for metadata not supplied by an import. */
export interface SetupData extends Omit<
  AutomaticSetupSessionData,
  'createdAt' | 'files' | 'branchSetups'
> {
  createdAt: AutomaticSetupSessionData['createdAt'] | '';
  files: Array<Omit<AutomaticSetupFile, 'type'> & { type: AutomaticSetupFile['type'] | '' }>;
  branchSetups: Array<Required<BranchSetupType>>;
}

function emptyService(): BranchServiceBase {
  return {
    name: '',
    description: '',
    enabled: false,
    enableText: false,
    handler: '',
    baseUrl: '',
    dealerNumber: '',
    outletNumber: '',
    dms: '',
    dmsCompanyNumber: '',
    dmsBranchNumber: '',
  };
}

function emptyCustomerService() {
  return { ...emptyService(), autoAddCustomer: false, autoChangeCustomer: false, dmsIp: '' };
}

export function createEmptyBranch(): Required<BranchSetupType> {
  return {
    general: {
      name: '',
      displayName: '',
      firma: '',
      zipCode: '',
      city: '',
      country: '',
      countryCode: '',
      webAddress: '',
      email: '',
      phone: '',
      openingHours: '',
      preferredLanguage: '',
      timezone: '',
      unitName: '',
      unitsHout: '',
    },
    dealerInfo: {
      dealerName: '',
      dealerNumber: '',
      outlerNumber: '',
      dms: '',
      dmsCompanyNumber: '',
      dmsIP: '',
      dmsBranchNumber: '',
    },
    externalServices: {
      xClient: {
        ...emptyService(),
        autoAddCustomer: false,
        autoChangeCustomer: false,
        global: false,
        proxy: '',
        authentication: '',
      },
      xWheels: { ...emptyService(), dmsIp: '', queryPackageSize: '' },
      xAdditionalInfo: emptyCustomerService(),
      xPoolOpType: emptyCustomerService(),
      xOrder: emptyCustomerService(),
      xCatalog: emptyCustomerService(),
      xPartsAvailability: emptyCustomerService(),
      xPriceInformation: emptyCustomerService(),
      xCarDataReadings: emptyCustomerService(),
    },
    settings: {},
  };
}

export function createEmptyFile(): SetupData['files'][number] {
  return { url: '', name: '', type: '', fileHash: '' };
}

/** Fresh objects on every call; one complete editable branch by default. */
export function createEmptySetupData(branchCount = 1): SetupData {
  if (!Number.isSafeInteger(branchCount) || branchCount < 0)
    throw new Error('branchCount must be a non-negative integer');
  return {
    createdAt: '',
    files: [],
    organizationSetup: {
      general: { name: '', description: '', worldName: '', preferredLanguage: '', bmw: false },
      legacyTKP: { databaseId: '', description: '', readOnly: false },
      externalInterfaces: {
        xClient: false,
        xRentProvider: false,
        xStorage: false,
        xAdditionalInfo: false,
        xPoolOpType: false,
        xOrder: false,
        xCatalog: false,
        xPartsAvailability: false,
        xPriceInformation: false,
        xCarDataReadings: false,
      },
      onlineComponents: {
        softDrop: false,
        softCheckout: false,
        softConfirm: false,
        softChat: false,
        softAnalytics: false,
      },
      settings: {},
    },
    branchSetups: Array.from({ length: branchCount }, createEmptyBranch),
  };
}
