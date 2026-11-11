import {
    AutomaticSetupSessionType,
    RowType,
    RowTypeEnum,
} from '../../../dbacc/types/automaticSetup/AutomaticSetupSessionTypes';

import {
    organizationDetailsSchema,
    branchDetailsSchema,
} from './automaticSetupSchemas';

export interface ValidationError {
    type: 'error';
}

export type ValidationErrors<T> =
    T extends string | number | boolean ? ValidationError :
    T extends Array<infer Item> ? Array<ValidationErrors<Item>> :
    T extends object ? { [Key in keyof T]?: ValidationErrors<T[Key]> } :
    ValidationError;

type SchemaNode = {
    [key: string]: RowType | SchemaNode;
};

type ErrorNode = {
    [key: string]: ValidationError | ErrorNode;
};

function isRowSchema(node: RowType | SchemaNode): node is RowType {
    return node.type === RowTypeEnum.TEXT ||
        node.type === RowTypeEnum.BOOLEAN ||
        node.type === RowTypeEnum.NUMBER;
}

function isValidValue(value: unknown, schema: RowType): boolean {
    if (value === undefined || value === null) {
        return !schema.required;
    }

    switch (schema.type) {
        case RowTypeEnum.TEXT:
            return typeof value === 'string' &&
                (!schema.required || value.trim().length > 0);
        case RowTypeEnum.BOOLEAN:
            return typeof value === 'boolean';
        case RowTypeEnum.NUMBER:
            return typeof value === 'number' && Number.isFinite(value);
    }

    return false;
}

function validateNode(data: unknown, schema: SchemaNode): ErrorNode {
    const errors: ErrorNode = {};
    const values: Record<string, unknown> =
        data !== null && typeof data === 'object' && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {};

    Object.keys(schema).forEach(key => {
        const fieldSchema = schema[key];
        const value = values[key];

        if (isRowSchema(fieldSchema)) {
            if (!isValidValue(value, fieldSchema)) {
                errors[key] = { type: 'error' };
            }
            return;
        }

        const nestedErrors = validateNode(value, fieldSchema);
        if (Object.keys(nestedErrors).length > 0) {
            errors[key] = nestedErrors;
        }
    });

    return errors;
}

export function validateAutomaticSetupSession(
    session: AutomaticSetupSessionType,
): ValidationErrors<AutomaticSetupSessionType> {
    const errors: ValidationErrors<AutomaticSetupSessionType> = {};
    const organizationErrors = validateNode(
        session.organizationSetup,
        organizationDetailsSchema as unknown as SchemaNode,
    );

    if (Object.keys(organizationErrors).length > 0) {
        errors.organizationSetup = organizationErrors as
            ValidationErrors<AutomaticSetupSessionType['organizationSetup']>;
    }

    const branchErrors = (session.branchSetups || []).map(branch =>
        validateNode(branch, branchDetailsSchema as unknown as SchemaNode),
    );

    if (branchErrors.some(branch => Object.keys(branch).length > 0)) {
        errors.branchSetups = branchErrors as
            ValidationErrors<NonNullable<AutomaticSetupSessionType['branchSetups']>>;
    }

    return errors;
}
