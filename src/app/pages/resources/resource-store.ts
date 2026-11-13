import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Item, Outcome, PageResult, Saved, errorOutcome, isApiError, savedOutcome } from '../../core/models';
import { NavigationService, Offer, PendingAction } from '../../core/navigation.service';
import { RELS, RESOURCES, ResourceKey } from '../../core/resources';
import { SceneApiService } from '../../core/scene-api.service';

/** De onde veio a lista aberta: a rota padrão, uma busca, um filtro ou um link HATEOAS de outro item. */
type ListKind = 'all' | 'search' | 'filter' | 'link';

export interface ListState {
  kind: ListKind;
  base: string;
  title: string;
  url: string;
  loading: boolean;
  result: PageResult | null;
  error: Outcome | null;
}

/** Dados para repetir um POST com a mesma X-Idempotency-Key. */
export interface Replay {
  path: string;
  body: unknown;
  key: string;
}

export type DetailState =
  | { mode: 'empty'; notice?: Outcome }
  | { mode: 'loading' }
  | { mode: 'view'; href: string; item: Item; notice?: Outcome; replay?: Replay }
  | { mode: 'missing'; href: string; outcome: Outcome; offer?: Offer }
  | { mode: 'form'; editing: Item | null; preset: Record<string, unknown> };

/**
 * Estado de uma aba (lista e detalhes) e as ações sobre ele. Cada aba tem a sua instância
 * (providers do componente da página).
 */
@Injectable()
export class ResourceStore {
  private readonly api = inject(SceneApiService);
  private readonly navigation = inject(NavigationService);
  private readonly router = inject(Router);

  readonly key = signal<ResourceKey>('artists');
  readonly config = computed(() => RESOURCES[this.key()]);

  // barra da lista
  readonly search = signal('');
  readonly filter = signal('');
  readonly sortField = signal('id');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly size = signal(10);

  readonly list = signal<ListState>({
    kind: 'all', base: '', title: '', url: '', loading: true, result: null, error: null,
  });
  readonly detail = signal<DetailState>({ mode: 'empty' });

  /** id do item aberto, para marcar na lista. */
  readonly openId = computed(() => {
    const detail = this.detail();
    return detail.mode === 'view' ? detail.item.id : null;
  });

  private listRequest = 0;
  private detailRequest = 0;

  /** Abre a aba: executa o pedido que veio de outra aba (um link) ou carrega a lista padrão. */
  init(key: ResourceKey): void {
    this.key.set(key);
    const pending = this.navigation.take(key);
    if (pending?.list) {
      this.loadList('link', pending.list.href, pending.list.title);
    } else {
      this.loadAll();
    }
    if (pending) this.runDetailAction(pending);
  }

  // ---------------------------------------------------------------------------------------------
  // Lista
  // ---------------------------------------------------------------------------------------------

  loadAll(): void {
    this.loadList('all', this.config().path, this.config().tab);
  }

  /** Carrega a primeira página com o size e o sort escolhidos na barra. */
  loadList(kind: ListKind, base: string, title: string): void {
    const url = new URL(this.api.url(base));
    url.searchParams.set('page', '0');
    url.searchParams.set('size', String(this.size()));
    url.searchParams.set('sort', `${this.sortField()},${this.sortDir()}`);
    this.fetchList(kind, base, title, url.toString());
  }

  /** Botões de página: seguem o link first, prev, next ou last da própria resposta (já com page, size e sort). */
  goToPage(href: string): void {
    const current = this.list();
    this.fetchList(current.kind, current.base, current.title, href);
  }

  /** Busca, filtro, sort e size da barra. Sem busca nem filtro, reaplica sort e size na lista aberta. */
  applyToolbar(): void {
    const config = this.config();
    const term = this.search().trim();
    const filter = this.filter();
    if (term) {
      this.loadList('search', `${config.search.path}?${config.search.param}=${encodeURIComponent(term)}`, `${config.tab}: "${term}"`);
    } else if (filter && config.filter) {
      this.loadList('filter', config.filter.path(filter), `${config.tab}: ${filter}`);
    } else if (this.list().kind === 'link') {
      this.loadList('link', this.list().base, this.list().title);
    } else {
      this.loadAll();
    }
  }

  resetToolbar(): void {
    this.search.set('');
    this.filter.set('');
    this.loadAll();
  }

  reloadList(): void {
    const current = this.list();
    this.loadList(current.kind, current.base, current.title);
  }

