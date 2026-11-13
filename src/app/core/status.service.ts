import { HttpHeaders } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';

import { LIMIT_HEADER, REMAINING_HEADER, RESET_HEADER, RETRY_AFTER_HEADER } from './api.config';

/** Estado da ligação entre esta página e a API. */
export type Connection = 'checking' | 'allowed' | 'blocked' | 'offline';

/** Estado global mostrado no topo: a ligação (CORS) e o rate limit, lido dos headers de cada resposta. */
@Injectable({ providedIn: 'root' })
export class StatusService {
  readonly connection = signal<Connection>('checking');

  readonly limit = signal<number | null>(null);
  readonly remaining = signal<number | null>(null);
  readonly reset = signal<number | null>(null);

  /** Momento (em ms) em que o próximo token volta, depois de um 429. */
  readonly blockedUntil = signal<number | null>(null);

  readonly fill = computed(() => {
    const limit = this.limit();
    const remaining = this.remaining();
    return limit && remaining !== null ? Math.round((100 * remaining) / limit) : 0;
  });

  readRateLimit(headers: HttpHeaders): void {
    const limit = headers.get(LIMIT_HEADER);
    const remaining = headers.get(REMAINING_HEADER);
    const reset = headers.get(RESET_HEADER);
    const retryAfter = headers.get(RETRY_AFTER_HEADER);
    if (limit !== null) this.limit.set(Number(limit));
    if (remaining !== null) this.remaining.set(Number(remaining));
    if (reset !== null) this.reset.set(Number(reset));
    if (retryAfter !== null) {
      this.blockedUntil.set(Date.now() + Number(retryAfter) * 1000);
    } else if (remaining !== null) {
      this.blockedUntil.set(null);
    }
  }
}
