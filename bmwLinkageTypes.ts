import type { StandardHandlerConfig } from '../../../dbacc/types';

/** Dropdown intent; the application resolves these labels to its actual configured options. */
export interface BmwServiceSelection {
    typeContains?: 'ISPA5';
    fallbackTypeLabel?: 'ISPA price information';
    userLabel?: 'SoftNRG' | 'AWP' | 'BMW Key Readings';
}

/** ATBAS has no ExternalServiceTypeEnum value in the supplied backend. */
export interface AtbasSetup {
    name: string;
    description: string;
    enabled: boolean;
    baseUrl: string;
    authenticationType: 'basic';
    authenticationUser: string;
    authentication?: StandardHandlerConfig['authentication'];
    ScopingAppointment: boolean;
    ScopingCustomer: boolean;
    ScopingOrders: boolean;
    ScopingRepairDetails: boolean;
    ScopingVehicle: boolean;
}

export interface BmwLinkageOptions {
    catalogHttpHeader?: NonNullable<StandardHandlerConfig['httpHeaders']>[number];
    atbasBaseUrl?: string;
    atbasAuthentication?: NonNullable<StandardHandlerConfig['authentication']>;
}

export interface BmwLinkageResult {
    appliedBranchIndexes: number[];
    issues: { path: string; message: string }[];
}
