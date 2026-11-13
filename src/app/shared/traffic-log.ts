import { Component, inject } from '@angular/core';

import { TrafficService } from '../core/traffic.service';

/** Janela "Tráfego": cada chamada desta página para a API, com os headers enviados e recebidos. */
@Component({
  selector: 'app-traffic-log',
  template: `
    <aside class="window log-window" aria-labelledby="log-title">
      <p class="titlebar">trafego.log</p>
      <div class="window-body log-body">
        <div class="log-head">
          <h2 id="log-title">Tráfego</h2>
          <button type="button" class="quiet" (click)="traffic.clear()">Limpar</button>
        </div>
        <p class="about">
          Cada chamada desta página para a API, da mais recente para a mais antiga. <code>&gt;</code> é o que a página
          enviou; <code>&lt;</code>, o que a API respondeu.
        </p>
        <ol class="log-list">
          @for (entry of traffic.entries(); track entry.id) {
            <li class="log-entry" [attr.data-kind]="entry.kind">
              <div class="log-time">{{ entry.time }}</div>
              <div class="log-request">{{ entry.request }}</div>
              @for (line of entry.sent; track $index) {
                <div class="log-header sent">{{ line }}</div>
              }
              <div class="log-status">{{ entry.status }}</div>
              @for (line of entry.received; track $index) {
                <div class="log-header">{{ line }}</div>
              }
              @if (entry.message) {
                <div class="log-message">{{ entry.message }}</div>
              }
            </li>
          } @empty {
            <li class="log-empty">Nenhuma chamada ainda.</li>
          }
        </ol>
      </div>
    </aside>
  `,
})
export class TrafficLog {
  protected readonly traffic = inject(TrafficService);
}
