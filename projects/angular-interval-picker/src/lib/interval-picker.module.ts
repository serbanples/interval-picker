import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { IntervalCalendarComponent } from './interval-calendar.component';
import { IntervalDatePickerComponent } from './interval-date-picker.component';

@NgModule({
  imports: [CommonModule],
  declarations: [IntervalCalendarComponent, IntervalDatePickerComponent],
  exports: [IntervalCalendarComponent, IntervalDatePickerComponent],
})
export class IntervalPickerModule {}
