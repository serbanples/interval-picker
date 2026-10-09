export const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const month = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const same = (a: Date, b: Date) => day(a).getTime() === day(b).getTime();
export const weekStart = (d: Date) => add(day(d), -((d.getDay() + 6) % 7));
