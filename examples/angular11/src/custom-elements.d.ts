import type { Range } from '../../../src/types';

declare global {
  interface HTMLElementTagNameMap {
    'interval-date-picker': HTMLElement & {
      mode: 'fixed' | 'relative';
      locale: string;
      weekStart: 'monday' | 'sunday';
      value: Range<string> | null;
      open: boolean;
    };
  }
}

export {};
