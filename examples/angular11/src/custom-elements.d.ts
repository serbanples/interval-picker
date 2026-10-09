declare global {
  interface HTMLElementTagNameMap {
    'interval-date-picker': HTMLElement & {
      mode: 'fixed' | 'relative';
      locale: string;
      weekStart: 'monday' | 'sunday';
      value: { from: string; to: string } | null;
      open: boolean;
    };
  }
}

export {};
