import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DateAdapter, Mode, Preset, Range } from './types.js';
import { isoAdapter } from './date-adapters.js';
import { day, month } from './date-utils.js';
import { presetRange, presets, labels } from './presets.js';
import { pickerStyles } from './picker-styles.js';
import './interval-calendar.js';

export type { DateAdapter, Mode, Preset, Range } from './types.js';
export { isoAdapter } from './date-adapters.js';

@customElement('interval-date-picker')
export class IntervalDatePicker extends LitElement {
  @property({ type: String }) mode: Mode = 'fixed';
  @property({ type: String }) locale = 'en';
  @property({ type: String, attribute: 'week-start' })
  weekStart: 'monday' | 'sunday' = 'monday';
  @property({ attribute: false }) adapter: DateAdapter<unknown> = isoAdapter;
  @property({ attribute: false }) value: Range<unknown> | null = null;
  @property({ type: String }) preset: Preset = 'thisWeek';
  @property({ type: Boolean }) open = true;

  @state() private visibleMonth = month(new Date(), 0);
  @state() private rightMonth = month(new Date(), 1);
  @state() private draft: Range<Date> | null = null;
  @state() private hoverDate: Date | null = null;
  @state() private selectingEnd = false;
  @state() private selectedPreset: Preset | null = null;

  static styles = pickerStyles;

  connectedCallback() {
    super.connectedCallback();
    this.syncDraft();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has('value') || changed.has('adapter')) this.syncDraft();
  }

  private syncDraft() {
    if (!this.value) {
      this.draft = null;
      this.selectingEnd = false;
      this.hoverDate = null;
      return;
    }
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

  private setMode(mode: Mode) {
    this.mode = mode;
    this.dispatchEvent(new CustomEvent('mode-change', {
      detail: { mode }, bubbles: true, composed: true,
    }));
  }

  private choosePreset(preset: Preset) {
    this.selectedPreset = preset;
    this.preset = preset;
    this.draft = presetRange(preset);
    this.selectingEnd = false;
    this.hoverDate = null;
    this.commit(preset);
  }

  private chooseDate(date: Date) {
    if (!this.selectingEnd) {
      this.draft = { from: date, to: date };
      this.selectingEnd = true;
    } else {
      this.draft = {
        from: this.draft!.from,
        to: date < this.draft!.from ? this.draft!.from : date,
      };
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
    this.dispatchEvent(new CustomEvent('range-change', {
      detail: { mode: this.mode, value, preset: preset ?? null },
      bubbles: true,
      composed: true,
    }));
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('picker-close', {
      bubbles: true, composed: true,
    }));
  }

  private renderCalendar(displayedMonth: Date, index: number) {
    return html`
      <interval-calendar
        .month=${displayedMonth}
        .locale=${this.locale}
        .weekStart=${this.weekStart}
        .range=${this.draft}
        .previewEnd=${this.hoverDate}
        .selectingEnd=${this.selectingEnd}
        @month-navigate=${(event: CustomEvent<{ direction: number }>) => {
          event.stopPropagation();
          this.navigate(index, event.detail.direction);
        }}
        @day-select=${(event: CustomEvent<{ date: Date }>) => {
          event.stopPropagation();
          this.chooseDate(event.detail.date);
        }}
        @day-hover=${(event: CustomEvent<{ date: Date }>) => {
          event.stopPropagation();
          if (this.selectingEnd) {
            this.hoverDate = this.draft && event.detail.date >= this.draft.from
              ? event.detail.date
              : null;
          }
        }}
      ></interval-calendar>
    `;
  }

  render() {
    if (!this.open) return nothing;
    const localizedLabels = labels[this.locale.split('-')[0]] ?? labels.en;
    const format = (date: Date) => new Intl.DateTimeFormat(this.locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date);

    return html`
      <div class="panel">
        <div class="top">
          <span>Choose view type:</span>
          <button
            class=${this.mode === 'relative' ? 'active' : ''}
            @click=${() => this.setMode('relative')}
          >${this.mode === 'relative' ? '✓ ' : ''}Relative</button>
          <button
            class=${this.mode === 'fixed' ? 'active' : ''}
            @click=${() => this.setMode('fixed')}
          >${this.mode === 'fixed' ? '✓ ' : ''}Fixed</button>
          <button class="x" aria-label="Close" @click=${this.close}>×</button>
        </div>

        ${this.mode === 'relative'
          ? html`
              <div class="presets">
                ${presets.map((row) => html`
                  <div class="preset-row">
                    ${row.map((preset) => html`
                      <button
                        class=${this.selectedPreset === preset ? 'selected' : ''}
                        @click=${() => this.choosePreset(preset)}
                      >${this.selectedPreset === preset ? '✓ ' : ''}${localizedLabels[preset]}</button>
                    `)}
                  </div>
                `)}
              </div>
            `
          : html`
              <div class="calendars" @mouseleave=${() => (this.hoverDate = null)}>
                ${this.renderCalendar(this.visibleMonth, 0)}
                ${this.renderCalendar(this.rightMonth, 1)}
              </div>
              ${this.draft
                ? html`<div class="summary">Interval: ${format(this.draft.from)} – ${format(this.draft.to)}</div>`
                : nothing}
            `}

        <div class="actions">
          <button @click=${this.close}>CLOSE</button>
          ${this.mode === 'fixed'
            ? html`<button class="save" ?disabled=${!this.draft || this.selectingEnd} @click=${() => this.commit()}>SAVE</button>`
            : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'interval-date-picker': IntervalDatePicker;
  }
}
