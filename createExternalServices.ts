import type { ExternalServiceCreate } from '../../../dbacc/types';
import type { BranchXServices, StandardSetupHandlerConfig, XServiceKey, XServiceSetupBase } from './xServiceSetupTypes';
import { serviceConfigDefaults, xServiceDefinitions, xServiceKeys } from './xServiceDefaults';

type HandlerConfig = ExternalServiceCreate['handlerConfig'];
export interface ServiceBuildOptions {
    /** Retain the existing backend factory's operational and handler defaults. */
    getDefaults?: (key: XServiceKey, handler: ExternalServiceCreate['handler']) => ExternalServiceCreate;
    /** Reuse existing DMS/4Wheels/proxy adapters. Must return the final handler config. */
    resolveLegacyHandler?: (key: XServiceKey, setup: XServiceSetupBase,
        handler: ExternalServiceCreate['handler'], config: HandlerConfig) => HandlerConfig;
    /** Disabled editing placeholders are excluded by default. */
    includeDisabled?: boolean;
}

const handlers: Record<XServiceKey, readonly string[]> = {
    xClient: ['xClientCarStandard', 'dmsbbclientcar', 'werbasclientcar', 'customeroneclientcar', 'ispa5clientcar'],
    xWheels: ['xStorageStandard', '4Wheels', 'MBTireManager'],
    xAdditionalInfo: ['xAdditionalInfoStandard', 'dmsbbfs', 'awp'],
    xPoolOpType: ['xPoolOpTypeStandard', 'dmsbbtc'],
    xOrder: ['xOrderStandard', 'werbasorders', 'dmsbborders', 'ispa5orders', 'AlphaPlus', 'AlphaPlusV2'],
    xCatalog: ['xCatalogStandard', 'ispa5catalog'],
    xPartsAvailability: ['xPartsAvailabilityStandard', 'ispa5PartsAvailability'],
    xPriceInformation: ['xPriceInformationStandard', 'ispa5PriceInformation'],
    xCarDataReadings: ['xCarDataReadingsStandard', 'BMWKeyReadings'],
    xRentProvider: ['xRentProviderStandard', 'vamoso', 'euromobil'],
    // The backend union alone does not specify which handler belongs to TTS.
    xOrderTTS: [],
};
const standardFields = ['baseURL', 'authentication', 'dlcId', 'clientCertificateId',
    'headers', 'httpHeaders', 'brandMapping', 'mandatoryFields', 'keyReaderUserBindings'] as const;
const legacyFields = ['dealerNumber', 'outletNumber', 'DMS', 'DMSCompanyNumber',
    'DMSBranchNumber', 'proxy', 'queryPackageSize', 'user', 'password'] as const;

