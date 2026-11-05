import type { UTCDateTime } from '@nrg/datetime';
import type { with_id } from '../../../types/types';

/* tslint:disable:readonly-keyword readonly-array*/

export interface AutomaticSetupSessionData {
  createdAt: UTCDateTime;
  files?: AutomaticSetupFile[];
  organizationSetup: OrganizationSetupType;
  branchSetups?: BranchSetupType[];
}

export interface AutomaticSetupSessionType extends AutomaticSetupSessionData, with_id {}

export interface AutomaticSetupSessionCreate {
  createdAt: UTCDateTime;
}

export interface AutomaticSetupFile {
  url: string;
  name: string;
  type: AutomaticSetupFileTypeEnum;
  fileHash: string;
}

export enum AutomaticSetupFileTypeEnum {
  CSV = 'CSV',
  HTML = 'HTMl',
}

export interface OrganizationSetupType {
  general: OrganizationGeneral;
  legacyTKP: OrganizationLegacyTKP;
  externalInterfaces: OrganizationExternalInterfaces;
  onlineComponents: OrganizationOnlineComponents;
  settings: object;
}

export interface OrganizationGeneral {
  name: string;
  description: string;
  worldName: string;
  preferredLanguage: string;
  bmw: boolean;
}

export interface OrganizationLegacyTKP {
  databaseId: string;
  description: string;
  readOnly: boolean;
}

export interface OrganizationExternalInterfaces {
  xClient: boolean;
  xRentProvider: boolean;
  xStorage: boolean;
  xAdditionalInfo: boolean;
  xPoolOpType: boolean;
  xOrder: boolean;
  xCatalog: boolean;
  xPartsAvailability: boolean;
  xPriceInformation: boolean;
  xCarDataReadings: boolean;
}

export interface OrganizationOnlineComponents {
  softDrop: boolean;
  softCheckout: boolean;
  softConfirm: boolean;
  softChat: boolean;
  softAnalytics: boolean;
}

export interface BranchSetupType {
  general: BranchGeneral;
  dealerInfo?: BranchDealerInfo;
  externalServices: BranchExternalServices;
  settings: object;
}

export interface BranchGeneral {
  name: string;
  displayName: string;
  firma: string;
  zipCode: string;
  city: string;
  country: string;
  countryCode: string;
  webAddress: string;
  email: string;
  phone: string;
  openingHours: string;
  preferredLanguage: string;
  timezone: string;
  unitName: string;
  unitsHout: string;
}

export interface BranchDealerInfo {
  dealerName: string;
  dealerNumber: string;
  outlerNumber: string;
  dms: string;
  dmsCompanyNumber: string;
  dmsIP: string;
  dmsBranchNumber: string;
}

export interface BranchExternalServices {
  xClient: BranchXClientService;
  xWheels: BranchXWheelsService;
  xAdditionalInfo: BranchXAdditionalInfoService;
  xPoolOpType: BranchXPoolOpTypeService;
  xOrder: BranchXOrderService;
  xCatalog: BranchXCatalogService;
  xPartsAvailability: BranchXPartsAvailabilityService;
  xPriceInformation: BranchXPriceInformationService;
  xCarDataReadings: BranchXCarDataReadingsService;
}

export interface BranchXClientService extends BranchServiceBase, CustomerConfig, GlobalConfig {
  proxy: string;
  authentication: string;
}

export interface BranchXWheelsService
  extends BranchServiceBase, DmsIpConfig, QueryPackageSizeConfig {}

export interface BranchXAdditionalInfoService
  extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXPoolOpTypeService extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXOrderService extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXCatalogService extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXPartsAvailabilityService
  extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXPriceInformationService
  extends BranchServiceBase, CustomerConfig, DmsIpConfig {}
export interface BranchXCarDataReadingsService
  extends BranchServiceBase, CustomerConfig, DmsIpConfig {}

export interface BranchServiceBase {
  name: string;
  description: string;
  enabled: boolean;
  enableText: boolean;
  handler: string;
  baseUrl: string;
  dealerNumber: string;
  outletNumber: string;
  dms: string;
  dmsCompanyNumber: string;
  dmsBranchNumber: string;
}

export interface CustomerConfig {
  autoAddCustomer: boolean;
  autoChangeCustomer: boolean;
}

export interface GlobalConfig {
  global: boolean;
}

export interface DmsIpConfig {
  dmsIp: string;
}

export interface QueryPackageSizeConfig {
  queryPackageSize: string;
}
