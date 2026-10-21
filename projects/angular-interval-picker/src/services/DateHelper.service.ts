import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DateHelperService {
  startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  sameDay(a: Date, b: Date): boolean {
    return this.startOfDay(a).getTime() === this.startOfDay(b).getTime();
  }

  getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
