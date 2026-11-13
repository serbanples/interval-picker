import type { AutomaticSetupSessionData, BranchSetupType } from './AutomaticSetupSessionTypes';
import { initializeBranchXServices, xServiceDefinitions, xServiceKeys } from './xServiceDefaults';
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
    const branch = initializeBranchXServices(createDefaults());
    const { General, OnlineComponents, ExternalInterfaces } = organizationSetup.OrganizationDetails;

    if (General.preferredLanguage) {
        branch.BranchDetails.General.preferredLanguage = General.preferredLanguage;
    }
    if (OnlineComponents.softAnalytics !== undefined) {
        branch.Settings.Analytics.analyticsDesire = String(OnlineComponents.softAnalytics);
    }
    const flags = ExternalInterfaces as unknown as Record<string, boolean | undefined>;
    xServiceKeys.forEach(key => {
        const flag = xServiceDefinitions[key].flag;
        const enabled = flags[flag] ?? (key === 'xRentProvider' ? flags.xRentProvider : undefined);
        if (enabled !== undefined) branch.BranchDetails[key]!.enabled = enabled;
    });

    return branch;
}

