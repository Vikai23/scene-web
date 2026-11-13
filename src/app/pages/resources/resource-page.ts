import { Component, OnInit, inject, input } from '@angular/core';

import { ResourceKey } from '../../core/resources';
import { ItemDetail } from './item-detail';
import { ItemList } from './item-list';
import { ResourceStore } from './resource-store';

/** Uma aba de recurso (artistas, perfis, álbuns, faixas ou playlists): a lista e os detalhes lado a lado. */
@Component({
  selector: 'app-resource-page',
  imports: [ItemList, ItemDetail],
  providers: [ResourceStore],
  host: { class: 'resource-page' },
  template: `
    <app-item-list />
    <app-item-detail />
  `,
})
export class ResourcePage implements OnInit {
  /** Vem do data da rota (app.routes.ts). */
  readonly resource = input.required<ResourceKey>();

  private readonly store = inject(ResourceStore);

  ngOnInit(): void {
    this.store.init(this.resource());
  }
}
