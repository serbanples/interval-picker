import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBmwLinkage, selectBmwOption } from '../applyBmwLinkage.ts';
import { createExternalServices, buildExternalServices } from '../createExternalServices.ts';
import { AutomaticSetupParser } from '../automaticSetupParser.simple.ts';

function branch(dms = '', ip = '') {
    return { BranchDetails: { General: {}, DealerInformation: { DMS: dms, DMSIP: ip } },
        Settings: { Analytics: { analyticsDesire: 'false' }, BMWSettings: {} } };
}
function session(branches = [branch()]) {
    return { organizationSetup: { OrganizationDetails: { General: { bmw: false },
        LegacyTKP: {}, OnlineComponents: {}, ExternalInterfaces: { xPoolOpType: false } }, Settings: {} }, branchSetups: branches };
}
const ready = { catalogHttpHeader: { name: 'test-application', value: 'soft-planning' },
    atbasBaseUrl: 'https://atbas.example/api/notifyAppointment',
    atbasAuthentication: { type: 'basic', username: 'softplanning', password: 'test-only' } };

test('profile is gated on resolved formel1 DMS, regardless of a manual BMW flag', () => {
    for (const dms of ['', 'other', 'FORMEL1', 'formel1-v2']) {
        const data = session([branch(dms, '10.0.0.1')]);
        data.organizationSetup.OrganizationDetails.General.bmw = true;
        const before = structuredClone(data);
        assert.deepEqual(applyBmwLinkage(data), { appliedBranchIndexes: [], issues: [] });
        assert.deepEqual(data, before);
    }
});

test('all organization and branch settings and seven interfaces match the linkage specification', () => {
    const eligible = branch(' formel1 ', '10.0.0.1'), unrelated = branch('other', '10.0.0.2');
    const data = session([eligible, unrelated]);
    const unchanged = structuredClone(unrelated);
    assert.deepEqual(applyBmwLinkage(data, ready), { appliedBranchIndexes: [0], issues: [] });
    assert.deepEqual(unrelated, unchanged);
    assert.deepEqual(data.organizationSetup.OrganizationDetails.ExternalInterfaces, {
        xPoolOpType: false, xClient: true, xAdditionalInfo: true, xOrder: true, xCatalog: true,
        xPartsAvailability: true, xPriceInformation: true, xCarDataReadings: true,
    });
    assert.equal(data.organizationSetup.OrganizationDetails.General.bmw, true);
    assert.deepEqual(data.organizationSetup.Settings, {
        AdvancedSearchCustomer: { freeTextSearch: false, advancedSearch: true },
        EditablePrinting: { enable: true }, Debtors: { enable: true }, CBSReplacement: { enable: true },
        RootLevelPacksOnly: { enable: true }, FeatureTags: { standard: true }, SnapsExploreDeep: { enable: true },
        ExternalServiceCarDataReadings: { BMWKeyReadings: true }, ExternalServiceCatalog: { ispa5catalog: true },
        ExternalServiceClientCar: { ispa5clientcar: true }, ExternalServiceOrder: { ispa5orders: true },
        ExternalServicePartsAvailability: { ispa5PartsAvailability: true },
        ExternalServicePriceInformation: { ispa5PriceInformation: true }, ExternalServiceAdditionalInfo: { awp: true },
        UserSettings: { enableBMWSpecificUserSettings: true, enableUserSettings: true },
        SnapLockForAppointmentReservation: { isEnabled: true },
    });
    assert.deepEqual(eligible.Settings.EnabledFeatures, {
        searchShouldCheckSkillLoadingSA: false, searchShouldCheckSkillLoading: false,
        deleteClientCarOnLastAppointment: true, clearMissingDMSData: true, opQuantityLocked: false,
        emailPreselected: false, smsPreselected: false, liveUpdateDMSOnly: true,
        mergeCandidatesDMSOnly: false, clientCarManualMerge: true, signAppointmentContract: true,
        quotation: true, strictBrandExternalCatalogs: true,
    });
    assert.deepEqual(eligible.Settings.SkillLoadDistribution, { enabled: true });
});

