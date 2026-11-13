import type {
    AutomaticSetupSessionData as BackendSession,
    BranchSetupType as BackendBranch,
    BranchSetupSchemaType as BackendBranchSchema,
} from '../../../dbacc/types/automaticSetup/AutomaticSetupSessionTypes';
import type { BranchXServices, BranchXServicesSchema } from './xServiceSetupTypes';
export * from './xServiceSetupTypes';

/** Import DTO extensions. Keep the rest of the application's session fields intact. */
export type BranchSetupType = Omit<BackendBranch, 'BranchDetails'> & {
    BranchDetails: Omit<BackendBranch['BranchDetails'], keyof BranchXServices> & BranchXServices;
};
type BackendOrganization = BackendSession['organizationSetup'];
export type OrganizationSetupType = Omit<BackendOrganization, 'OrganizationDetails'> & {
    OrganizationDetails: Omit<BackendOrganization['OrganizationDetails'], 'ExternalInterfaces'> & {
        ExternalInterfaces: BackendOrganization['OrganizationDetails']['ExternalInterfaces'] & {
            xOrderTTS?: boolean;
        };
    };
};
export type AutomaticSetupSessionData = Omit<BackendSession, 'branchSetups' | 'organizationSetup'> & {
    organizationSetup: OrganizationSetupType;
    branchSetups?: BranchSetupType[];
};
export type BranchSetupSchemaType = Omit<BackendBranchSchema, 'BranchDetails'> & {
    BranchDetails: Omit<BackendBranchSchema['BranchDetails'], keyof BranchXServices> & BranchXServicesSchema;
};
