import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export type Mode = 'relative' | 'fixed';
export type Preset =
  | 'yesterday'
  | 'today'
  | 'tomorrow'
  | 'lastWeek'
  | 'thisWeek'
  | 'nextWeek'
  | 'lastMonth'
  | 'thisMonth'
  | 'nextMonth'
  | 'lastYear'
  | 'thisYear'
  | 'nextYear';
export type Range<T> = { from: T; to: T };
export interface DateAdapter<T> {
  parse(value: T): Date;
  serialize(date: Date): T;
}
export const isoAdapter: DateAdapter<string> = {
  parse: (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  serialize: (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
};
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const month = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const same = (a: Date, b: Date) => day(a).getTime() === day(b).getTime();
const weekStart = (d: Date) => add(day(d), -((d.getDay() + 6) % 7));
function presetRange(p: Preset, now = new Date()): Range<Date> {
  const today = day(now);
  const week = weekStart(today);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisYear = new Date(today.getFullYear(), 0, 1);
  const ranges: Record<Preset, Range<Date>> = {
    yesterday: { from: add(today, -1), to: add(today, -1) },
    today: { from: today, to: today },
    tomorrow: { from: add(today, 1), to: add(today, 1) },
    lastWeek: { from: add(week, -7), to: add(week, -1) },
    thisWeek: { from: week, to: add(week, 6) },
    nextWeek: { from: add(week, 7), to: add(week, 13) },
    lastMonth: { from: month(thisMonth, -1), to: add(thisMonth, -1) },
    thisMonth: { from: thisMonth, to: add(month(thisMonth, 1), -1) },
    nextMonth: { from: month(thisMonth, 1), to: add(month(thisMonth, 2), -1) },
    lastYear: { from: new Date(today.getFullYear() - 1, 0, 1), to: add(thisYear, -1) },
    thisYear: { from: thisYear, to: new Date(today.getFullYear(), 11, 31) },
    nextYear: {
      from: new Date(today.getFullYear() + 1, 0, 1),
      to: new Date(today.getFullYear() + 1, 11, 31),
    },
  };
  return ranges[p];
}
const presets: Preset[][] = [
  ['yesterday', 'today', 'tomorrow'],
  ['lastWeek', 'thisWeek', 'nextWeek'],
  ['lastMonth', 'thisMonth', 'nextMonth'],
  ['lastYear', 'thisYear', 'nextYear'],
];
const labels: Record<string, Record<Preset, string>> = {
  en: {
    yesterday: 'Yesterday',
    today: 'Today',
    tomorrow: 'Tomorrow',
    lastWeek: 'Last week',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    lastMonth: 'Last month',
    thisMonth: 'This month',
    nextMonth: 'Next month',
    lastYear: 'Last year',
    thisYear: 'This year',
    nextYear: 'Next year',
  },
  de: {
    yesterday: 'Gestern',
    today: 'Heute',
    tomorrow: 'Morgen',
    lastWeek: 'Letzte Woche',
    thisWeek: 'Diese Woche',
    nextWeek: 'Nächste Woche',
    lastMonth: 'Letzter Monat',
    thisMonth: 'Dieser Monat',
    nextMonth: 'Nächster Monat',
    lastYear: 'Letztes Jahr',
    thisYear: 'Dieses Jahr',
    nextYear: 'Nächstes Jahr',
  },
};
@customElement('interval-date-picker')
export class IntervalDatePicker extends LitElement {
  @property({ type: String }) mode: Mode = 'fixed';
  @property({ type: String }) locale = 'en';
  @property({ type: String, attribute: 'week-start' }) weekStart: 'monday' | 'sunday' = 'monday';
  @property({ attribute: false }) adapter: DateAdapter<unknown> = isoAdapter;
  @property({ attribute: false }) value: Range<unknown> | null = null;
  @property({ type: String }) preset: Preset = 'thisWeek';
  @property({ type: Boolean }) open = true;
  @state() private visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  @state() private draft: Range<Date> | null = null;
  @state() private hoverDate: Date | null = null;
  @state() private selectingEnd = false;
  @state() private rightMonth = month(new Date(), 1);
  @state() private selectedPreset: Preset | null = null;
  static styles = css`
    :host {
      display: inline-block;
      font:
        13px Arial,
        sans-serif;
      color: #34435a;
      --picker-accent: #2678db;
      --picker-range: #e4efff;
    }
    * {
      box-sizing: border-box;
    }
    .panel {
      background: white;
      border: 1px solid #dce2eb;
      border-radius: 5px;
      box-shadow: 0 6px 24px #1a2b4020;
      min-width: 292px;
      max-width: 100%;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px 6px;
      white-space: nowrap;
    }
    .top span {
      margin-right: 3px;
    }
    .top button {
      border: 1px solid #d0d9e6;
      border-radius: 3px;
      padding: 5px 10px;
      background: white;
      color: #63758e;
      cursor: pointer;
    }
    .top button.active {
      border-color: #80aef1;
      color: #246bc4;
      background: #edf5ff;
    }
    .top .x {
      margin-left: auto;
      border: 0;
      font-size: 18px;
      padding: 0 3px;
    }
    .presets {
      padding: 8px 12px 14px;
      display: grid;
      gap: 12px;
    }
    .preset-row {
      display: flex;
      gap: 5px;
    }
    .preset-row button {
      border: 1px solid #bfcbd9;
      background: white;
      border-radius: 18px;
      padding: 5px 8px;
      color: #65778c;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .preset-row button.selected {
      border-color: #79a8eb;
      background: #e9f2ff;
      color: #2678db;
    }
    .calendars {
      display: flex;
      gap: 12px;
      padding: 6px 10px 10px;
    }
    .calendar {
      width: 252px;
      min-width: 0;
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 29px;
      color: #266cc0;
    }
    .nav strong {
      font-size: 12px;
      text-transform: uppercase;
    }
    .nav button {
      background: none;
      border: 0;
      color: #266cc0;
      cursor: pointer;
      font-size: 19px;
    }
    .days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      text-align: center;
    }
    .weekday {
      font-size: 10px;
      color: #8491a4;
      padding: 7px 0;
    }
    .date {
      border: 0;
      background: transparent;
      height: 30px;
      color: #40506b;
      cursor: pointer;
      font-size: 12px;
    }
    .date.in-range {
      background: var(--picker-range);
    }
    .date.preview {
      background: var(--picker-range);
    }
    .date.endpoint {
      border: 1px solid var(--picker-accent);
      border-radius: 50%;
      color: #166acb;
      background: #dceaff;
    }
    .date:hover {
      outline: 1px solid #8cb8ef;
      border-radius: 50%;
    }
    .summary {
      border-top: 1px solid #e6eaf0;
      padding: 9px 12px;
      color: #67788e;
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 9px;
      border-top: 1px solid #e6eaf0;
      padding: 10px 12px;
    }
    .actions button {
      border: 0;
      background: none;
      color: #3578c7;
      cursor: pointer;
      padding: 5px 8px;
    }
    .actions .save {
      background: #2678db;
      color: white;
      border-radius: 3px;
    }
    .actions .save:disabled {
      opacity: 0.45;
      cursor: default;
    }
    @media (max-width: 580px) {
      .calendars {
        flex-direction: column;
      }
      .calendar {
        width: 100%;
      }
      .panel {
        width: min(100%, 320px);
      }
    }
  `;
  connectedCallback() {
    super.connectedCallback();
    this.syncDraft();
  }
  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('value') || changed.has('adapter')) this.syncDraft();
  }
  private syncDraft() {
    if (this.value) {
      const from = day(this.adapter.parse(this.value.from));
      const to = day(this.adapter.parse(this.value.to));
      if (!isNaN(+from) && !isNaN(+to)) {
        this.draft = { from, to };
        this.selectingEnd = false;
        this.hoverDate = null;
        this.visibleMonth = month(from, 0);
        this.rightMonth = month(from, 1);
      }
    }
  }
  private setMode(mode: Mode) {
    this.mode = mode;
    this.dispatchEvent(
      new CustomEvent('mode-change', { detail: { mode }, bubbles: true, composed: true }),
    );
  }
  private choosePreset(p: Preset) {
    this.selectedPreset = p;
    this.preset = p;
    this.draft = presetRange(p);
    this.selectingEnd = false;
    this.hoverDate = null;
    this.commit(p);
  }
  private chooseDate(d: Date) {
    if (!this.selectingEnd) {
      this.draft = { from: d, to: d };
      this.selectingEnd = true;
    } else {
      this.draft = { from: this.draft!.from, to: d < this.draft!.from ? this.draft!.from : d };
      this.selectingEnd = false;
    }
    this.hoverDate = null;
  }
  private navigate(index: number, direction: number) {
    if (index === 0) {
      const next = month(this.visibleMonth, direction);
      this.visibleMonth = next;
      if (next >= this.rightMonth) this.rightMonth = month(next, 1);
    } else {
      const next = month(this.rightMonth, direction);
      this.rightMonth = next;
      if (next <= this.visibleMonth) this.visibleMonth = month(next, -1);
    }
  }
  private commit(preset?: Preset) {
    if (!this.draft) return;
    const value = {
      from: this.adapter.serialize(this.draft.from),
      to: this.adapter.serialize(this.draft.to),
    };
    this.value = value;
    this.selectingEnd = false;
    this.hoverDate = null;
    this.dispatchEvent(
      new CustomEvent('range-change', {
        detail: { mode: this.mode, value, preset: preset ?? null },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('picker-close', { bubbles: true, composed: true }));
  }
  private calendar(base: Date, index: number) {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const offset = (first.getDay() - (this.weekStart === 'monday' ? 1 : 0) + 7) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const weekdays = this.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    const fmt = new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric' });
    return html`<div class="calendar">
      <div class="nav">
        <button aria-label="Previous month" @click=${() => this.navigate(index, -1)}>‹</button
        ><strong>${fmt.format(first)}</strong
        ><button aria-label="Next month" @click=${() => this.navigate(index, 1)}>›</button>
      </div>
      <div class="days">
        ${weekdays.map((w) => html`<div class="weekday">${new Intl.DateTimeFormat(this.locale, { weekday: 'short' }).format(new Date(2026, 9, 4 + w))}</div>`)}${Array.from({ length: offset }, () => html`<span></span>`)}${Array.from(
          { length: count },
          (_, i) => {
            const d = new Date(first.getFullYear(), first.getMonth(), i + 1);
            const selected = this.draft && (same(d, this.draft.from) || same(d, this.draft.to));
            const previewEnd =
              this.selectingEnd && this.hoverDate && this.draft ? this.hoverDate : null;
            const previewFrom =
              previewEnd && this.draft && previewEnd >= this.draft.from ? this.draft.from : null;
            const previewTo = previewFrom ? previewEnd : null;
            const inRange =
              !this.selectingEnd && this.draft && d >= this.draft.from && d <= this.draft.to;
            const preview = previewFrom && previewTo && d >= previewFrom && d <= previewTo;
            return html`<button
              class="date ${inRange ? 'in-range' : ''} ${preview ? 'preview' : ''} ${selected ? 'endpoint' : ''}"
              aria-label=${d.toDateString()}
              aria-pressed=${!!selected}
              @mouseenter=${() => {
                if (this.selectingEnd)
                  this.hoverDate = this.draft && d >= this.draft.from ? d : null;
              }}
              @focus=${() => {
                if (this.selectingEnd)
                  this.hoverDate = this.draft && d >= this.draft.from ? d : null;
              }}
              @click=${() => this.chooseDate(d)}
            >
              ${i + 1}
            </button>`;
          },
        )}
      </div>
    </div>`;
  }
  render() {
    if (!this.open) return nothing;
    const l = labels[this.locale.split('-')[0]] ?? labels.en;
    const format = (d: Date) =>
      new Intl.DateTimeFormat(this.locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    return html`<div class="panel">
      <div class="top">
        <span>Choose view type:</span
        ><button
          class=${this.mode === 'relative' ? 'active' : ''}
          @click=${() => this.setMode('relative')}
        >
          ${this.mode === 'relative' ? '✓ ' : ''}Relative</button
        ><button
          class=${this.mode === 'fixed' ? 'active' : ''}
          @click=${() => this.setMode('fixed')}
        >
          ${this.mode === 'fixed' ? '✓ ' : ''}Fixed</button
        ><button class="x" aria-label="Close" @click=${this.close}>×</button>
      </div>
      ${
        this.mode === 'relative'
          ? html`<div class="presets">
              ${presets.map((row) => html`<div class="preset-row">${row.map((p) => html`<button class=${this.selectedPreset === p ? 'selected' : ''} @click=${() => this.choosePreset(p)}>${this.selectedPreset === p ? '✓ ' : ''}${l[p]}</button>`)}</div>`)}
            </div>`
          : html`<div class="calendars" @mouseleave=${() => (this.hoverDate = null)}>
                ${this.calendar(this.visibleMonth, 0)}${this.calendar(this.rightMonth, 1)}
              </div>
              ${this.draft ? html`<div class="summary">Interval: ${format(this.draft.from)} – ${format(this.draft.to)}</div>` : nothing}`
      }
      <div class="actions">
        <button @click=${this.close}>CLOSE</button
        >${this.mode === 'fixed' ? html`<button class="save" ?disabled=${!this.draft} @click=${() => this.commit()}>SAVE</button>` : nothing}
      </div>
    </div>`;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'interval-date-picker': IntervalDatePicker;
  }
}
