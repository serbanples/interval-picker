import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExternalServices, createExternalServices } from '../createExternalServices.ts';
import { createXServiceDefaults, createXServiceSetup, initializeBranchXServices, xServiceKeys } from '../xServiceDefaults.ts';
import { createXServiceSchemas, validateXServiceSchema } from '../xServiceSchemas.ts';

function enabled(key: Parameters<typeof createXServiceSetup>[0]) {
    return { ...createXServiceSetup(key), name: key, enabled: true, baseURL: 'https://service.example' };
}

test('all eleven service defaults are independent and contain service-specific fields', () => {
    const a = createXServiceDefaults(), b = createXServiceDefaults();
    assert.equal(Object.keys(a).length, 11);
    assert.equal(a.xAdditionalInfo.autoSelect, 'none');
    assert.equal(a.xWheels.minHoursStornoRequest, 0);
    a.xOrder.statusMapping!.push({ orderStatus: 'open', appointmentStatus: 'new' });
    assert.deepEqual(b.xOrder.statusMapping, []);
    assert.deepEqual(a.xOrder.createOrderBasedOnStatuses, []);
});

test('every known service maps to its backend type and preserves configured values', () => {
    const services = createXServiceDefaults();
    for (const key of xServiceKeys.filter(key => !['xRentProvider', 'xOrderTTS', 'xPriceInformation'].includes(key))) {
        services[key] = enabled(key);
    }
    services.xClient.textEnable = true;
    services.xOrder.statusMapping = [{ orderStatus: 'open', appointmentStatus: 'new' }];
    services.xOrder.autoSyncOrder = true;
    services.xCatalog.supportSublets = true;
    services.xAdditionalInfo.alwaysDelete = true;
    const result = buildExternalServices(services, 'org');
    assert.equal(result.length, 8);
    assert.equal(result.find(s => s.name === 'xClient')!.type, 'xClientCar');
    assert.equal(result.find(s => s.name === 'xWheels')!.type, 'xStorage');
    assert.equal(result.find(s => s.name === 'xClient')!.serviceConfig.textEnable, true);
    assert.deepEqual(result.find(s => s.name === 'xOrder')!.serviceConfig.statusMapping, services.xOrder.statusMapping);
    assert.equal(result.find(s => s.name === 'xCatalog')!.serviceConfig.supportSublets, true);
    assert.equal(result.find(s => s.name === 'xAdditionalInfo')!.serviceConfig.alwaysDelete, true);
    assert.deepEqual(result.find(s => s.name === 'xCarDataReadings')!.serviceConfig, {});
});

test('omitted/disabled services are skipped; explicitly including disabled services is supported', () => {
    assert.deepEqual(buildExternalServices({}, 'org'), []);
    assert.deepEqual(buildExternalServices(createXServiceDefaults(), 'org'), []);
    assert.equal(buildExternalServices({ xClient: createXServiceSetup('xClient') }, 'org', { includeDisabled: true })[0].enabled, false);
});

test('legacy enableText maps to textEnable, and explicit canonical false wins', () => {
    const legacy = { name: 'client', enabled: true, baseURL: '', enableText: true };
    assert.equal(buildExternalServices({ xClient: legacy }, 'org')[0].serviceConfig.textEnable, true);
    assert.equal(buildExternalServices({ xClient: { ...legacy, textEnable: false } }, 'org')[0].serviceConfig.textEnable, false);
    assert.equal(buildExternalServices({ xClient: { ...legacy, serviceConfig: { textEnable: false } } }, 'org')[0].serviceConfig.textEnable, false);
});

test('full handler data, certificate and extraData survive without shared references', () => {
    const setup = {
        ...enabled('xCarDataReadings'), handler: 'BMWKeyReadings', global: true,
        authentication: { type: 'basic', username: 'u', password: 'p' },
        clientCertificateId: 'cert', clientCertificate: { name: 'certificate' },
        dlcId: 'dlc', headers: [{ name: 'parameter', value: 'value' }],
        httpHeaders: [{ name: 'Authorization', value: 'test' }],
        brandMapping: [{ nrgBrandCode: 'a', nrgBrandName: 'A', extBrandCode: 'b', extBrandName: 'B' }],
        mandatoryFields: [{ id: 'm' }], keyReaderUserBindings: [{ keyReaderID: 'r', userIDs: ['user'] }],
        extraData: [{ id: 'foo', value: 'bar' }],
    };
    const output = buildExternalServices({ xCarDataReadings: setup }, 'org')[0];
    assert.equal(output.global, true);
    for (const key of ['authentication', 'clientCertificateId', 'dlcId', 'headers', 'httpHeaders', 'brandMapping', 'mandatoryFields', 'keyReaderUserBindings']) {
        assert.deepEqual(output.handlerConfig[key], setup[key]);
    }
    assert.deepEqual(output.clientCertificate, setup.clientCertificate);
    output.handlerConfig.keyReaderUserBindings[0].userIDs.push('other');
    assert.deepEqual(setup.keyReaderUserBindings[0].userIDs, ['user']);
});

