import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { UpdatePrompt } from './shell/update-prompt';

@Component({
  selector: 'sl-root',
  imports: [RouterOutlet, UpdatePrompt],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