  private fetchList(kind: ListKind, base: string, title: string, url: string): void {
    const request = ++this.listRequest;
    this.list.set({ kind, base, title, url, loading: true, result: this.list().result, error: null });
    this.api.page(url, this.config().embedded).subscribe({
      next: (result) => {
        if (request === this.listRequest) this.list.set({ kind, base, title, url, loading: false, result, error: null });
      },
      error: (error: unknown) => {
        if (request === this.listRequest) {
          this.list.set({ kind, base, title, url, loading: false, result: null, error: errorOutcome(error) });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Detalhes
  // ---------------------------------------------------------------------------------------------

  open(href: string, offer?: Offer): void {
    const request = ++this.detailRequest;
    this.detail.set({ mode: 'loading' });
    this.api.get(href).subscribe({
      next: (item) => {
        if (request === this.detailRequest) this.detail.set({ mode: 'view', href, item });
      },
      error: (error: unknown) => {
        if (request !== this.detailRequest) return;
        const notFound = isApiError(error) && error.status === 404;
        this.detail.set({ mode: 'missing', href, outcome: errorOutcome(error), offer: notFound ? offer : undefined });
      },
    });
  }

  /** Busca de novo o item aberto, mostrando um aviso em cima (resultado da última ação). */
  refresh(notice?: Outcome, replay?: Replay): void {
    const current = this.detail();
    if (current.mode !== 'view') return;
    const request = ++this.detailRequest;
    this.api.get(current.href).subscribe({
      next: (item) => {
        if (request === this.detailRequest) this.detail.set({ mode: 'view', href: current.href, item, notice, replay });
      },
      error: (error: unknown) => {
        if (request === this.detailRequest) this.detail.set({ ...current, notice: errorOutcome(error) });
      },
    });
  }

  /** Mostra o resultado de uma ação em cima dos detalhes, sem buscar o item de novo. */
  notify(notice: Outcome): void {
    const current = this.detail();
    if (current.mode === 'view' || current.mode === 'empty') {
      this.detail.set({ ...current, notice });
    }
  }

  showEmpty(notice?: Outcome): void {
    this.detailRequest++;
    this.detail.set({ mode: 'empty', notice });
  }

  // ---------------------------------------------------------------------------------------------
  // Links HATEOAS
  // ---------------------------------------------------------------------------------------------

  /** Segue um link HATEOAS: se aponta para um item, abre o item; se aponta para uma lista, mostra a lista. */
  follow(from: Item, rel: string, href: string): void {
    const target = RELS[rel];
    if (!target) return;
    const fromTitle = this.config().title(from);
    const targetConfig = RESOURCES[target.resource];
    if (target.single) {
      // perfil que não existe (404): oferece cadastrar um para o artista
      const offer = rel === 'profile' ? { label: `+ Criar o perfil de ${fromTitle}`, preset: { artistId: from.id } } : undefined;
      this.goTo({ resource: target.resource, open: { href, offer } });
    } else if (rel === this.key()) {
      this.goTo({ resource: target.resource, list: { href: targetConfig.path, title: targetConfig.tab } });
    } else {
      this.goTo({ resource: target.resource, list: { href, title: `${targetConfig.tab} de ${fromTitle}` } });
    }
  }

  /** Executa a ação nesta aba ou guarda o pedido e troca de aba. */
  goTo(action: PendingAction): void {
    if (action.resource !== this.key()) {
      this.navigation.request(action);
      void this.router.navigate(['/', action.resource]);
      return;
    }
    if (action.list) {
      const all = action.list.href === this.config().path;
      this.loadList(all ? 'all' : 'link', action.list.href, action.list.title);
    }
    this.runDetailAction(action);
  }

  private runDetailAction(action: PendingAction): void {
    if (action.open) {
      this.open(action.open.href, action.open.offer);
    } else if (action.create) {
      this.startCreate(action.create);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Cadastro, edição e exclusão
  // ---------------------------------------------------------------------------------------------

  startCreate(preset: Record<string, unknown> = {}): void {
    this.detailRequest++;
    this.detail.set({ mode: 'form', editing: null, preset });
  }

  startEdit(item: Item): void {
    this.detailRequest++;
    this.detail.set({ mode: 'form', editing: item, preset: {} });
  }

  cancelForm(editing: Item | null): void {
    const self = editing?._links['self']?.href;
    if (self) {
      this.open(self);
    } else {
      this.showEmpty();
    }
  }

  /** Depois de um POST ou PUT que deu certo: mostra o item salvo com os headers da resposta. */
  saved(saved: Saved, editing: boolean, replay?: Replay): void {
    this.detailRequest++;
    const href = saved.item._links['self']?.href ?? '';
    const note = editing ? 'Dados substituídos com o PUT.' : undefined;
    this.detail.set({ mode: 'view', href, item: saved.item, notice: savedOutcome(saved, note), replay });
    this.reloadList();
  }

  /** Repete o mesmo POST com a mesma X-Idempotency-Key: a API devolve a resposta original e não cria nada. */
  replay(replay: Replay): void {
    this.api.create(replay.path, replay.body, replay.key).subscribe({
      next: (saved) => this.saved(saved, false, replay),
      error: (error: unknown) => this.notify(errorOutcome(error)),
    });
  }

  remove(item: Item): void {
    const config = this.config();
    const href = item._links['delete']?.href;
    if (!href) return;
    this.api.remove(href).subscribe({
      next: (status) => {
        const name = config.one.charAt(0).toUpperCase() + config.one.slice(1);
        this.showEmpty({ status, note: `${name} #${item.id} ${config.deleted}. ${config.cascade}` });
        this.reloadList();
      },
      error: (error: unknown) => this.notify(errorOutcome(error)),
    });
  }
}
