import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { IntervalCalendarComponent } from './interval-calendar.component';
import { IntervalDatePickerComponent } from './interval-date-picker.component';

@NgModule({
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule],
  declarations: [IntervalCalendarComponent, IntervalDatePickerComponent],
  exports: [IntervalCalendarComponent, IntervalDatePickerComponent],
})
export class IntervalPickerModule {}
