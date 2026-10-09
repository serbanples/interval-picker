import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';

type PickerMode = 'fixed' | 'relative';
type WeekStart = 'monday' | 'sunday';
interface DateRange { from: string; to: string; }
interface RangeChangeDetail {
  mode: PickerMode;
  value: DateRange;
  preset: string | null;
}
interface PickerElement extends HTMLElement {
  mode: PickerMode;
  locale: string;
  weekStart: WeekStart;
  open: boolean;
  value: DateRange | null;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('picker', { static: true }) pickerRef!: ElementRef<PickerElement>;

  mode: PickerMode = 'fixed';
  locale = 'en';
  weekStart: WeekStart = 'monday';
  isOpen = true;
  selectedRange: DateRange | null = null;
  lastEvent = 'Select an interval to see the event output.';

  private onRangeChange = (event: Event): void => {
    const detail = (event as CustomEvent<RangeChangeDetail>).detail;
    this.selectedRange = detail.value;
    this.lastEvent = JSON.stringify({ type: 'range-change', detail }, null, 2);
  };

  private onModeChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ mode: PickerMode }>).detail;
    this.mode = detail.mode;
    this.lastEvent = JSON.stringify({ type: 'mode-change', detail }, null, 2);
  };

  private onPickerClose = (): void => {
    this.isOpen = false;
    this.lastEvent = 'picker-close';
  };

  ngAfterViewInit(): void {
    const picker = this.pickerRef.nativeElement;
    picker.addEventListener('range-change', this.onRangeChange);
    picker.addEventListener('mode-change', this.onModeChange);
    picker.addEventListener('picker-close', this.onPickerClose);
  }

  ngOnDestroy(): void {
    const picker = this.pickerRef.nativeElement;
    picker.removeEventListener('range-change', this.onRangeChange);
    picker.removeEventListener('mode-change', this.onModeChange);
    picker.removeEventListener('picker-close', this.onPickerClose);
  }

  setMode(value: PickerMode): void {
    this.mode = value;
    this.pickerRef.nativeElement.mode = value;
  }

  setLocale(value: string): void {
    this.locale = value;
    this.pickerRef.nativeElement.locale = value;
  }

  setWeekStart(value: WeekStart): void {
    this.weekStart = value;
    this.pickerRef.nativeElement.weekStart = value;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.pickerRef.nativeElement.open = this.isOpen;
  }

  reset(): void {
    this.selectedRange = null;
    this.pickerRef.nativeElement.value = null;
    this.lastEvent = 'Selection cleared.';
  }
}
