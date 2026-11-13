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

/** Uma linha da tabela "O que muda da v1 para a v2". */
interface ChangeRow {
  /** Caminho do campo na v1 (null quando o campo não existe na v1). */
  v1: string | null;
  /** Caminho do campo na v2 (null quando o campo não existe na v2). */
  v2: string | null;
  what: string;
  /** Objeto citado no fim da explicação, como em "Foi para dentro de origin". */
  object: string | null;
}

interface Comparison {
  columns: VersionColumn[];
  changes: ChangeRow[];
  /** Campos com o mesmo caminho nas duas versões. */
  same: string[];
}

/**
 * Artista: busca o mesmo artista nas duas versões da API (header X-API-Version 1 e 2), mostra numa tabela o que
 * muda de uma para a outra e, embaixo, os dois JSON lado a lado. Só GET /artists/{id} tem duas versões; nas outras
 * rotas a resposta é igual.
 */
@Component({
  selector: 'app-artist-versions',
  imports: [OutcomeBox, JsonPipe],
  template: `
    <section class="block">
      <h3 class="block-title">Versões da resposta <code>X-API-Version</code></h3>
      <p class="hint">
        A rota <code>GET /artists/&#123;id&#125;</code> tem duas versões, e o header <code>X-API-Version</code> escolhe
        qual delas responde. O botão busca este artista nas duas e mostra o que muda.
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
        <h4 class="versions-subtitle">O que muda da v1 para a v2</h4>
        @if (result.changes.length) {
          <table class="versions-table">
            <thead>
              <tr>
                <th scope="col">Na v1</th>
                <th scope="col">Na v2</th>
                <th scope="col">O que mudou</th>
              </tr>
            </thead>
            <tbody>
              @for (row of result.changes; track $index) {
                <tr>
                  <td data-label="Na v1">
                    @if (row.v1) {
                      <code>{{ row.v1 }}</code>
                    } @else {
                      <span class="absent">não existe</span>
                    }
                  </td>
                  <td data-label="Na v2">
                    @if (row.v2) {
                      <code>{{ row.v2 }}</code>
                    } @else {
                      <span class="absent">não existe</span>
                    }
                  </td>
                  <td data-label="O que mudou">
                    {{ row.what }}
                    @if (row.object) {
                      <code>{{ row.object }}</code>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="versions-same">As duas versões devolveram os mesmos campos.</p>
        }
        @if (result.same.length) {
          <p class="versions-same">
            Iguais nas duas:
            @for (field of result.same; track field; let index = $index) {
              <code>{{ field }}</code>{{ separator(index, result.same.length) }}
            }
          </p>
        }

        <h4 class="versions-subtitle">As duas respostas</h4>
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
        const { changes, same } = compareFields(columns[0].body, columns[1].body);
        if (v1.item._links && v2.item._links) same.push('_links');
        this.comparison.set({ columns, changes, same });
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(errorOutcome(error));
      },
    });
  }

  /** Separador da lista "Iguais nas duas": "id, name, genre e _links." */
  protected separator(index: number, total: number): string {
    if (index === total - 1) return '.';
    return index === total - 2 ? ' e ' : ', ';
  }
}

function withoutLinks(item: Item): Record<string, unknown> {
  const { _links, ...body } = item;
  return body;
}

/** Caminho de cada campo, com os objetos aninhados em notação de ponto (origin.country). */
function fieldPaths(body: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(body).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? fieldPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

function lastPart(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

function parentOf(path: string): string | null {
  return path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : null;
}

/**
 * Compara os campos das duas respostas. Um campo que some da v1 e aparece na v2 com o mesmo nome em outro
 * lugar (country → origin.country) conta como "mudou de lugar", e não como um campo removido mais um novo.
 */
function compareFields(v1: Record<string, unknown>, v2: Record<string, unknown>): { changes: ChangeRow[]; same: string[] } {
  const pathsV1 = fieldPaths(v1);
  const pathsV2 = fieldPaths(v2);
  const same = pathsV1.filter((path) => pathsV2.includes(path));
  const onlyV2 = pathsV2.filter((path) => !pathsV1.includes(path));
  const changes: ChangeRow[] = [];

  for (const path of pathsV1.filter((p) => !pathsV2.includes(p))) {
    const match = onlyV2.findIndex((other) => lastPart(other) === lastPart(path));
    if (match < 0) {
      changes.push({ v1: path, v2: null, what: 'Removido na v2', object: null });
      continue;
    }
    const target = onlyV2.splice(match, 1)[0];
    const into = parentOf(target);
    const outOf = parentOf(path);
    if (into && !outOf) {
      changes.push({ v1: path, v2: target, what: 'Foi para dentro de', object: into });
    } else if (outOf && !into) {
      changes.push({ v1: path, v2: target, what: 'Saiu de dentro de', object: outOf });
    } else {
      changes.push({ v1: path, v2: target, what: 'Mudou de lugar', object: null });
    }
  }
  for (const path of onlyV2) {
    changes.push({ v1: null, v2: path, what: 'Campo novo na v2', object: null });
  }
  return { changes, same };
}