test('all service settings, dropdown intents and parameter values match the checklist', () => {
    const data = session([branch('formel1', '192.168.2.3')]);
    applyBmwLinkage(data, ready);
    const details = data.branchSetups[0].BranchDetails;
    const expected = {
        xClient: ['F1 Kundendaten', 'ispa5clientcar'], xAdditionalInfo: ['AWP', 'awp'],
        xOrder: ['F1 Auftrassynchronisation', 'ispa5orders'], xCatalog: ['F1 Pakete', 'ispa5catalog'],
        xPartsAvailability: ['F1 Teileverfuegbarkeit', 'ispa5PartsAvailability'],
        xPriceInformation: ['F1 Preisabfrage', 'ispa5PriceInformation'], xCarDataReadings: ['Keyreader', 'BMWKeyReadings'],
    };
    for (const [key, [name, handler]] of Object.entries(expected)) {
        assert.equal(details[key].name, name); assert.equal(details[key].enabled, true); assert.equal(details[key].handler, handler);
        assert.equal(details[key].baseURL, key === 'xAdditionalInfo' ? 'https://awp.bmwgroup.com' :
            key === 'xCarDataReadings' ? 'https://ckf.bmwgroup.com' : 'http://192.168.2.3:8888/ispa/glue');
    }
    assert.deepEqual(details.xClient.bmwSelection, { typeContains: 'ISPA5', userLabel: 'SoftNRG' });
    assert.deepEqual(details.xAdditionalInfo.bmwSelection, { userLabel: 'AWP' });
    assert.deepEqual(details.xCarDataReadings.bmwSelection, { userLabel: 'BMW Key Readings' });
    assert.deepEqual(details.xPriceInformation.bmwSelection, { typeContains: 'ISPA5', fallbackTypeLabel: 'ISPA price information' });
    for (const key of ['xClient', 'xOrder', 'xCatalog', 'xPartsAvailability', 'xPriceInformation']) assert.equal(details[key].handlerParameters.LANGUAGE, 'de-DE');
    assert.deepEqual(details.xAdditionalInfo.handlerParameters, {
        LANGUAGE: 'de-DE', LEADS_HEADER_AUTHSCHEME: 'B2D', LEADS_HEADER_AUTHTYPE: 'WEN_TOKEN',
        SERVICECASE_HEADER_AUTHSCHEME: 'B2D', SERVICECASE_HEADER_AUTHTYPE: 'WEN_TOKEN',
        SERVICECASE_HEADER_AUTHREALM: 'internetb2x', SERVICECASE_HEADER_BUSINESSCONTEXTv: 'B2D',
    });
    assert.equal(details.xAdditionalInfo.alwaysUpdate, true); assert.equal(details.xAdditionalInfo.alwaysDelete, true);
    assert.equal(details.xAdditionalInfo.autoSelect, 'full'); assert.equal(details.xOrder.autoUpdateOrder, true);
    assert.deepEqual(details.xOrder.handlerParameters, { LANGUAGE: 'de-DE', OUTLET: '1', DISTPARTNER: '1', RELEASEORDER_AFTER_STOREORDER: '0', DATE_IN_LOCALTIME: '1' });
    assert.equal(details.xCatalog.isOnTheFlyByRefNrEnabled, true); assert.equal(details.xCatalog.supportPacks, true); assert.equal(details.xCatalog.supportSublets, true);
    assert.deepEqual(details.xCatalog.httpHeaders, [ready.catalogHttpHeader]);
    assert.deepEqual(details.ATBAS, {
        name: 'ATBAS', description: 'ATBAS', enabled: true, baseUrl: ready.atbasBaseUrl,
        authenticationType: 'basic', authenticationUser: 'softplanning', authentication: ready.atbasAuthentication,
        ScopingAppointment: true, ScopingCustomer: true, ScopingOrders: true, ScopingRepairDetails: true, ScopingVehicle: true,
    });
});

