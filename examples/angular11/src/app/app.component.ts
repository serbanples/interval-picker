import { Component } from '@angular/core';
import { DateRange, PickerMode, RangeChange, WeekStart } from '@serbanples/angular-interval-picker';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  mode: PickerMode = 'fixed';
  locale = 'en';
  weekStart: WeekStart = 'monday';
  isOpen = true;
  selectedRange: DateRange<string> | null = null;
  lastEvent = 'Select an interval to see the event output.';

  onRangeChange(event: RangeChange<string>): void {
    this.selectedRange = event.value;
    this.lastEvent = JSON.stringify({ type: 'range-change', detail: event }, null, 2);
  }

  onModeChange(mode: PickerMode): void {
    this.mode = mode;
    this.lastEvent = JSON.stringify({ type: 'mode-change', mode }, null, 2);
  }

  onClose(): void {
    this.isOpen = false;
    this.lastEvent = 'picker-close';
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  reset(): void {
    this.selectedRange = null;
    this.lastEvent = 'Selection cleared.';
  }
}
