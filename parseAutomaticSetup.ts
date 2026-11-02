import type {
  AutomaticSetupSessionData,
  BranchSetupType,
  OrganizationSetupType,
  SelectRow,
  TextRow,
  ToggleRow,
} from './AutomaticSetupSessionTypes'; // Adjust path; rename the supplied .js file to .ts.
import { RowTypeEnum } from './AutomaticSetupSessionTypes';
// npm install @fast-csv/parse puppeteer
import { parseString } from '@fast-csv/parse';
import type { Browser } from 'puppeteer';

// A draft is deliberately partial: the source files cannot satisfy the full session type.
type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[]
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type SetupDraft = Pick<DeepPartial<AutomaticSetupSessionData>, 'organizationSetup' | 'branchSetups'>;
type Row = Record<string, string>;
type HtmlFields = Record<string, unknown>;

const text = (value: unknown): TextRow | undefined =>
  typeof value === 'string' && value.trim() && value.trim() !== '[MASKED]'
    ? { type: RowTypeEnum.TEXT, value: value.trim() } : undefined;
const toggle = (value: unknown): ToggleRow | undefined =>
  typeof value === 'boolean' ? { type: RowTypeEnum.TOGGLE, value } : undefined;
const put = <T extends object, K extends keyof T>(object: T, key: K, value: T[K] | undefined): void => {
  if (value !== undefined) object[key] = value;
};

/** Parse the semicolon export, preserving string values such as "01". */
function parseCsv(input: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    let hasHeaders = false;
    const stream = parseString<Row, Row>(input.replace(/^\uFEFF/, ''), {
      headers: true,
      delimiter: ';',
      ignoreEmpty: true,
      strictColumnHandling: true,
    });
    stream.on('headers', (headers: string[]) => {
      hasHeaders = headers.includes('Interface');
      if (!hasHeaders) stream.destroy(new Error('Missing CSV Interface column'));
    });
    stream.on('data', (row: Row) => rows.push(row));
    stream.on('data-invalid', () => stream.destroy(new Error('Invalid CSV column count')));
    stream.on('error', reject);
    stream.on('end', () => hasHeaders ? resolve(rows) : reject(new Error('Missing CSV headers')));
  });
}

