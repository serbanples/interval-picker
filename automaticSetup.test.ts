import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Browser } from 'puppeteer';
import {
  createEmptySetupData,
  mergeAutomaticSetup,
  processCsv,
  processHtml,
  processParsedCsv,
} from './parseAutomaticSetup';

test('empty CSV produces complete, independently allocated data at the requested branch', () => {
  const result = processParsedCsv([], { branchIndex: 2 });
  assert.equal(result.data.createdAt, '');
  assert.deepEqual(result.data.files, []);
  assert.equal(result.data.organizationSetup.general.description, '');
  assert.equal(result.data.organizationSetup.externalInterfaces.xOrder, false);
  assert.equal(result.data.branchSetups.length, 3);
  for (const branch of result.data.branchSetups) {
    assert.equal(branch.general.timezone, '');
    assert.equal(branch.dealerInfo.dms, '');
    assert.equal(branch.externalServices.xClient.global, false);
    assert.equal(branch.externalServices.xWheels.queryPackageSize, '');
    assert.equal(branch.externalServices.xOrder.autoChangeCustomer, false);
    assert.deepEqual(branch.settings, {});
  }
  assert.deepEqual(result.providedPaths, []);
  assert.deepEqual(result.conflicts, {});
  result.data.branchSetups[0].externalServices.xOrder.name = 'Changed';
  assert.equal(result.data.branchSetups[1].externalServices.xOrder.name, '');
  assert.equal(result.data.branchSetups[0].externalServices.xCatalog.name, '');
  assert.equal(createEmptySetupData().branchSetups[0].externalServices.xOrder.name, '');
});

test('CSV buffers return full data without treating missing fields as values', () => {
  return processCsv(Buffer.from('Interface;lBranchKey;cName\nBranches;1;Imported\n')).then(
    (result) => {
      const merged = mergeAutomaticSetup(
        { branchSetups: [{ general: { city: 'Existing city' } }] },
        result,
      );
      assert.equal(merged.data.branchSetups[0].general.name, 'Imported');
      assert.equal(merged.data.branchSetups[0].general.city, 'Existing city');
      assert.equal(merged.data.branchSetups[0].dealerInfo.dealerNumber, '');
      assert.deepEqual(merged.conflicts, {});
      assert.ok(
        result.providedPaths.some((path) => path.join('.') === 'branchSetups.0.general.name'),
      );
      assert.ok(
        !result.providedPaths.some((path) => path.join('.') === 'branchSetups.0.general.city'),
      );
    },
  );
});

test('HTML buffers return complete data; absent and explicitly false toggles merge differently', () => {
  let closed = false;
  const browser = {
    newPage: () =>
      Promise.resolve({
        setContent: (html: string) => {
          assert.equal(html, '<form></form>');
          return Promise.resolve();
        },
        evaluate: () =>
          Promise.resolve({ organization_name: 'HTML org', component_soft_chat: false }),
        close: () => {
          closed = true;
          return Promise.resolve();
        },
      }),
  } as unknown as Browser;
  return processHtml(Buffer.from('<form></form>'), { browser }).then((result) => {
    assert.equal(result.data.organizationSetup.general.name, 'HTML org');
    assert.equal(result.data.branchSetups[0].general.name, '');
    const merged = mergeAutomaticSetup(
      { organizationSetup: { onlineComponents: { softChat: true, softDrop: true } } },
      result,
    );
    assert.equal(merged.data.organizationSetup.onlineComponents.softChat, false);
    assert.equal(merged.data.organizationSetup.onlineComponents.softDrop, true);
    assert.deepEqual(merged.conflicts.organizationSetup?.onlineComponents?.softChat, [true, false]);
    assert.equal(merged.conflicts.organizationSetup?.onlineComponents?.softDrop, undefined);
    assert.equal(closed, true);
  });
});

test('existing explicit empty values conflict, while generated defaults do not', () => {
  const imported = processParsedCsv([{ Interface: 'Branches', lBranchKey: '1', cName: 'CSV' }]);
  const result = mergeAutomaticSetup({ branchSetups: [{ general: { name: '' } }] }, imported);
  assert.deepEqual(result.conflicts.branchSetups?.[0]?.general?.name, ['', 'CSV']);
  assert.equal(result.data.branchSetups[0].general.name, '');
  const noConflict = mergeAutomaticSetup(processParsedCsv([]), imported);
  assert.equal(noConflict.data.branchSetups[0].general.name, 'CSV');
  assert.deepEqual(noConflict.conflicts, {});
});

