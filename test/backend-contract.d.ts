/** Isolated compile contract for the supplied backend declarations.
 * Missing application-only definitions stay opaque; this does not replace a backend build.
 */
declare module '*dbacc/types' {
    export interface HttpHeader { name: string; value: string; }
    export interface StandardHandlerConfig {
        baseURL: string; dlcId?: string; authentication?: object;
        clientCertificateId?: string; headers?: HttpHeader[]; httpHeaders?: HttpHeader[];
    }
    export interface StandardHandlerConfigWthBrandMapping extends StandardHandlerConfig {
        brandMapping?: { nrgBrandCode: string; nrgBrandName: string; extBrandCode: string; extBrandName: string }[];
    }
    export interface StandardHandlerConfigWthMandatoryFields extends StandardHandlerConfig { mandatoryFields?: object[]; }
    export interface xCarDataReadingsHandlerConfig extends StandardHandlerConfig {
        keyReaderUserBindings?: { keyReaderID: string; userIDs: string[] }[];
    }
    export interface xClientCarConfig { readonly autoAddCustomer: boolean; readonly autoChangeCustomer: boolean; readonly textEnable: boolean; }
    export interface xStorageConfig { minHoursRequest: number; minHoursRequestExpress: number; minHoursStornoRequest: number; addCustomerVehicleToRequest: boolean; }
    export interface xAdditionalInfoConfig { readonly autoSelect: 'none' | 'onDisplayPool' | 'onAvailable' | 'full'; readonly alwaysUpdate: boolean; readonly alwaysDelete: boolean; }
    export interface xPoolOpTypeConfig { readonly autoSelect: 'none' | 'onDisplayPool' | 'onAvailable' | 'full'; }
    export interface xOrderConfig {
        autoCreateOrder: boolean; autoUpdateOrder: boolean; autoSyncOrder: boolean; autoUpdateStatus: boolean;
        statusMapping: { readonly orderStatus: string; readonly appointmentStatus: string }[];
        createOrUpdateBasedOnStatuses: boolean; createOrderBasedOnStatuses: string[];
        updateOrderBasedOnStatuses: string[]; createOrUpdateOrderBasedOnStatuses: string[];
    }
    export interface xCatalogConfig { readonly isOnTheFlyByRefNrEnabled: boolean; readonly supportOps: boolean; readonly supportPacks: boolean; readonly supportSublets: boolean; }
    export interface xPartsAvailabilityConfig {}
    export interface xCarDataReadingsConfig {}
    // These definitions were not supplied. Opaque fixture members prevent accidental assumptions.
    export interface xPriceInformationConfig { readonly __opaquePrice: never; }
    export interface xRentProviderConfig { readonly __opaqueRent: never; }
    export interface ProviderConfig { readonly __opaqueProvider: never; }
    export interface ExternalServiceCreate {
        organization?: string; global?: boolean; name: string; description?: string; enabled: boolean;
        type: 'xClientCar' | 'xStorage' | 'xAdditionalInfo' | 'xPoolOpType' | 'xOrder' | 'xCatalog' | 'xPartsAvailability' | 'xPriceInformation' | 'xCarDataReadings' | 'xRentProvider' | 'xOrderTTS';
        handler: string;
        serviceConfig: xClientCarConfig | xStorageConfig | xAdditionalInfoConfig | xPoolOpTypeConfig | xOrderConfig | xCatalogConfig | xPartsAvailabilityConfig | xPriceInformationConfig | xCarDataReadingsConfig | xRentProviderConfig;
        handlerConfig: StandardHandlerConfig | StandardHandlerConfigWthBrandMapping | StandardHandlerConfigWthMandatoryFields | xCarDataReadingsHandlerConfig | ProviderConfig;
        clientCertificate?: object; extraData: { id: string; value: string }[];
    }
}
