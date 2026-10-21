import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  addMonths, DateAdapter, DateRange, isoDateAdapter, PickerMode, Preset,
  PRESET_LABELS, PRESET_ROWS, presetRange, startOfDay, WeekStart,
} from './date-utils';

export interface RangeChange<T> {
  mode: PickerMode;
  value: DateRange<T>;
  preset: Preset | null;
}

@Component({
  selector: 'interval-date-picker',
  templateUrl: './interval-date-picker.component.html',
  styleUrls: ['./interval-date-picker.component.css'],
})
export class IntervalDatePickerComponent<T = string> implements OnChanges {
  @Input() mode: PickerMode = 'fixed';
  @Input() locale = 'en';
  @Input() weekStart: WeekStart = 'monday';
  @Input() adapter: DateAdapter<T> = isoDateAdapter as unknown as DateAdapter<T>;
  @Input() value: DateRange<T> | null = null;
  @Input() preset: Preset = 'thisWeek';
  @Input() open = true;

  @Output() rangeChange = new EventEmitter<RangeChange<T>>();
  @Output() modeChange = new EventEmitter<PickerMode>();
  @Output() pickerClose = new EventEmitter<void>();

  leftMonth = addMonths(new Date(), 0);
  rightMonth = addMonths(new Date(), 1);
  draft: DateRange<Date> | null = null;
  hoverDate: Date | null = null;
  selectingEnd = false;
  selectedPreset: Preset | null = null;
  readonly presetRows = PRESET_ROWS;

  get presetLabels(): { [key in Preset]: string } {
    return PRESET_LABELS[this.locale.split('-')[0]] || PRESET_LABELS.en;
  }

  get summary(): string {
    if (!this.draft) return '';
    const formatter = new Intl.DateTimeFormat(this.locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    return formatter.format(this.draft.from) + ' – ' + formatter.format(this.draft.to);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.value || changes.adapter) this.syncDraft();
  }

  private syncDraft(): void {
    if (!this.value) {
      this.draft = null;
      this.selectingEnd = false;
      this.hoverDate = null;
      return;
    }
    const from = startOfDay(this.adapter.parse(this.value.from));
    const to = startOfDay(this.adapter.parse(this.value.to));
    if (!isNaN(+from) && !isNaN(+to)) {
      this.draft = { from, to };
      this.selectingEnd = false;
      this.hoverDate = null;
      this.leftMonth = addMonths(from, 0);
      this.rightMonth = addMonths(from, 1);
    }
  }

  setMode(mode: PickerMode): void {
    this.mode = mode;
    this.modeChange.emit(mode);
  }

  choosePreset(preset: Preset): void {
    this.preset = preset;
    this.selectedPreset = preset;
    this.draft = presetRange(preset, this.weekStart);
    this.selectingEnd = false;
    this.hoverDate = null;
    this.save(preset);
  }

  chooseDate(date: Date): void {
    const normalized = startOfDay(date);
    if (!this.selectingEnd || !this.draft) {
      this.draft = { from: normalized, to: normalized };
      this.selectingEnd = true;
    } else {
      this.draft = {
        from: this.draft.from,
        to: normalized < this.draft.from ? this.draft.from : normalized,
      };
      this.selectingEnd = false;
    }
    this.hoverDate = null;
  }

  hover(date: Date): void {
    this.hoverDate = this.selectingEnd && this.draft && date >= this.draft.from
      ? startOfDay(date)
      : null;
  }

  clearHover(): void {
    this.hoverDate = null;
  }

  navigate(index: 0 | 1, direction: number): void {
    if (index === 0) {
      const next = addMonths(this.leftMonth, direction);
      this.leftMonth = next;
      if (next >= this.rightMonth) this.rightMonth = addMonths(next, 1);
    } else {
      const next = addMonths(this.rightMonth, direction);
      this.rightMonth = next;
      if (next <= this.leftMonth) this.leftMonth = addMonths(next, -1);
    }
  }

  navigateDirection(index: 0 | 1, direction: 'previous' | 'next'): void {
    this.navigate(index, direction === 'previous' ? -1 : 1);
  }

  selectMonth(index: 0 | 1, date: Date): void {
    const target = addMonths(date, 0);
    if (index === 0) {
      this.leftMonth = target;
      if (target >= this.rightMonth) this.rightMonth = addMonths(target, 1);
    } else {
      this.rightMonth = target;
      if (target <= this.leftMonth) this.leftMonth = addMonths(target, -1);
    }
  }

  save(preset: Preset | null = null): void {
    if (!this.draft || this.selectingEnd) return;
    const value = {
      from: this.adapter.serialize(this.draft.from),
      to: this.adapter.serialize(this.draft.to),
    };
    this.value = value;
    this.hoverDate = null;
    this.rangeChange.emit({ mode: this.mode, value, preset });
  }

  close(): void {
    this.open = false;
    this.pickerClose.emit();
  }
}
