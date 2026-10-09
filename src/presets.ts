import type { Preset, Range } from './types.js';
import { day, add, month, weekStart } from './date-utils.js';

export function presetRange(p: Preset, now = new Date()): Range<Date> {
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
export const presets: Preset[][] = [
  ['yesterday', 'today', 'tomorrow'],
  ['lastWeek', 'thisWeek', 'nextWeek'],
  ['lastMonth', 'thisMonth', 'nextMonth'],
  ['lastYear', 'thisYear', 'nextYear'],
];
export const labels: Record<string, Record<Preset, string>> = {
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
