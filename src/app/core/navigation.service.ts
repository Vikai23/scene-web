import { Injectable, signal } from '@angular/core';

import { ResourceKey } from './resources';

/** Botão oferecido quando um link leva a um 404 (ex.: artista sem perfil → "Criar o perfil"). */
export interface Offer {
  label: string;
  preset: Record<string, unknown>;
}

/**
 * Pedido para a próxima aba: abrir uma lista ou um item vindo de um link HATEOAS, ou começar um cadastro já
 * preenchido. A aba de origem guarda o pedido e navega; a aba de destino lê e executa ao abrir.
 */
export interface PendingAction {
  resource: ResourceKey;
  list?: { href: string; title: string };
  open?: { href: string; offer?: Offer };
  create?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly pending = signal<PendingAction | null>(null);

  request(action: PendingAction): void {
    this.pending.set(action);
  }

  take(resource: ResourceKey): PendingAction | null {
    const action = this.pending();
    if (!action || action.resource !== resource) return null;
    this.pending.set(null);
    return action;
  }
}