test('conflicts and presence survive JSON serialization and repeated merges', () => {
  const first = processParsedCsv([{ Interface: 'Branches', lBranchKey: '1', cName: 'CSV' }]);
  const second = mergeAutomaticSetup(
    {
      branchSetups: [{ general: { name: 'Existing' } }],
      organizationSetup: { settings: { count: 5 } },
    },
    first,
    { organizationSetup: { settings: { count: 8 } } },
  );
  assert.deepEqual(second.conflicts.branchSetups?.[0]?.general?.name, ['Existing', 'CSV']);
  assert.deepEqual(second.data.organizationSetup.settings, { count: 0 });
  assert.deepEqual(second.conflicts.organizationSetup?.settings, { count: [5, 8] });
  const roundTrip = JSON.parse(JSON.stringify(second));
  assert.deepEqual(mergeAutomaticSetup(roundTrip, first, processParsedCsv([])), second);
});

test('sparse branch slots and partial file metadata get complete defaults', () => {
  const result = mergeAutomaticSetup(
    { files: [{ name: 'input.csv' }] },
    processParsedCsv([], { branchIndex: 2 }),
  );
  assert.equal(result.data.branchSetups.length, 3);
  assert.equal(result.data.branchSetups[1].dealerInfo.dealerName, '');
  assert.deepEqual(result.data.files, [{ name: 'input.csv', url: '', fileHash: '', type: '' }]);
  assert.deepEqual(result.conflicts, {});
});

test('direct CSV assignments preserve mapping, duplicate conflicts and missing-value rules', () => {
  const result = processParsedCsv(
    [
      {
        Interface: 'Branches',
        lBranchKey: '1',
        cName: ' First ',
        cFirma: 'Dealer',
        cPLZ: '00123',
        cCity: '[MASKED]',
        cCountryCode: 'RO',
        cPreferredLangID: 'ro',
        lTZKey: 'EET',
      },
      { Interface: 'Branches', lBranchKey: '1', cName: 'Second', cTel: '  ' },
      {
        Interface: 'DMS parameters',
        lBranchKey: '1',
        cOptionID: 'DistributionPartnerNumber',
        cValue: '0001',
      },
      { Interface: 'DMS parameters', lBranchKey: '1', cOptionID: 'OutletNumber', cValue: '0002' },
      { Interface: 'DMS parameters', lBranchKey: '1', cOptionID: 'Firm', cValue: '0003' },
      { Interface: 'DMS parameters', lBranchKey: '1', cOptionID: 'Branch', cValue: '0004' },
      ...Object.entries({
        Name: 'Wheels',
        EndpointURL: 'https://example.test',
        DealerNumber: '0005',
        QueryPackageSize: '100',
        Active: '0',
      }).map(([cOptionID, cValue]) => ({
        Interface: 'External wheels',
        lBranchKey: '1',
        cFullServiceID: '4wheels_test',
        cOptionID,
        cValue,
      })),
    ],
    {
      confirmedBmwProfile: true,
      countryByCode: { RO: 'Romania' },
      timezoneByLegacyKey: { EET: 'Europe/Bucharest' },
      languageOptions: ['ro'],
    },
  );
  const branch = result.data.branchSetups[0];
  assert.equal(branch.general.name, '');
  assert.deepEqual(result.conflicts.branchSetups?.[0]?.general?.name, ['First', 'Second']);
  assert.equal(branch.general.zipCode, '00123');
  assert.equal(branch.general.country, 'Romania');
  assert.equal(branch.general.timezone, 'Europe/Bucharest');
  assert.equal(branch.general.preferredLanguage, 'ro');
  assert.equal(result.data.organizationSetup.general.bmw, true);
  assert.deepEqual(branch.dealerInfo, {
    dealerName: 'Dealer',
    dealerNumber: '0001',
    outlerNumber: '0002',
    dms: '',
    dmsCompanyNumber: '0003',
    dmsIP: '',
    dmsBranchNumber: '0004',
  });
  const service = branch.externalServices.xWheels;
  assert.equal(service.name, 'Wheels');
  assert.equal(service.baseUrl, 'https://example.test');
  assert.equal(service.dealerNumber, '0005');
  assert.equal(service.queryPackageSize, '100');
  assert.equal(service.handler, '4Wheels');
  assert.equal(service.enabled, false);
  assert.ok(
    result.providedPaths.some(
      (path) => path.join('.') === 'branchSetups.0.externalServices.xWheels.enabled',
    ),
  );
  assert.ok(
    !result.providedPaths.some((path) =>
      ['branchSetups.0.general.city', 'branchSetups.0.general.phone'].includes(path.join('.')),
    ),
  );
});
