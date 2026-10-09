import type { DateAdapter } from './types.js';

export const isoAdapter: DateAdapter<string> = {
  parse: (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  serialize: (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
};
