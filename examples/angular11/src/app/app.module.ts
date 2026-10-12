import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { IntervalPickerModule } from '@serbanples/angular-interval-picker';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, FormsModule, IntervalPickerModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
