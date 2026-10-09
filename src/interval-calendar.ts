import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Range } from './types.js';
import { day, same } from './date-utils.js';

/**
 * Standalone, presentational month calendar.
 * Consumers own navigation and selection state.
 */
@customElement('interval-calendar')
export class IntervalCalendar extends LitElement {
  @property({ attribute: false }) month = new Date();
  @property({ type: String }) locale = 'en';
  @property({ type: String, attribute: 'week-start' })
  weekStart: 'monday' | 'sunday' = 'monday';
  @property({ attribute: false }) range: Range<Date> | null = null;
  @property({ attribute: false }) previewEnd: Date | null = null;
  @property({ type: Boolean }) selectingEnd = false;

  static styles = css`
    :host {
      display: block;
      width: 252px;
      min-width: 0;
      color: #40506b;
      font:
        13px Arial,
        sans-serif;
    }

    * {
      box-sizing: border-box;
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
    .date.in-range,
    .date.preview {
      background: var(--picker-range, #e4efff);
    }
    .date.endpoint {
      border: 1px solid var(--picker-accent, #2678db);
      border-radius: 50%;
      color: #166acb;
      background: #dceaff;
    }
    .date:hover {
      outline: 1px solid #8cb8ef;
      border-radius: 50%;
    }
    @media (max-width: 580px) {
      :host {
        width: 100%;
      }
    }
  `;

  private emit<T>(name: string, detail: T) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private renderDay(date: Date) {
    const selected = !!this.range && (same(date, this.range.from) || same(date, this.range.to));
    const inRange =
      !this.selectingEnd && !!this.range && date >= this.range.from && date <= this.range.to;
    const preview =
      this.selectingEnd &&
      !!this.range &&
      !!this.previewEnd &&
      this.previewEnd >= this.range.from &&
      date >= this.range.from &&
      date <= this.previewEnd;

    return html`
      <button
        class="date ${inRange ? 'in-range' : ''} ${preview ? 'preview' : ''} ${selected ? 'endpoint' : ''}"
        aria-label=${date.toDateString()}
        aria-pressed=${selected}
        @mouseenter=${() => this.emit('day-hover', { date })}
        @focus=${() => this.emit('day-hover', { date })}
        @click=${() => this.emit('day-select', { date })}
      >
        ${date.getDate()}
      </button>
    `;
  }

  render() {
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
    const offset = (first.getDay() - (this.weekStart === 'monday' ? 1 : 0) + 7) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const weekdays = this.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    const monthLabel = new Intl.DateTimeFormat(this.locale, {
      month: 'long',
      year: 'numeric',
    }).format(first);
    const weekdayFormatter = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });

    return html`
      <div class="nav">
        <button
          aria-label="Previous month"
          @click=${() => this.emit('month-navigate', { direction: -1 })}
        >
          ‹
        </button>
        <strong>${monthLabel}</strong>
        <button
          aria-label="Next month"
          @click=${() => this.emit('month-navigate', { direction: 1 })}
        >
          ›
        </button>
      </div>
      <div class="days">
        ${weekdays.map(
          (weekday) => html`
            <div class="weekday">${weekdayFormatter.format(new Date(2026, 9, 4 + weekday))}</div>
          `,
        )}
        ${Array.from({ length: offset }, () => html`<span></span>`)}
        ${Array.from({ length: count }, (_, index) =>
          this.renderDay(day(new Date(first.getFullYear(), first.getMonth(), index + 1))),
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'interval-calendar': IntervalCalendar;
  }
}
