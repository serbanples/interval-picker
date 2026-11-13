import { serviceConfigDefaults, xServiceKeys } from './xServiceDefaults';
import type { XServiceKey } from './xServiceSetupTypes';

/** Primitive nodes retain RowType's shape. Object/array nodes extend the UI schema. */
export interface ServiceSchemaNode {
    type: 'text' | 'boolean' | 'number' | 'object' | 'array';
    required?: boolean;
    readonly?: boolean;
    fields?: Record<string, ServiceSchemaNode>;
    items?: ServiceSchemaNode;
}
export type ServiceSchema = Record<string, ServiceSchemaNode>;
const text = (): ServiceSchemaNode => ({ type: 'text' });
const bool = (): ServiceSchemaNode => ({ type: 'boolean' });
const object = (fields?: ServiceSchema): ServiceSchemaNode => ({ type: 'object', ...(fields ? { fields } : {}) });
const array = (items: ServiceSchemaNode): ServiceSchemaNode => ({ type: 'array', items });

/** Supply schemas for opaque application types (authentication, headers, provider configs). */
export function createXServiceSchemas(overrides: Partial<Record<XServiceKey, ServiceSchema>> = {}): Record<XServiceKey, ServiceSchema> {
    return Object.fromEntries(xServiceKeys.map(key => {
        const schema: ServiceSchema = {
            handlerParameters: object(), bmwSelection: object(), bmwCatalogHeaderRequired: bool(),
            name: { type: 'text', required: true }, description: text(), enabled: bool(), global: bool(),
            handler: text(), baseURL: text(), authentication: object(), dlcId: text(), clientCertificateId: text(),
            headers: array(object()), httpHeaders: array(object()), clientCertificate: object(),
            extraData: array(object({ id: { type: 'text', required: true }, value: text() })),
            brandMapping: array(object({ nrgBrandCode: text(), nrgBrandName: text(), extBrandCode: text(), extBrandName: text() })),
            mandatoryFields: array(object()),
            keyReaderUserBindings: array(object({ keyReaderID: { type: 'text', required: true }, userIDs: array(text()) })),
            dealerNumber: text(), outletNumber: text(), DMS: text(), DMSCompanyNumber: text(), DMSBranchNumber: text(),
            proxy: text(), queryPackageSize: text(), user: text(), password: text(), enableText: bool(),
            handlerConfig: object(), serviceConfig: object(),
        };
        Object.entries(serviceConfigDefaults(key)).forEach(([field, value]) => {
            schema[field] = Array.isArray(value) ? array(text()) :
                { type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text' };
        });
        if (key === 'xOrder') {
            schema.statusMapping = array(object({ orderStatus: text(), appointmentStatus: text() }));
        }
        return [key, { ...schema, ...overrides[key] }];
    })) as Record<XServiceKey, ServiceSchema>;
}

export interface ServiceValidationErrors { [key: string]: ServiceValidationErrors | { type: 'error' }; }

/** Validate present service objects only. Array error entries preserve their source indexes. */
export function validateXServiceSchema(value: unknown, schema: ServiceSchema): ServiceValidationErrors {
    const errors: ServiceValidationErrors = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { _self: { type: 'error' } };
    Object.entries(schema).forEach(([key, rule]) => {
        const item = (value as Record<string, unknown>)[key];
        if (item === undefined || item === null || item === '') {
            if (rule.required) errors[key] = { type: 'error' };
            return;
        }
        if (rule.type === 'object') {
            const nested = validateXServiceSchema(item, rule.fields ?? {});
            if (Object.keys(nested).length) errors[key] = nested;
        } else if (rule.type === 'array') {
            if (!Array.isArray(item)) errors[key] = { type: 'error' };
            else if (rule.items) {
                const entries = item.map(child => validateXServiceSchema({ item: child }, { item: rule.items! }));
                if (entries.some(entry => Object.keys(entry).length)) {
                    // Each slot contains the item's errors, or {}, exactly matching input indexes.
                    errors[key] = entries.map(entry => entry.item ?? {}) as unknown as ServiceValidationErrors;
                }
            }
        } else {
            const expected = rule.type === 'text' ? 'string' : rule.type;
            if (typeof item !== expected || (expected === 'number' && !Number.isFinite(item))) errors[key] = { type: 'error' };
        }
    });
    return errors;
}

/** ATBAS belongs to a separate backend writer, not the xService type enum. */
export function createAtbasSchema(): ServiceSchema {
    return {
        name: { type: 'text', required: true }, description: text(), enabled: bool(),
        baseUrl: { type: 'text', required: true }, authenticationType: { type: 'text', required: true },
        authenticationUser: { type: 'text', required: true }, authentication: { type: 'object', required: true },
        ScopingAppointment: bool(), ScopingCustomer: bool(), ScopingOrders: bool(),
        ScopingRepairDetails: bool(), ScopingVehicle: bool(),
    };
}
