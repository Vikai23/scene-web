import { Component, computed, inject } from '@angular/core';

import { Item } from '../../core/models';
import { metaOf } from '../../core/resources';
import { pathOf } from '../../core/traffic.service';
import { OutcomeBox } from '../../shared/outcome-box';
import { ResourceStore } from './resource-store';

/** Janela da lista: busca, filtro, sort, size, os itens e a paginação pelos links HATEOAS. */
@Component({
  selector: 'app-item-list',
  imports: [OutcomeBox],
  templateUrl: './item-list.html',
})
export class ItemList {
  protected readonly store = inject(ResourceStore);
  protected readonly config = this.store.config;
  protected readonly list = this.store.list;
  protected readonly sizes = [5, 10, 20, 50];

  protected readonly items = computed(() => this.list().result?.items ?? []);
  protected readonly links = computed(() => this.list().result?.links ?? {});
  protected readonly pageInfo = computed(() => {
    const page = this.list().result?.page;
    if (!page) return '';
    return `página ${page.number + 1} de ${Math.max(page.totalPages, 1)} (${page.totalElements} itens)`;
  });

  protected path(url: string): string {
    return pathOf(url);
  }

  protected meta(item: Item): string[] {
    return metaOf(this.config(), item);
  }

  protected open(item: Item): void {
    const self = item._links['self']?.href;
    if (!self) return;
    this.store.open(self);
    revealDetail();
  }

  protected create(): void {
    this.store.startCreate();
    revealDetail();
  }

  protected goTo(rel: 'first' | 'prev' | 'next' | 'last'): void {
    const href = this.links()[rel]?.href;
    if (href) this.store.goToPage(href);
  }

  protected setSearch(event: Event): void {
    this.store.search.set((event.target as HTMLInputElement).value);
  }

  protected setFilter(event: Event): void {
    this.store.filter.set((event.target as HTMLSelectElement).value);
    this.store.applyToolbar();
  }

  protected setSortField(event: Event): void {
    this.store.sortField.set((event.target as HTMLSelectElement).value);
    this.store.applyToolbar();
  }

  protected setSortDir(event: Event): void {
    this.store.sortDir.set((event.target as HTMLSelectElement).value === 'desc' ? 'desc' : 'asc');
    this.store.applyToolbar();
  }

  protected setSize(event: Event): void {
    this.store.size.set(Number((event.target as HTMLSelectElement).value));
    this.store.applyToolbar();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.store.applyToolbar();
  }
}

/** No celular a lista e os detalhes ficam um embaixo do outro: rola até os detalhes ao abrir um item. */
function revealDetail(): void {
  if (!window.matchMedia('(max-width: 880px)').matches) return;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  requestAnimationFrame(() => document.querySelector('.detail-window')?.scrollIntoView({ behavior, block: 'start' }));
}