test('linkage overrides full config too, preserves unrelated headers and existing setting types, and is idempotent', () => {
    const data = session([branch('formel1', '::1')]);
    data.organizationSetup.Settings.AdvancedSearchCustomer = { advancedSearch: 'false', freeTextSearch: 'true' };
    const details = data.branchSetups[0].BranchDetails;
    details.xOrder = { name: 'old', enabled: false, baseURL: 'old', serviceConfig: { autoUpdateOrder: false }, handlerConfig: { baseURL: 'old' } };
    details.xCatalog = { name: '', enabled: false, baseURL: '', httpHeaders: [{ name: 'keep', value: 'yes' }] };
    applyBmwLinkage(data, ready);
    assert.equal(details.xOrder.serviceConfig.autoUpdateOrder, true);
    assert.equal(details.xOrder.handlerConfig.baseURL, 'http://[::1]:8888/ispa/glue');
    assert.deepEqual(data.organizationSetup.Settings.AdvancedSearchCustomer, { advancedSearch: 'true', freeTextSearch: 'false' });
    assert.equal(details.xCatalog.httpHeaders.length, 2);
    const before = structuredClone(data);
    applyBmwLinkage(data, ready);
    assert.deepEqual(data, before);
});

test('incomplete URL/authentication/catalog inputs remain explicit issues and prevent backend writes', async () => {
    const data = session([branch('formel1')]);
    const issues = applyBmwLinkage(data).issues;
    assert.equal(issues.length, 4);
    assert.equal(data.branchSetups[0].BranchDetails.xClient.baseURL, '');
    let writes = 0;
    const writer = { create: () => { writes++; return Promise.resolve({ _id: 'id' }); },
        publishOnBranches: () => Promise.resolve(), createAtbas: () => { writes++; return Promise.resolve(); } };
    await assert.rejects(createExternalServices(writer, {}, data.branchSetups[0].BranchDetails, 'org', 'branch'), /ATBAS.*baseUrl/);
    assert.equal(writes, 0);
});

test('dropdown selection requires a unique match and only uses the fallback when no ISPA5 match exists', () => {
    assert.equal(selectBmwOption([{ label: 'Unique ISPA5 option' }], { contains: 'ISPA5' }).label, 'Unique ISPA5 option');
    assert.equal(selectBmwOption([{ label: 'ISPA price information' }], { contains: 'ISPA5', fallback: 'ISPA price information' }).label, 'ISPA price information');
    assert.throws(() => selectBmwOption([{ label: 'one ISPA5' }, { label: 'two ISPA5' }, { label: 'ISPA price information' }], { contains: 'ISPA5', fallback: 'ISPA price information' }), /found 2/);
    assert.throws(() => selectBmwOption([], { exact: 'SoftNRG' }), /found 0/);
});

test('HTML runs linkage after raw assignments, and a later conflicting DMS removes derived values', () => {
    const data = session();
    const parser = new AutomaticSetupParser(data);
    parser.bmwLinkageOptions = ready;
    parser.applyHtml({ dms_name: 'formel1', dms_ip: '10.1.2.3' });
    assert.equal(data.branchSetups[0].BranchDetails.xClient.handler, 'ispa5clientcar');
    assert.deepEqual(parser.bmwLinkageResult.appliedBranchIndexes, [0]);
    parser.applyHtml({ dms_name: 'other' });
    assert.equal(data.branchSetups[0].BranchDetails.DealerInformation.DMS, '');
    assert.deepEqual(parser.conflicts.branchSetups['0'].BranchDetails.DealerInformation.DMS, ['formel1', 'other']);
    assert.deepEqual(parser.bmwLinkageResult.appliedBranchIndexes, []);
    assert.equal(data.organizationSetup.OrganizationDetails.General.bmw, false);
    assert.equal(data.branchSetups[0].BranchDetails.ATBAS, undefined);
});

test('HTML first then CSV applies the profile only after the CSV DMS assignment', async () => {
    const { setTestBranchFactory } = await import('../../../factory');
    setTestBranchFactory(() => branch());
    const data = session([]);
    const parser = new AutomaticSetupParser(data);
    parser.bmwLinkageOptions = ready;
    parser.applyHtml({ dms_ip: '10.9.8.7' });
    assert.equal(data.organizationSetup.OrganizationDetails.General.bmw, false);
    parser.applyCsv([{ Interface: 'Branches', cName: 'Branch' }, { Interface: 'DMS parameters', cOptionID: 'DMS', cValue: 'formel1' }]);
    assert.equal(data.branchSetups[0].BranchDetails.xClient.baseURL, 'http://10.9.8.7:8888/ispa/glue');
    assert.deepEqual(parser.bmwLinkageResult.appliedBranchIndexes, [0]);
});