function clone<T>(value: T): T {
    return structuredClone(value);
}
function defined(value: object): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/** Pure conversion: validate/build the entire branch before performing any writes. */
export function buildExternalServices(
    details: BranchXServices,
    organization: NonNullable<ExternalServiceCreate['organization']>,
    options: ServiceBuildOptions = {},
): ExternalServiceCreate[] {
    const result: ExternalServiceCreate[] = [];
    xServiceKeys.forEach(key => {
        const setup = details[key];
        if (!setup || (!setup.enabled && !options.includeDisabled)) return;
        if (typeof setup.authentication === 'string') {
            throw new Error(`${key}: authentication must be an HttpAuthentication object; remove legacy empty strings`);
        }
        const definition = xServiceDefinitions[key];
        const handler = (setup.handler || definition.handler) as ExternalServiceCreate['handler'];
        if (!handler) throw new Error(`${key}: an explicit handler is required`);
        if (key !== 'xOrderTTS' && !handlers[key].includes(handler)) {
            throw new Error(`${key}: incompatible handler ${handler}`);
        }
        const defaults = options.getDefaults?.(key, handler);
        if (key === 'xOrderTTS' && (!defaults || defaults.handler !== handler || defaults.type !== definition.type)) {
            throw new Error('xOrderTTS: backend defaults must confirm the selected type/handler combination');
        }
        const knownConfig = serviceConfigDefaults(key);
        const configFields = [...new Set([...Object.keys(knownConfig), ...Object.keys(defaults?.serviceConfig ?? {})])];
        const flat = setup as unknown as Record<string, unknown>;
        const serviceConfig = {
            ...knownConfig, ...defined(defaults?.serviceConfig ?? {}),
            ...Object.fromEntries(configFields.filter(field => flat[field] !== undefined).map(field => [field, flat[field]])),
            ...defined(setup.serviceConfig ?? {}),
        };
        if (key === 'xClient' && flat.textEnable === undefined && setup.enableText !== undefined &&
            (setup.serviceConfig as Record<string, unknown> | undefined)?.textEnable === undefined) {
            serviceConfig.textEnable = setup.enableText;
        }
        if (['xPriceInformation', 'xRentProvider', 'xOrderTTS'].includes(key) &&
            setup.serviceConfig === undefined && defaults === undefined) {
            throw new Error(`${key}: provide complete serviceConfig or backend factory defaults`);
        }

        const providerSpecific = handler === 'vamoso' || handler === 'euromobil';
        let handlerConfig: HandlerConfig;
        if (providerSpecific) {
            if (!setup.handlerConfig && !defaults?.handlerConfig) {
                throw new Error(`${key}/${handler}: provider handlerConfig is required`);
            }
            handlerConfig = clone(setup.handlerConfig ?? defaults!.handlerConfig);
        } else {
            const standard = { ...defined(defaults?.handlerConfig ?? {}) };
            standardFields.forEach(field => {
                // Empty import defaults must not erase a factory's endpoint/header template.
                const value = setup[field];
                if (value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)) standard[field] = value;
            });
            handlerConfig = { baseURL: '', ...standard, ...defined(setup.handlerConfig ?? {}) } as StandardSetupHandlerConfig;
        }
        const needsLegacyMapping = legacyFields.some(field => setup[field] !== undefined && setup[field] !== '');
        if (needsLegacyMapping && !options.resolveLegacyHandler) {
            throw new Error(`${key}: resolveLegacyHandler is required for imported dealer/DMS/provider fields`);
        }
        if (options.resolveLegacyHandler) {
            handlerConfig = options.resolveLegacyHandler(key, clone(setup), handler, clone(handlerConfig));
        }
        result.push(clone({
            // Do not spread factory identity/version/certificate references into a new service.
            organization, global: setup.global ?? defaults?.global ?? false,
            name: setup.name, description: setup.description ?? defaults?.description,
            enabled: setup.enabled, type: definition.type as ExternalServiceCreate['type'], handler,
            serviceConfig: serviceConfig as ExternalServiceCreate['serviceConfig'], handlerConfig,
            extraData: setup.extraData ?? defaults?.extraData ?? [],
            ...(setup.clientCertificate ? { clientCertificate: setup.clientCertificate } : {}),
        }));
    });
    return result;
}

export interface ExternalServiceWriter<Context, Created extends { _id: string }> {
    create: (context: Context, data: ExternalServiceCreate) => PromiseLike<Created>;
    publishOnBranches: (context: Context, ids: string[], branchIds: string[]) => PromiseLike<unknown>;
}

/** Replacement for separate DMS/wheels creation loops. Preserves create -> publish order. */
export function createExternalServices<Context, Created extends { _id: string }>(
    writer: ExternalServiceWriter<Context, Created>, context: Context,
    details: BranchXServices, organization: NonNullable<ExternalServiceCreate['organization']>,
    branchId: string, options: ServiceBuildOptions = {},
): Promise<Created[]> {
    return Promise.resolve().then(() => buildExternalServices(details, organization, options)).then(payloads =>
        payloads.reduce<Promise<Created[]>>((chain, payload) => chain.then(created =>
            Promise.resolve(writer.create(context, payload)).then(service =>
                Promise.resolve(writer.publishOnBranches(context, [service._id], [branchId]))
                    .then(() => [...created, service])),
        ), Promise.resolve([])),
    );
}