test('factory defaults are retained; explicit false/0/empty arrays override config defaults', () => {
    const setup = { ...enabled('xOrder'), autoSyncOrder: false, createOrderBasedOnStatuses: [] };
    const result = buildExternalServices({ xOrder: setup }, 'org', {
        getDefaults: () => ({ _id: 'do-not-copy', version: 12, serviceConfig: { autoSyncOrder: true, createOrderBasedOnStatuses: ['new'] },
            handlerConfig: { baseURL: 'default', headers: [{ name: 'keep', value: 'yes' }] } }),
    })[0];
    assert.equal(result.serviceConfig.autoSyncOrder, false);
    assert.deepEqual(result.serviceConfig.createOrderBasedOnStatuses, []);
    assert.deepEqual(result.handlerConfig.headers, [{ name: 'keep', value: 'yes' }]);
    assert.equal(result.handlerConfig.baseURL, setup.baseURL);
    assert.equal(result._id, undefined);
    assert.equal(result.version, undefined);
});

test('legacy identifiers require an adapter and reach it intact', () => {
    const setup = { ...enabled('xWheels'), handler: '4Wheels', dealerNumber: '123', user: 'u', password: 'p', queryPackageSize: '10' };
    assert.throws(() => buildExternalServices({ xWheels: setup }, 'org'), /resolveLegacyHandler/);
    const result = buildExternalServices({ xWheels: setup }, 'org', {
        resolveLegacyHandler: (key, source, handler, config) => {
            assert.equal(key, 'xWheels'); assert.equal(handler, '4Wheels');
            assert.equal(source.queryPackageSize, '10'); assert.equal(source.password, 'p');
            return { ...config, headers: [{ name: '[FILTER_4WHEELS_DEALER_NUMBER]', value: source.dealerNumber }] };
        },
    })[0];
    assert.deepEqual(result.handlerConfig.headers, [{ name: '[FILTER_4WHEELS_DEALER_NUMBER]', value: '123' }]);
});

test('provider-specific handler config is preserved and unknown configs are never invented', () => {
    assert.throws(() => buildExternalServices({ xPriceInformation: enabled('xPriceInformation') }, 'org'), /complete serviceConfig/);
    const config = { baseUrl: 'provider', mandant: 'm', user: 'u', password: 'p', source: 's', branchId: 'b', extraData: [{ key: 'x', value: 'y' }] };
    const setup = { ...enabled('xRentProvider'), handler: 'vamoso', serviceConfig: {}, handlerConfig: config };
    const result = buildExternalServices({ xRentProvider: setup }, 'org')[0];
    assert.deepEqual(result.handlerConfig, config);
    assert.equal('baseURL' in result.handlerConfig, false);
    assert.throws(() => buildExternalServices({ xRentProvider: { ...setup, handlerConfig: undefined } }, 'org'), /provider handlerConfig/);
    assert.throws(() => buildExternalServices({ xClient: { ...enabled('xClient'), handler: 'vamoso' } }, 'org'), /incompatible handler/);
});

test('TTS requires explicit handler and confirmed backend defaults', () => {
    assert.throws(() => buildExternalServices({ xOrderTTS: enabled('xOrderTTS') }, 'org'), /explicit handler/);
    const setup = { ...enabled('xOrderTTS'), handler: 'xOrderStandard', serviceConfig: {} };
    assert.throws(() => buildExternalServices({ xOrderTTS: setup }, 'org'), /confirm/);
    assert.equal(buildExternalServices({ xOrderTTS: setup }, 'org', {
        getDefaults: () => ({ type: 'xOrderTTS', handler: 'xOrderStandard', serviceConfig: {}, handlerConfig: { baseURL: '' } }),
    })[0].type, 'xOrderTTS');
});

test('initialization fills missing config without overwriting existing configuration', () => {
    const branch = { BranchDetails: { General: { name: 'branch' }, xCatalog: { ...enabled('xCatalog'), supportOps: true } } };
    assert.equal(initializeBranchXServices(branch), branch);
    assert.equal(branch.BranchDetails.xCatalog.supportOps, true);
    assert.equal(branch.BranchDetails.xCatalog.supportPacks, false);
    assert.equal(branch.BranchDetails.General.name, 'branch');
});