test('CSV first then HTML fills the DMS URL after processing, while a non-formel1 branch stays unchanged', async () => {
    const { setTestBranchFactory } = await import('../../../factory');
    setTestBranchFactory(() => branch());
    const data = session([]), parser = new AutomaticSetupParser(data);
    parser.bmwLinkageOptions = ready;
    parser.applyCsv([{ Interface: 'Branches' }, { Interface: 'DMS parameters', cOptionID: 'DMS', cValue: 'formel1' }]);
    assert.ok(parser.bmwLinkageResult.issues.some(issue => issue.path.endsWith('DMSIP')));
    parser.applyHtml({ dms_ip: '10.9.8.6' });
    assert.equal(data.branchSetups[0].BranchDetails.xOrder.baseURL, 'http://10.9.8.6:8888/ispa/glue');
    assert.deepEqual(parser.bmwLinkageResult.issues, []);
    parser.applyCsv([{ Interface: 'Branches' }, { Interface: 'DMS parameters', cOptionID: 'DMS', cValue: 'other' }]);
    assert.equal(data.branchSetups[1].BranchDetails.xClient.handler, undefined);
    assert.equal(data.branchSetups[1].BranchDetails.ATBAS, undefined);
});

test('backend mapping preserves all BMW payload values and invokes a separate ATBAS writer', async () => {
    const data = session([branch('formel1', '10.2.3.4')]);
    applyBmwLinkage(data, ready);
    const details = data.branchSetups[0].BranchDetails;
    const selections = [];
    const options = {
        getDefaults: (_key, handler) => ({ handler, handlerConfig: { baseURL: '' }, serviceConfig: {}, extraData: [] }),
        resolveBmwSelection: (key, selection, config) => { selections.push([key, selection]); return { ...config, baseURL: 'must-not-override-profile' }; },
        resolveHandlerParameters: (_key, parameters, headers = []) => {
            const values = new Map(headers.map(header => [header.name, header.value]));
            Object.entries(parameters).forEach(([name, value]) => values.set(name, value));
            return [...values].map(([name, value]) => ({ name, value }));
        },
    };
    const payloads = buildExternalServices(details, 'org', options);
    assert.equal(payloads.length, 7);
    const order = payloads.find(payload => payload.type === 'xOrder');
    assert.equal(order.serviceConfig.autoUpdateOrder, true);
    assert.equal(order.handlerConfig.baseURL, 'http://10.2.3.4:8888/ispa/glue');
    assert.ok(order.handlerConfig.headers.some(header => header.name === 'RELEASEORDER_AFTER_STOREORDER' && header.value === '0'));
    assert.deepEqual(payloads.find(payload => payload.type === 'xCatalog').handlerConfig.httpHeaders, [ready.catalogHttpHeader]);
    assert.equal(selections.length, 7);
    let atbas;
    const created = await createExternalServices({
        create: (_ctx, payload) => Promise.resolve({ _id: payload.type }), publishOnBranches: () => Promise.resolve(),
        createAtbas: (_ctx, config, org, branchId) => { atbas = { config, org, branchId }; return Promise.resolve(); },
    }, {}, details, 'org', 'branch-id', options);
    assert.equal(created.length, 7);
    assert.deepEqual(atbas, { config: details.ATBAS, org: 'org', branchId: 'branch-id' });
});

test('missing BMW dropdown/parameter resolvers and ATBAS writer fail before writes', async () => {
    const data = session([branch('formel1', '10.2.3.4')]);
    applyBmwLinkage(data, ready);
    const details = data.branchSetups[0].BranchDetails;
    assert.throws(() => buildExternalServices(details, 'org'), /resolveBmwSelection/);
    assert.throws(() => buildExternalServices(details, 'org', { resolveBmwSelection: (_key, _selection, config) => config }), /resolveHandlerParameters/);
    let writes = 0;
    await assert.rejects(createExternalServices({ create: () => { writes++; return Promise.resolve({ _id: 'id' }); }, publishOnBranches: () => Promise.resolve() }, {}, details, 'org', 'branch'), /createAtbas/);
    assert.equal(writes, 0);
});
