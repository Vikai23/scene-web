import { HttpHeaders, HttpRequest } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

import { API_URL } from './api.config';
import { statusText } from './http-status';

export interface TrafficEntry {
  id: number;
  time: string;
  kind: 'ok' | 'error' | 'blocked';
  request: string;
  sent: string[];
  status: string;
  received: string[];
  message?: string;
}

/** Headers que aparecem no Tráfego: os que o front envia e os da Parte 2 que a API devolve. */
const SENT_HEADERS = ['X-Idempotency-Key', 'Content-Type', 'Accept', 'X-API-Version', 'X-Teste'];
const RECEIVED_HEADERS = ['Location', 'X-Idempotent-Replayed', 'X-RateLimit-Remaining', 'Retry-After'];
const MAX_ENTRIES = 150;

/** Registro de cada chamada desta página para a API, da mais recente para a mais antiga. */
@Injectable({ providedIn: 'root' })
export class TrafficService {
  readonly entries = signal<TrafficEntry[]>([]);
  private nextId = 1;

  logResponse(request: HttpRequest<unknown>, status: number, headers: HttpHeaders, message: string | null): void {
    const ok = status >= 200 && status < 300;
    this.add({
      kind: ok ? 'ok' : 'error',
      request: describe(request),
      sent: sentHeaders(request),
      status: statusText(status),
      received: RECEIVED_HEADERS.filter((name) => headers.has(name)).map((name) => `${name}: ${headers.get(name)}`),
      message: ok ? undefined : (message ?? undefined),
    });
  }

  logFailure(request: HttpRequest<unknown>, failure: 'blocked' | 'offline'): void {
    this.add({
      kind: failure === 'blocked' ? 'blocked' : 'error',
      request: describe(request),
      sent: sentHeaders(request),
      status: failure === 'blocked' ? 'bloqueado pelo navegador (CORS)' : 'sem resposta (API fora do ar)',
      received: [],
    });
  }

  logSummary(request: string, status: string, kind: TrafficEntry['kind']): void {
    this.add({ kind, request, sent: [], status, received: [] });
  }

  clear(): void {
    this.entries.set([]);
  }

  private add(entry: Omit<TrafficEntry, 'id' | 'time'>): void {
    const full: TrafficEntry = { ...entry, id: this.nextId++, time: new Date().toLocaleTimeString('pt-BR') };
    this.entries.update((list) => [full, ...list].slice(0, MAX_ENTRIES));
  }
}

function describe(request: HttpRequest<unknown>): string {
  return `${request.method} ${pathOf(request.urlWithParams)}`;
}

function sentHeaders(request: HttpRequest<unknown>): string[] {
  return SENT_HEADERS.filter((name) => request.headers.has(name)).map((name) => `${name}: ${request.headers.get(name)}`);
}

/** Caminho e query de uma URL da API, para mostrar na tela (ex.: /artists?page=0&size=10). */
export function pathOf(url: string): string {
  const relative = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
  try {
    return decodeURIComponent(relative || '/');
  } catch {
    return relative;
  }
}
