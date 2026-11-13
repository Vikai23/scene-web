import { JsonPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { Item } from '../../core/models';
import { ACTION_RELS, REL_TEXT } from '../../core/resources';
import { pathOf } from '../../core/traffic.service';
import { OutcomeBox } from '../../shared/outcome-box';
import { AddToPlaylist } from './add-to-playlist';
import { ArtistVersions } from './artist-versions';
import { ItemForm } from './item-form';
import { PlaylistTracks } from './playlist-tracks';
import { ResourceStore } from './resource-store';

interface LinkRow {
  rel: string;
  href: string;
  path: string;
  what: string;
}

/** Janela de detalhes: os campos do item, os links HATEOAS, as ações (PUT e DELETE) e o formulário. */
@Component({
  selector: 'app-item-detail',
  imports: [OutcomeBox, ItemForm, PlaylistTracks, AddToPlaylist, ArtistVersions, JsonPipe],
  templateUrl: './item-detail.html',
})
export class ItemDetail {
  protected readonly store = inject(ResourceStore);
  protected readonly config = this.store.config;

  protected readonly empty = computed(() => {
    const detail = this.store.detail();
    return detail.mode === 'empty' ? detail : null;
  });
  protected readonly loading = computed(() => this.store.detail().mode === 'loading');
  protected readonly view = computed(() => {
    const detail = this.store.detail();
    return detail.mode === 'view' ? detail : null;
  });
  protected readonly missing = computed(() => {
    const detail = this.store.detail();
    return detail.mode === 'missing' ? detail : null;
  });
  protected readonly form = computed(() => {
    const detail = this.store.detail();
    return detail.mode === 'form' ? detail : null;
  });

  protected readonly titlebar = computed(() => {
    const key = this.config().key;
    const view = this.view();
    const form = this.form();
    if (view) return `${key}/${view.item.id}.json`;
    if (form) return form.editing ? `${key}/${form.editing.id}/edit` : `${key}/new`;
    if (this.missing()) return 'erro.exe';
    return 'detalhes.exe';
  });

  /** id do item com a confirmação de exclusão aberta. */
  protected readonly confirming = signal<number | null>(null);

  protected title(item: Item): string {
    return this.config().title(item);
  }

  /** Os campos do JSON (menos _links), com objetos aninhados em notação de ponto. */
  protected props(item: Item): { name: string; value: unknown }[] {
    return flatten(item);
  }

  protected links(item: Item): LinkRow[] {
    const key = this.config().key;
    return Object.entries(item._links)
      .filter(([rel, link]) => !ACTION_RELS.has(rel) && link)
      .map(([rel, link]) => ({
        rel,
        href: link!.href,
        path: pathOf(link!.href),
        what: REL_TEXT[`${key}:${rel}`] ?? '',
      }));
  }

  protected path(url: string): string {
    return pathOf(url);
  }

  protected isNull(value: unknown): boolean {
    return value === null || value === undefined;
  }

  protected newAlbum(item: Item): void {
    this.store.goTo({ resource: 'albums', create: { artistId: item.id } });
  }

  protected newTrack(item: Item): void {
    this.store.goTo({ resource: 'tracks', create: { albumId: item.id } });
  }

  protected remove(item: Item): void {
    this.confirming.set(null);
    this.store.remove(item);
  }
}

function flatten(object: Record<string, unknown>, prefix = ''): { name: string; value: unknown }[] {
  const rows: { name: string; value: unknown }[] = [];
  for (const [key, value] of Object.entries(object)) {
    if (key === '_links') continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flatten(value as Record<string, unknown>, name));
    } else {
      rows.push({ name, value });
    }
  }
  return rows;
}
