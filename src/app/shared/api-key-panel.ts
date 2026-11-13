import { Component, inject, signal } from '@angular/core';

import { ApiKeyService } from '../core/api-key.service';
import { Outcome } from '../core/models';
import { OutcomeBox } from './outcome-box';

/**
 * Janela da chave de API: gera a chave (POST /api-keys), confere (GET /api-keys/me) e revoga (DELETE /api-keys/me).
 * Com uma chave ativa, cadastrar, editar e excluir passam; sem ela, a API devolve 401 Unauthorized.
 */
@Component({
  selector: 'app-api-key-panel',
  imports: [OutcomeBox],
  template: `
    <section class="window key-window" aria-labelledby="key-title">
      <p class="titlebar">api-key.exe</p>
      <div class="window-body key-body">
        <div class="key-about">
          <h2 class="block-title" id="key-title">Chave de API <code>X-API-Key</code></h2>
          <p class="hint">
            Consultar (GET) é aberto. Cadastrar, editar e excluir exigem uma chave no header X-API-Key: sem ela, a API
            responde 401 Unauthorized.
          </p>
        </div>

        <div class="key-state" aria-live="polite">
          @if (keys.key(); as key) {
            @let info = keys.info();
            <div class="key-row">
              <code class="key-value" [class.revoked]="!info?.active">{{ key }}</code>
              <button type="button" class="small quiet" (click)="copy(key)">{{ copied() ? 'Copiada' : 'Copiar' }}</button>
            </div>
            <p class="chips">
              <span class="chip" [class.ok]="info?.active" [class.bad]="!info?.active">
                {{ info?.active ? 'ativa' : 'revogada' }}
              </span>
              @if (info) {
                <span class="chip">owner: {{ info.owner }}</span>
              }
            </p>
            @if (info?.active) {
              <div class="button-row">
                <button type="button" class="small" [disabled]="busy()" (click)="check()">Conferir (GET)</button>
                <button type="button" class="small danger" [disabled]="busy()" (click)="revoke()">Revogar (DELETE)</button>
              </div>
            }
          }

          @if (!keys.info()?.active) {
            <form class="key-form" (submit)="$event.preventDefault(); generate(owner.value)">
              <label class="field">
                <span class="field-label">owner <code>nome de quem vai usar a chave</code></span>
                <input #owner type="text" name="owner" value="scene-web" autocomplete="off" />
              </label>
              <button type="submit" class="primary small" [disabled]="busy()">
                {{ keys.key() ? 'Gerar outra (POST)' : 'Gerar chave (POST)' }}
              </button>
            </form>
          }

          @if (outcome(); as result) {
            <app-outcome [outcome]="result" />
          }
        </div>
      </div>
    </section>
  `,
})
export class ApiKeyPanel {
  protected readonly keys = inject(ApiKeyService);

  protected readonly outcome = signal<Outcome | null>(null);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);

  protected generate(owner: string): void {
    this.busy.set(true);
    this.keys.generate(owner).subscribe((outcome) => this.done(outcome));
  }

  protected check(): void {
    this.busy.set(true);
    this.keys.check().subscribe((outcome) => this.done(outcome));
  }

  protected revoke(): void {
    this.busy.set(true);
    this.keys.revoke().subscribe((outcome) => this.done(outcome));
  }

  /** Copia a chave para colar no botão Authorize do Swagger ou no Postman. */
  protected async copy(key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(key);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false); // sem permissão de área de transferência: a chave continua visível para copiar à mão
    }
  }

  private done(outcome: Outcome): void {
    this.busy.set(false);
    this.copied.set(false);
    this.outcome.set(outcome);
  }
}