/** Preserve explicit answers from the original JSON before page scripts can rewrite it. */
function savedHtmlFields(html: string): HtmlFields {
  const match = html.match(/<script\b(?=[^>]*\bid=["']migration-customer-planning-data["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if (match?.[1]?.trim()) {
    try {
      const state: unknown = JSON.parse(match[1]);
      if (state && typeof state === 'object' && 'fields' in state &&
          state.fields && typeof state.fields === 'object' && !Array.isArray(state.fields)) {
        return state.fields as HtmlFields;
      }
    } catch {
      // Saved state is optional; rendered form values may still be available.
    }
  }
  return {};
}

/** Render the HTML in the caller's browser so its own initialization scripts can run. */
function parseHtmlFields(html: string, browser: Browser): Promise<HtmlFields> {
  const saved = savedHtmlFields(html);
  return browser.newPage().then(page => {
    return page.setContent(html, { waitUntil: 'load' }).then(() => page.evaluate(() => {
      const fields: Record<string, string | boolean> = {};
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input[id], textarea[id], select[id]'
      ).forEach(element => {
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          // A default unchecked box is not evidence of an explicit "No".
          if (element.checked) fields[element.id] = true;
        } else if (element.value.trim()) {
          fields[element.id] = element.value.trim();
        }
      });
      return fields;
    })).then(rendered => ({ ...saved, ...rendered })).finally(() => page.close());
  });
}

function unique(rows: Row[], label: string): Row | undefined {
  if (rows.length > 1) throw new Error(`Ambiguous ${label}: ${rows.length} rows`);
  return rows[0];
}
function option(rows: Row[], section: string, name: string, branchKey: string): string | undefined {
  const row = unique(rows.filter(r => r.Interface === section && r.cOptionID === name &&
    r.lBranchKey === branchKey), `${section}.${name} for branch ${branchKey}`);
  return text(row?.cValue)?.value;
}

export interface ParseOptions {
  browser: Browser;
  // Supply actual supported UI choices; otherwise preferredLanguage stays absent.
  languageOptions?: string[];
  // Only if the chosen organization/profile has been confirmed outside these files.
  confirmedBmwProfile?: boolean;
}

export function parseAutomaticSetup(csv: string, html: string, options: ParseOptions): Promise<SetupDraft> {
  return Promise.all([parseCsv(csv), parseHtmlFields(html, options.browser)]).then(([rows, fields]) => {
  const organizationSetup: DeepPartial<OrganizationSetupType> = { general: {}, onlineComponents: {} };
  const general = organizationSetup.general!;
  put(general, 'name', text(fields.organization_name));
  put(general, 'worldName', text(fields.world_name));
  if (options.confirmedBmwProfile === true) put(general, 'bmw', toggle(true));

  const online = organizationSetup.onlineComponents!;
  put(online, 'softDrop', toggle(fields.component_soft_drop));
  put(online, 'softCheckout', toggle(fields.component_soft_drop_checkout));
  put(online, 'softChat', toggle(fields.component_soft_chat));
  put(online, 'softConfirm', toggle(fields.component_soft_confirm));
  put(online, 'softAnalytics', toggle(fields.component_soft_analytics));

  const branchRows = rows.filter(r => r.Interface === 'Branches');
  // A single planning form does not identify multiple branches. Reject ambiguity.
  if (branchRows.length > 1) throw new Error('Multiple branches: select the target branch explicitly');
  const branch = branchRows[0];
  const branchSetups: DeepPartial<BranchSetupType>[] = [];
  if (branch) {
    const branchKey = branch.lBranchKey;
    const branchGeneral: DeepPartial<BranchSetupType['general']> = {};
    put(branchGeneral, 'name', text(branch.cName));
    put(branchGeneral, 'displayName', text(branch.cDisplayName));
    put(branchGeneral, 'firma', text(branch.cFirma));
    put(branchGeneral, 'zipCode', text(branch.cPLZ));
    put(branchGeneral, 'city', text(branch.cCity));
    put(branchGeneral, 'countryCode', text(branch.cCountryCode));
    put(branchGeneral, 'webAddress', text(branch.cWebAddress));
    put(branchGeneral, 'email', text(branch.cEmail));
    put(branchGeneral, 'phone', text(branch.cTel));
    put(branchGeneral, 'openingHours', text(branch.cOpeningHours));
    const language = text(branch.cPreferredLangID)?.value;
    if (language && options.languageOptions?.includes(language)) {
      const selected: SelectRow = { type: RowTypeEnum.SELECT, value: language, options: options.languageOptions };
      branchGeneral.preferredLanguage = selected;
    }
    // lTZKey=2 needs a verified lookup; cCounty=Bayern is a region, not a country.
    // unitsHout/unitName are not present in either input.

    const dealerInfo: DeepPartial<NonNullable<BranchSetupType['dealerInfo']>> = {};
    put(dealerInfo, 'dealerName', text(branch.cFirma));
    put(dealerInfo, 'dealerNumber', text(option(rows, 'DMS parameters', 'DistributionPartnerNumber', branchKey)
      ?? fields.dealer_number));
    put(dealerInfo, 'outlerNumber', text(option(rows, 'DMS parameters', 'OutletNumber', branchKey)
      ?? fields.business_location_number));
    put(dealerInfo, 'dms', text(fields.dms_name));
    put(dealerInfo, 'dmsCompanyNumber', text(option(rows, 'DMS parameters', 'Firm', branchKey)
      ?? fields.dms_company));
    put(dealerInfo, 'dmsBranchNumber', text(option(rows, 'DMS parameters', 'Branch', branchKey)
      ?? fields.dms_branch));
    put(dealerInfo, 'dmsIP', text(fields.dms_ip)); // Empty in this sample: stays absent.

    const externalServices: DeepPartial<BranchSetupType['externalServices']> = {};
    const wheelsRows = rows.filter(r => r.Interface === 'External wheels' && r.lBranchKey === branchKey);
    if (wheelsRows.length) {
      const wheels: DeepPartial<BranchSetupType['externalServices']['xWheels']> = {};
      put(wheels, 'name', text(option(rows, 'External wheels', 'Name', branchKey)));
      put(wheels, 'baseUrl', text(option(rows, 'External wheels', 'EndpointURL', branchKey)));
      put(wheels, 'dealerNumber', text(option(rows, 'External wheels', 'DealerNumber', branchKey)));
      put(wheels, 'queryPackageSize', text(option(rows, 'External wheels', 'QueryPackageSize', branchKey)));
      const active = option(rows, 'External wheels', 'Active', branchKey);
      if (active === '1' || active === '0') put(wheels, 'enabled', toggle(active === '1'));
      if (Object.keys(wheels).length) externalServices.xWheels = wheels;
    }
    const setup: DeepPartial<BranchSetupType> = { general: branchGeneral };
    if (Object.keys(dealerInfo).length) setup.dealerInfo = dealerInfo;
    if (Object.keys(externalServices).length) setup.externalServices = externalServices;
    branchSetups.push(setup);
  }
    return { organizationSetup, branchSetups };
  });
}
