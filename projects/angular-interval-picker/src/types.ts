export interface DateRange { from: Date; to: Date; }
export type MonthNavigationDirection = 'previous' | 'next';
export interface CalendarDay {
  date: Date;
  day: number;
  selected: boolean;
  inRange: boolean;
  preview: boolean;
  selectedStart: boolean;
  selectedEnd: boolean;
  singleDaySelect: boolean;
  isToday: boolean;
}
