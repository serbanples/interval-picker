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
