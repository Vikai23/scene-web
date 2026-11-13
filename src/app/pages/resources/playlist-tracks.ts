import { Component, effect, inject, input, signal, untracked } from '@angular/core';

import { Item, Outcome, errorOutcome, savedOutcome } from '../../core/models';
import { SceneApiService, newIdempotencyKey } from '../../core/scene-api.service';
import { OutcomeBox } from '../../shared/outcome-box';
import { ResourceStore } from './resource-store';

/** Playlist: as faixas dela (GET), tirar uma faixa (DELETE) e colocar outra (POST com X-Idempotency-Key). */
@Component({
  selector: 'app-playlist-tracks',
  imports: [OutcomeBox],
  template: `
    <section class="block">
      <h3 class="block-title">Faixas da playlist <code>N:N</code></h3>
      <ul class="mini-list">
        @if (tracksError(); as error) {
          <li><app-outcome [outcome]="error" /></li>
        } @else if (tracks() === null) {
          <li>carregando as faixas...</li>
        } @else {
          @for (track of tracks(); track track.id) {
            <li>
              <span class="mini-title">
                {{ track['title'] }}
                <small>#{{ track.id }} / {{ track['artistName'] }} / {{ track['albumTitle'] }}</small>
              </span>
              <button type="button" class="quiet small" (click)="remove(track)">tirar (DELETE)</button>
            </li>
          } @empty {
            <li>Nenhuma faixa ainda. Busque uma abaixo e coloque.</li>
          }
        }
      </ul>

      <h3 class="block-title add-title">
        Colocar uma faixa <code>POST /playlists/{{ playlist().id }}/tracks/&#123;trackId&#125;</code>
      </h3>
      <form class="key-row" novalidate (submit)="search($event)">
        <input
          type="search"
          autocomplete="off"
          placeholder="título da faixa, ex.: heart"
          aria-label="Título da faixa"
          [value]="term()"
          (input)="setTerm($event)"
        />
        <button type="submit" class="small">Buscar</button>
      </form>
      <ul class="mini-list">
        @if (resultsError(); as error) {
          <li><app-outcome [outcome]="error" /></li>
        }
        @for (track of results() ?? []; track track.id) {
          <li>
            <span class="mini-title">
              {{ track['title'] }}
              <small>#{{ track.id }} / {{ track['artistName'] }}</small>
            </span>
            <button type="button" class="small" (click)="add(track)">colocar (POST)</button>
          </li>
        } @empty {
          @if (results() !== null) {
            <li>Nenhuma faixa com esse título.</li>
          }
        }
      </ul>
    </section>
  `,
})
export class PlaylistTracks {
  readonly playlist = input.required<Item>();

  private readonly api = inject(SceneApiService);
  private readonly store = inject(ResourceStore);

  protected readonly tracks = signal<Item[] | null>(null);
  protected readonly tracksError = signal<Outcome | null>(null);
  protected readonly term = signal('');
  protected readonly results = signal<Item[] | null>(null);
  protected readonly resultsError = signal<Outcome | null>(null);

  constructor() {
    // A cada nova versão da playlist (depois de colocar ou tirar uma faixa), busca as faixas de novo
    effect(() => {
      const playlist = this.playlist();
      untracked(() => this.load(playlist));
    });
  }

  protected setTerm(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  protected search(event: Event): void {
    event.preventDefault();
    const path = `/tracks/search?title=${encodeURIComponent(this.term().trim())}`;
    this.resultsError.set(null);
    this.api.page(path, 'tracks', { size: 8, sort: 'title,asc' }).subscribe({
      next: (result) => this.results.set(result.items),
      error: (error: unknown) => {
        this.results.set(null);
        this.resultsError.set(errorOutcome(error));
      },
    });
  }

  protected add(track: Item): void {
    this.api.addTrack(this.playlist().id, track.id, newIdempotencyKey()).subscribe({
      next: (saved) => {
        this.store.refresh(savedOutcome(saved, `A faixa "${track['title']}" entrou na playlist.`));
        this.store.reloadList();
      },
      error: (error: unknown) => this.store.notify(errorOutcome(error)),
    });
  }

  protected remove(track: Item): void {
    this.api.removeTrack(this.playlist().id, track.id).subscribe({
      next: (status) => {
        this.store.refresh({ status, note: `A faixa "${track['title']}" saiu da playlist (ela continua existindo).` });
        this.store.reloadList();
      },
      error: (error: unknown) => this.store.notify(errorOutcome(error)),
    });
  }

  private load(playlist: Item): void {
    const href = playlist._links['tracks']?.href;
    if (!href) return;
    this.tracks.set(null);
    this.tracksError.set(null);
    this.api.page(href, 'tracks', { size: 50, sort: 'id,asc' }).subscribe({
      next: (result) => this.tracks.set(result.items),
      error: (error: unknown) => this.tracksError.set(errorOutcome(error)),
    });
  }
}
