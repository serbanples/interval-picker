import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DateRange, WeekStart, sameDay, startOfDay } from './date-utils';

export interface CalendarDay {
  date: Date;
  day: number;
  selected: boolean;
  inRange: boolean;
  preview: boolean;
}

@Component({
  selector: 'interval-calendar',
  templateUrl: './interval-calendar.component.html',
  styleUrls: ['./interval-calendar.component.css'],
})
export class IntervalCalendarComponent implements OnChanges {
  @Input() month = new Date();
  @Input() locale = 'en';
  @Input() weekStart: WeekStart = 'monday';
  @Input() range: DateRange<Date> | null = null;
  @Input() previewEnd: Date | null = null;
  @Input() selectingEnd = false;
  @Output() daySelect = new EventEmitter<Date>();
  @Output() dayHover = new EventEmitter<Date>();
  @Output() monthNavigate = new EventEmitter<number>();

  weekdays: string[] = [];
  cells: Array<CalendarDay | null> = [];
  monthLabel = '';

  ngOnChanges(_changes: SimpleChanges): void {
    this.rebuild();
  }

  private rebuild(): void {
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
    this.monthLabel = new Intl.DateTimeFormat(this.locale, { month: 'long', year: 'numeric' }).format(first);
    const indexes = this.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    const weekdayFormatter = new Intl.DateTimeFormat(this.locale, { weekday: 'short' });
    this.weekdays = indexes.map(index => weekdayFormatter.format(new Date(2026, 9, 4 + index)));
    const offset = (first.getDay() - (this.weekStart === 'monday' ? 1 : 0) + 7) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    this.cells = Array.from({ length: offset }, () => null);
    for (let i = 1; i <= count; i++) {
      const date = new Date(first.getFullYear(), first.getMonth(), i);
      const from = this.range && startOfDay(this.range.from);
      const to = this.range && startOfDay(this.range.to);
      const end = this.previewEnd && startOfDay(this.previewEnd);
      this.cells.push({
        date,
        day: i,
        selected: !!(from && to && (sameDay(date, from) || sameDay(date, to))),
        inRange: !!(!this.selectingEnd && from && to && date >= from && date <= to),
        preview: !!(this.selectingEnd && from && end && end >= from && date >= from && date <= end),
      });
    }
  }

  trackDay(index: number, cell: CalendarDay | null): number {
    return cell ? cell.day : -index - 1;
  }
}