test('creation validates the complete branch before writes and publishes sequentially', async () => {
    const calls = [];
    const writer = {
        create: (_ctx, payload) => { calls.push('create:' + payload.name); return Promise.resolve({ _id: payload.name }); },
        publishOnBranches: (_ctx, ids, branchIds) => { calls.push('publish:' + ids[0] + ':' + branchIds[0]); return Promise.resolve(); },
    };
    await assert.rejects(createExternalServices(writer, {}, { xClient: enabled('xClient'), xPriceInformation: enabled('xPriceInformation') }, 'org', 'branch'), /complete serviceConfig/);
    assert.deepEqual(calls, []);
    const created = await createExternalServices(writer, {}, { xClient: enabled('xClient'), xCatalog: enabled('xCatalog') }, 'org', 'branch');
    assert.deepEqual(calls, ['create:xClient', 'publish:xClient:branch', 'create:xCatalog', 'publish:xCatalog:branch']);
    assert.equal(created.length, 2);
});

test('publication failure stops subsequent creates', async () => {
    let creates = 0;
    await assert.rejects(createExternalServices({
        create: () => { creates++; return Promise.resolve({ _id: 'service' }); },
        publishOnBranches: () => Promise.reject(new Error('publish failed')),
    }, {}, { xClient: enabled('xClient'), xCatalog: enabled('xCatalog') }, 'org', 'branch'), /publish failed/);
    assert.equal(creates, 1);
});

test('schemas expose service fields and validate nested arrays with stable indexes', () => {
    const schemas = createXServiceSchemas();
    assert.equal(Object.keys(schemas).length, 11);
    assert.equal(schemas.xWheels.minHoursRequest.type, 'number');
    assert.equal(schemas.xAdditionalInfo.autoSelect.type, 'text');
    assert.deepEqual(validateXServiceSchema({ name: 'order', statusMapping: [
        { orderStatus: 'a', appointmentStatus: 'b' }, { orderStatus: 4, appointmentStatus: 'b' },
    ] }, schemas.xOrder), { statusMapping: [{}, { orderStatus: { type: 'error' } }] });
    assert.deepEqual(validateXServiceSchema({ name: 'wheels', minHoursRequest: 0, enabled: false }, schemas.xWheels), {});
    assert.deepEqual(validateXServiceSchema({ name: 'wheels', minHoursRequest: NaN }, schemas.xWheels), { minHoursRequest: { type: 'error' } });
});


test('branch creation inherits every organization service flag and retains factory configs', async () => {
    const { createBranch } = await import('../createBranch.ts');
    const organization = { OrganizationDetails: { General: { preferredLanguage: 'en' },
        OnlineComponents: { softAnalytics: true }, ExternalInterfaces: {
            xClient: true, xStorage: true, xAdditionalInfo: false, xRent: true,
        } } };
    const branch = createBranch(organization, () => ({ BranchDetails: { General: {},
        xWheels: { ...enabled('xWheels'), minHoursRequest: 48 } }, Settings: { Analytics: {} } }));
    assert.equal(branch.BranchDetails.xClient.enabled, true);
    assert.equal(branch.BranchDetails.xWheels.enabled, true);
    assert.equal(branch.BranchDetails.xAdditionalInfo.enabled, false);
    assert.equal(branch.BranchDetails.xRentProvider.enabled, true);
    assert.equal(branch.BranchDetails.xWheels.minHoursRequest, 48);
    assert.equal(branch.Settings.Analytics.analyticsDesire, 'true');
    assert.equal(branch.BranchDetails.General.preferredLanguage, 'en');
});

test('structured parser setter tracks nested config conflicts without mutating other branches', async () => {
    const { AutomaticSetupParser } = await import('../automaticSetupParser.simple.ts');
    const one = { BranchDetails: createXServiceDefaults(), Settings: {} };
    const two = { BranchDetails: createXServiceDefaults(), Settings: {} };
    const parser = new AutomaticSetupParser({ organizationSetup: {}, branchSetups: [one, two] });
    parser.setBranchXService(one, 'xOrder', { autoSyncOrder: true, statusMapping: [{ orderStatus: 'open', appointmentStatus: 'new' }] });
    parser.setBranchXService(one, 'xOrder', { autoSyncOrder: false, statusMapping: [{ orderStatus: 'closed', appointmentStatus: 'new' }] });
    assert.equal(one.BranchDetails.xOrder.autoSyncOrder, false);
    assert.equal(one.BranchDetails.xOrder.statusMapping[0].orderStatus, '');
    assert.deepEqual(parser.conflicts.branchSetups['0'].BranchDetails.xOrder.autoSyncOrder, [true, false]);
    assert.deepEqual(parser.conflicts.branchSetups['0'].BranchDetails.xOrder.statusMapping['0'].orderStatus, ['open', 'closed']);
    assert.deepEqual(two.BranchDetails.xOrder.statusMapping, []);
});
