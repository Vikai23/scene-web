import { Component, OnInit, inject, input, signal } from '@angular/core';

import { Item, errorOutcome, savedOutcome } from '../../core/models';
import { SceneApiService, newIdempotencyKey } from '../../core/scene-api.service';
import { ResourceStore } from './resource-store';

/** Faixa: colocar numa playlist escolhida (POST /playlists/{id}/tracks/{trackId}). */
@Component({
  selector: 'app-add-to-playlist',
  template: `
    <section class="block">
      <h3 class="block-title">
        Colocar numa playlist <code>POST /playlists/&#123;id&#125;/tracks/{{ track().id }}</code>
      </h3>
      <div class="key-row">
        <select aria-label="Playlist" (change)="choose($event)">
          <option value="">{{ playlists() === null ? 'carregando playlists...' : '(escolha a playlist)' }}</option>
          @for (playlist of playlists() ?? []; track playlist.id) {
            <option [value]="playlist.id">{{ playlist['name'] }} (#{{ playlist.id }})</option>
          }
        </select>
        <button type="button" class="small" [disabled]="!chosen()" (click)="add()">colocar (POST)</button>
      </div>
    </section>
  `,
})
export class AddToPlaylist implements OnInit {
  readonly track = input.required<Item>();

  private readonly api = inject(SceneApiService);
  private readonly store = inject(ResourceStore);

  protected readonly playlists = signal<Item[] | null>(null);
  protected readonly chosen = signal('');

  ngOnInit(): void {
    this.api.page('/playlists', 'playlists', { size: 50, sort: 'name,asc' }).subscribe({
      next: (result) => this.playlists.set(result.items),
      error: () => this.playlists.set([]),
    });
  }

  protected choose(event: Event): void {
    this.chosen.set((event.target as HTMLSelectElement).value);
  }

  protected add(): void {
    const playlistId = Number(this.chosen());
    this.api.addTrack(playlistId, this.track().id, newIdempotencyKey()).subscribe({
      next: (saved) =>
        this.store.notify(
          savedOutcome(saved, `A faixa entrou na playlist #${playlistId}. Ela aparece no link playlists desta faixa.`),
        ),
      error: (error: unknown) => this.store.notify(errorOutcome(error)),
    });
  }
}
