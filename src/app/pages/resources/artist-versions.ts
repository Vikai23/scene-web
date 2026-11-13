import { JsonPipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { forkJoin } from 'rxjs';

import { Item, Outcome, errorOutcome } from '../../core/models';
import { SceneApiService } from '../../core/scene-api.service';
import { OutcomeBox } from '../../shared/outcome-box';

interface VersionColumn {
  version: string;
  servedBy: string | null;
  body: Record<string, unknown>;
}

interface Comparison {
  columns: VersionColumn[];
  onlyV1: string[];
  onlyV2: string[];
}

/**
 * Artista: busca o mesmo artista nas duas versões da API (header X-API-Version 1 e 2) e mostra os dois JSON lado
 * a lado. Só GET /artists/{id} tem duas versões; nas outras rotas a resposta é igual.
 */
@Component({
  selector: 'app-artist-versions',
  imports: [OutcomeBox, JsonPipe],
  template: `
    <section class="block">
      <h3 class="block-title">Versões da resposta <code>X-API-Version</code></h3>
      <p class="hint">
        A rota <code>GET /artists/&#123;id&#125;</code> tem duas versões, e quem escolhe é o header X-API-Version. Aqui
        dá para ver as duas lado a lado.
      </p>
      <div class="button-row">
        <button type="button" class="small" [disabled]="loading()" (click)="compare()">
          {{ comparison() ? 'Buscar de novo' : 'Comparar v1 e v2' }}
        </button>
      </div>
      @if (error(); as failure) {
        <app-outcome [outcome]="failure" />
      }
      @if (comparison(); as result) {
        <p class="versions-diff">
          Só na v1: <code>{{ result.onlyV1.join(', ') || 'nada' }}</code>. Só na v2:
          <code>{{ result.onlyV2.join(', ') || 'nada' }}</code>. Os <code>_links</code> vêm nas duas.
        </p>
        <div class="versions-grid">
          @for (column of result.columns; track column.version) {
            <div class="version-column">
              <p class="chips"><span class="chip hot">X-API-Version: {{ column.servedBy ?? column.version }}</span></p>
              <pre class="json" tabindex="0">{{ column.body | json }}</pre>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class ArtistVersions {
  readonly artist = input.required<Item>();

  private readonly api = inject(SceneApiService);

  protected readonly comparison = signal<Comparison | null>(null);
  protected readonly error = signal<Outcome | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    // Outro artista aberto: a comparação anterior some
    effect(() => {
      this.artist();
      untracked(() => {
        this.comparison.set(null);
        this.error.set(null);
      });
    });
  }

  protected compare(): void {
    const href = this.artist()._links['self']?.href;
    if (!href) return;
    this.loading.set(true);
    this.error.set(null);
    forkJoin([this.api.getVersion(href, '1'), this.api.getVersion(href, '2')]).subscribe({
      next: ([v1, v2]) => {
        this.loading.set(false);
        const columns = [
          { version: '1', servedBy: v1.servedBy, body: withoutLinks(v1.item) },
          { version: '2', servedBy: v2.servedBy, body: withoutLinks(v2.item) },
        ];
        const keysV1 = Object.keys(columns[0].body);
        const keysV2 = Object.keys(columns[1].body);
        this.comparison.set({
          columns,
          onlyV1: keysV1.filter((key) => !keysV2.includes(key)),
          onlyV2: keysV2.filter((key) => !keysV1.includes(key)),
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(errorOutcome(error));
      },
    });
  }
}

function withoutLinks(item: Item): Record<string, unknown> {
  const { _links, ...body } = item;
  return body;
}
