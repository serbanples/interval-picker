import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { CalendarDay, DateRange, MonthNavigationDirection } from '../../types';
import { DateHelperService } from '../../services/DateHelper.service';

type CalendarView = 'days' | 'months' | 'years';

@Component({
  selector: 'interval-calendar',
  templateUrl: './interval-calendar.component.html',
  styleUrls: ['./interval-calendar.component.scss'],
})
export class IntervalCalendarComponent implements OnChanges {
  @Input() month = new Date();
  @Input() range: DateRange | null = null;
  @Input() previewEnd: Date | null = null;
  @Input() selectingEnd = false;

  weekdays: string[] = [];
  weekNumbers: number[] = [];
  cells: Array<CalendarDay | null> = [];
  monthLabel = '';
  selectedStart = new BehaviorSubject<CalendarDay | null>(null);
  selectedStop = new BehaviorSubject<CalendarDay | null>(null);

  view: CalendarView = 'days';
  pickerYear = new Date().getFullYear();
  readonly months = Array.from({ length: 12 }, (_, index) => ({
    index,
    label: new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, index, 1)),
  }));
  readonly years = Array.from({ length: 72 }, (_, index) => 1986 + index);

  @Output() readonly monthNavigate = new EventEmitter<MonthNavigationDirection>();
  @Output() readonly monthSelect = new EventEmitter<Date>();
  @Output() readonly dayHover = new EventEmitter<Date>();
  @Output() readonly selectDate = new EventEmitter<Date>();

  constructor(
    private readonly dateHelper: DateHelperService,
    private readonly translateService: TranslateService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['month']) this.view = 'days';
    this.rebuild();
    const selected = this.cells.filter((cell): cell is CalendarDay => !!cell && cell.selected);
    this.selectedStart.next(selected.length ? { ...selected[0] } : null);
    this.selectedStop.next(selected.length ? { ...selected[selected.length - 1] } : null);
  }

  trackDay(index: number, cell: CalendarDay | null): number {
    return cell ? cell.day : -index - 1;
  }

  onPrevious(): void {
    if (this.view === 'days') this.monthNavigate.emit('previous');
    else this.pickerYear--;
  }

  onNext(): void {
    if (this.view === 'days') this.monthNavigate.emit('next');
    else this.pickerYear++;
  }

  toggleView(): void {
    if (this.view === 'days') {
      this.pickerYear = this.month.getFullYear();
      this.view = 'months';
    } else if (this.view === 'months') {
      this.view = 'years';
    } else {
      this.view = 'days';
    }
  }

  onMonthSelect(monthIndex: number): void {
    this.view = 'days';
    this.monthSelect.emit(new Date(this.pickerYear, monthIndex, 1));
  }

  isShownMonth(monthIndex: number): boolean {
    return monthIndex === this.month.getMonth() && this.pickerYear === this.month.getFullYear();
  }

  onYearSelect(year: number): void {
    this.pickerYear = year;
    this.view = 'months';
  }

  isShownYear(year: number): boolean {
    return year === this.month.getFullYear();
  }

  onDayMouseEnter(calendarDay: CalendarDay): void {
    this.dayHover.emit(calendarDay.date);
  }

  onDayClick(calendarDay: CalendarDay): void {
    this.selectDate.emit(calendarDay.date);
  }

  private rebuild(): void {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    const first = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
    this.monthLabel = this.translateService.instant('field.month.' + months[first.getMonth()]);

    const indexes = [1, 2, 3, 4, 5, 6, 0];
    const weekdayFormatter = new Intl.DateTimeFormat('en', { weekday: 'long' });
    this.weekdays = indexes.map((index) =>
      weekdayFormatter.format(new Date(2026, 9, 4 + index)).toLowerCase());

    const offset = (first.getDay() - 1 + 7) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const rows = Math.ceil((offset + count) / 7);
    this.weekNumbers = Array.from({ length: rows }, (_, row) => {
      const middle = new Date(first.getFullYear(), first.getMonth(), 1 - offset + row * 7 + 3);
      return this.dateHelper.getISOWeek(middle);
    });

    this.cells = Array.from({ length: offset }, () => null);
    for (let i = 1; i <= count; i++) {
      const date = new Date(first.getFullYear(), first.getMonth(), i);
      const from = this.range && this.dateHelper.startOfDay(this.range.from);
      const to = this.range && this.dateHelper.startOfDay(this.range.to);
      const end = this.previewEnd && this.dateHelper.startOfDay(this.previewEnd);
      const selected = !!(from && to &&
        (this.dateHelper.sameDay(date, from) || this.dateHelper.sameDay(date, to)));
      this.cells.push({
        date,
        day: i,
        selected,
        inRange: !!(!this.selectingEnd && from && to && date >= from && date <= to),
        preview: !!(this.selectingEnd && from && end && end >= from && date >= from && date <= end),
        selectedStart: !!(selected && from && this.dateHelper.sameDay(date, from) &&
          (this.selectingEnd || !this.dateHelper.sameDay(from, to!))),
        selectedEnd: !!((selected && from && to && !this.dateHelper.sameDay(date, from) &&
          this.dateHelper.sameDay(date, to)) ||
          (end && this.selectingEnd && this.dateHelper.sameDay(date, end))),
        singleDaySelect: !!(selected && from && to && this.dateHelper.sameDay(from, to) &&
          !this.selectingEnd),
        isToday: this.dateHelper.sameDay(date, new Date()),
      });
    }
  }
}
