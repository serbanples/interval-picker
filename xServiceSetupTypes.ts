import type {
    ExternalServiceCreate, StandardHandlerConfig, xCarDataReadingsHandlerConfig,
    StandardHandlerConfigWthBrandMapping, StandardHandlerConfigWthMandatoryFields,
    xClientCarConfig, xStorageConfig, xAdditionalInfoConfig, xPoolOpTypeConfig,
    xOrderConfig, xCatalogConfig, xPartsAvailabilityConfig, xPriceInformationConfig,
    xCarDataReadingsConfig, xRentProviderConfig,
} from '../../../dbacc/types';

/** Reuse authoritative configs, including definitions not copied into this repository. */
export interface XServiceConfigMap {
    xClient: xClientCarConfig;
    xWheels: xStorageConfig;
    xAdditionalInfo: xAdditionalInfoConfig;
    xPoolOpType: xPoolOpTypeConfig;
    xOrder: xOrderConfig;
    xCatalog: xCatalogConfig;
    xPartsAvailability: xPartsAvailabilityConfig;
    xPriceInformation: xPriceInformationConfig;
    xCarDataReadings: xCarDataReadingsConfig;
    xRentProvider: xRentProviderConfig;
    // The supplied backend does not narrow the config/handler for xOrderTTS.
    xOrderTTS: ExternalServiceCreate['serviceConfig'];
}
export type XServiceKey = keyof XServiceConfigMap;
export type StandardSetupHandlerConfig = StandardHandlerConfig &
    StandardHandlerConfigWthBrandMapping & StandardHandlerConfigWthMandatoryFields &
    xCarDataReadingsHandlerConfig;

export interface XServiceSetupBase {
    name: string;
    description?: string;
    enabled: boolean;
    global?: boolean;
    handler?: ExternalServiceCreate['handler'];
    baseURL: string;
    authentication?: StandardHandlerConfig['authentication'];
    dlcId?: string;
    clientCertificateId?: string;
    headers?: StandardHandlerConfig['headers'];
    httpHeaders?: StandardHandlerConfig['httpHeaders'];
    brandMapping?: StandardHandlerConfigWthBrandMapping['brandMapping'];
    mandatoryFields?: StandardHandlerConfigWthMandatoryFields['mandatoryFields'];
    keyReaderUserBindings?: xCarDataReadingsHandlerConfig['keyReaderUserBindings'];
    clientCertificate?: ExternalServiceCreate['clientCertificate'];
    extraData?: ExternalServiceCreate['extraData'];
    /** Full configuration for provider-specific handlers, e.g. Vamoso/Euromobil. */
    handlerConfig?: ExternalServiceCreate['handlerConfig'];
    /** Legacy import identifiers; resolved by the application's handler adapter. */
    dealerNumber?: string;
    outletNumber?: string;
    DMS?: string;
    DMSCompanyNumber?: string;
    DMSBranchNumber?: string;
    proxy?: string;
    queryPackageSize?: string;
    user?: string;
    password?: string;
    /** Backward-compatible input alias; backend field is textEnable. */
    enableText?: boolean;
}

/** Flat service options preserve existing import/UI paths. Full config is also supported. */
export type XServiceSetup<K extends XServiceKey> = XServiceSetupBase &
    Partial<XServiceConfigMap[K]> & { serviceConfig?: XServiceConfigMap[K] };
export type BranchXServices = { [K in XServiceKey]?: XServiceSetup<K> };
export type CompleteXServices = { [K in XServiceKey]: XServiceSetup<K> };

/** UI schema supports nested objects and arrays; existing primitive RowType remains valid. */
export type ConfigSchema<T> =
    NonNullable<T> extends string ? { type: 'text'; required?: boolean; readonly?: boolean } :
    NonNullable<T> extends boolean ? { type: 'boolean'; required?: boolean; readonly?: boolean } :
    NonNullable<T> extends number ? { type: 'number'; required?: boolean; readonly?: boolean } :
    NonNullable<T> extends ReadonlyArray<infer Item> ? { type: 'array'; items: ConfigSchema<Item>; required?: boolean } :
    { type: 'object'; fields?: ConfigObjectSchema<T>; required?: boolean };
export type ConfigObjectSchema<T> = { [K in keyof NonNullable<T>]?: ConfigSchema<NonNullable<T>[K]> };
export type BranchXServicesSchema = { [K in XServiceKey]: ConfigObjectSchema<XServiceSetup<K>> };
