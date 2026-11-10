import type { AutomaticSetupSessionData, BranchSetupType } from '../../../dbacc/types/automaticSetup/AutomaticSetupSessionTypes';
import { Factory } from '../../../factory';

/** Organization setup in, new branch out. Synchronous and independent of the parser.
 * Does not mutate the organization, append the branch, or track import conflicts.
 * The optional defaults factory must return a fresh, complete plain object each time.
 * Extend the assignments below when adding organization-to-branch inheritance rules.
 */
export function createBranch(
    organizationSetup: AutomaticSetupSessionData['organizationSetup'],
    createDefaults: () => BranchSetupType = () =>
        Factory.getInstance().getBzl().AutomaticSetupSessionBzl.getDefaultBranchSetup(),
): BranchSetupType {
    const branch = createDefaults();
    const { General, OnlineComponents, ExternalInterfaces } = organizationSetup.OrganizationDetails;

    if (General.preferredLanguage) {
        branch.BranchDetails.General.preferredLanguage = General.preferredLanguage;
    }
    if (OnlineComponents.softAnalytics !== undefined) {
        branch.Settings.Analytics.analyticsDesire = String(OnlineComponents.softAnalytics);
    }
    if (ExternalInterfaces.xStorage !== undefined) {
        branch.BranchDetails.xWheels.enabled = ExternalInterfaces.xStorage;
    }

    return branch;
}
