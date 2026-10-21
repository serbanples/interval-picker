export interface DateRange<T> { from: T; to: T; }
export interface DateAdapter<T> { parse(value: T): Date; serialize(date: Date): T; }
export type PickerMode = 'fixed' | 'relative';
export type WeekStart = 'monday' | 'sunday';
export type Preset = 'yesterday' | 'today' | 'tomorrow' | 'lastWeek' | 'thisWeek' | 'nextWeek' | 'lastMonth' | 'thisMonth' | 'nextMonth' | 'lastYear' | 'thisYear' | 'nextYear';

export const isoDateAdapter: DateAdapter<string> = {
  parse(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  },
  serialize(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  },
};
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const sameDay = (a: Date, b: Date) => +startOfDay(a) === +startOfDay(b);
export const firstWeekday = (d: Date, start: WeekStart) => addDays(startOfDay(d), -(start === 'monday' ? (d.getDay() + 6) % 7 : d.getDay()));
export const PRESET_ROWS: Preset[][] = [
  ['yesterday', 'today', 'tomorrow'],
  ['lastWeek', 'thisWeek', 'nextWeek'],
  ['lastMonth', 'thisMonth', 'nextMonth'],
  ['lastYear', 'thisYear', 'nextYear'],
];
export const PRESET_LABELS: { [locale: string]: { [key in Preset]: string } } = {
  en: { yesterday: 'Yesterday', today: 'Today', tomorrow: 'Tomorrow', lastWeek: 'Last week', thisWeek: 'This week', nextWeek: 'Next week', lastMonth: 'Last month', thisMonth: 'This month', nextMonth: 'Next month', lastYear: 'Last year', thisYear: 'This year', nextYear: 'Next year' },
  de: { yesterday: 'Gestern', today: 'Heute', tomorrow: 'Morgen', lastWeek: 'Letzte Woche', thisWeek: 'Diese Woche', nextWeek: 'Nächste Woche', lastMonth: 'Letzter Monat', thisMonth: 'Dieser Monat', nextMonth: 'Nächster Monat', lastYear: 'Letztes Jahr', thisYear: 'Dieses Jahr', nextYear: 'Nächstes Jahr' },
};
export function presetRange(preset: Preset, weekStart: WeekStart = 'monday', now = new Date()): DateRange<Date> {
  const today = startOfDay(now);
  const week = firstWeekday(today, weekStart);
  const month = addMonths(today, 0);
  const year = new Date(today.getFullYear(), 0, 1);
  const ranges: { [key in Preset]: DateRange<Date> } = {
    yesterday: { from: addDays(today, -1), to: addDays(today, -1) },
    today: { from: today, to: today },
    tomorrow: { from: addDays(today, 1), to: addDays(today, 1) },
    lastWeek: { from: addDays(week, -7), to: addDays(week, -1) },
    thisWeek: { from: week, to: addDays(week, 6) },
    nextWeek: { from: addDays(week, 7), to: addDays(week, 13) },
    lastMonth: { from: addMonths(month, -1), to: addDays(month, -1) },
    thisMonth: { from: month, to: addDays(addMonths(month, 1), -1) },
    nextMonth: { from: addMonths(month, 1), to: addDays(addMonths(month, 2), -1) },
    lastYear: { from: new Date(today.getFullYear() - 1, 0, 1), to: addDays(year, -1) },
    thisYear: { from: year, to: new Date(today.getFullYear(), 11, 31) },
    nextYear: { from: new Date(today.getFullYear() + 1, 0, 1), to: new Date(today.getFullYear() + 1, 11, 31) },
  };
  return ranges[preset];
}
