import { Component, computed, input } from '@angular/core';

import { statusText } from '../core/http-status';
import { Outcome } from '../core/models';
import { pathOf } from '../core/traffic.service';

/** Caixa com a resposta da API: status com o nome em inglês, message, erros por campo e headers da Parte 2. */
@Component({
  selector: 'app-outcome',
  template: `
    @let result = outcome();
    <div class="outcome" [attr.data-kind]="kind()">
      <p class="outcome-status">{{ heading() }}</p>
      @if (result.message) {
        <p>{{ result.message }}</p>
      }
      @if (result.details?.length) {
        <ul class="details">
          @for (issue of result.details; track $index) {
            <li>{{ issue.field }}: {{ issue.message }}</li>
          }
        </ul>
      }
      @if (result.retryAfter) {
        <p><code>Retry-After: {{ result.retryAfter }}</code> (segundos até o próximo token)</p>
      }
      @if (result.note) {
        <p>{{ result.note }}</p>
      }
      @if (result.location) {
        <p><code>Location: {{ path(result.location) }}</code></p>
      }
      @if (result.replayed === 'true') {
        <p>
          <code>X-Idempotent-Replayed: true</code>
          A API reconheceu a key e devolveu a resposta original: nada novo foi criado (mesmo id).
        </p>
      } @else if (result.replayed === 'false') {
        <p><code>X-Idempotent-Replayed: false</code> Processado agora; a resposta ficou guardada com a key.</p>
      }
      <ng-content />
    </div>
  `,
})
export class OutcomeBox {
  readonly outcome = input.required<Outcome>();

  protected readonly kind = computed(() => {
    const result = this.outcome();
    if (result.failure === 'blocked') return 'blocked';
    return result.status >= 200 && result.status < 300 ? 'ok' : 'error';
  });

  protected readonly heading = computed(() => {
    const result = this.outcome();
    if (result.failure === 'blocked') return 'Bloqueado pelo navegador (CORS)';
    if (result.failure === 'offline') return 'Sem resposta: API fora do ar';
    return statusText(result.status);
  });

  protected path(url: string): string {
    return pathOf(url);
  }
}
