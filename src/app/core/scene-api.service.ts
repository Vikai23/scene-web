import { HttpClient, HttpContext, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_URL, IDEMPOTENCY_HEADER, REPLAYED_HEADER } from './api.config';
import { HalPage, Item, PageResult, Saved } from './models';

/** Resposta crua de uma chamada da aba Status codes: status, headers e o corpo já convertido de JSON (quando é JSON). */
export interface RawResponse {
  status: number;
  headers: HttpHeaders;
  body: unknown;
}

export interface RawOptions {
  headers?: Record<string, string>;
  body?: unknown;
  context?: HttpContext;
}

/** Chave de idempotência nova: um UUID gerado aqui no navegador. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Todas as chamadas à Scene API passam por aqui. As rotas dos itens não são montadas à mão: o front usa os
 * links HATEOAS (_links) que a própria API devolve, e só as rotas de entrada (/artists, /albums...) ficam no código.
 */
@Injectable({ providedIn: 'root' })
export class SceneApiService {
  private readonly http = inject(HttpClient);

  /** Aceita uma rota (/artists) ou um link HATEOAS completo (http://localhost:8080/artists/1). */
  url(target: string): string {
    return /^https?:/.test(target) ? target : API_URL + target;
  }

  /** Listagem paginada. params substitui o que já vier na URL (page, size, sort...). */
  page(target: string, embeddedKey: string, params: Record<string, string | number> = {}): Observable<PageResult> {
    const url = new URL(this.url(target));
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    return this.http.get<HalPage>(url.toString()).pipe(
      map((body) => ({
        url: url.toString(),
        items: body._embedded?.[embeddedKey] ?? [],
        page: body.page ?? null,
        links: body._links ?? {},
      })),
    );
  }

  get(href: string): Observable<Item> {
    return this.http.get<Item>(this.url(href));
  }

  /** GET pedindo uma versão da API no header X-API-Version; servedBy é a versão que a API diz ter usado. */
  getVersion(href: string, version: string): Observable<{ item: Item; servedBy: string | null }> {
    return this.http
      .get<Item>(this.url(href), { headers: { 'X-API-Version': version }, observe: 'response' })
      .pipe(map((response) => ({ item: response.body as Item, servedBy: response.headers.get('X-API-Version') })));
  }

  /** POST com X-Idempotency-Key (quando key vem preenchida). */
  create(path: string, body: unknown, key: string | null): Observable<Saved> {
    const headers = key ? { [IDEMPOTENCY_HEADER]: key } : undefined;
    return this.http.post<Item>(this.url(path), body, { headers, observe: 'response' }).pipe(map(toSaved));
  }

  /** PUT no link update do item. */
  update(href: string, body: unknown): Observable<Saved> {
    return this.http.put<Item>(this.url(href), body, { observe: 'response' }).pipe(map(toSaved));
  }

  /** DELETE no link delete do item; devolve o status (204). */
  remove(href: string): Observable<number> {
    return this.http.delete(this.url(href), { observe: 'response' }).pipe(map((response) => response.status));
  }

  /** Coloca uma faixa na playlist (N:N). */
  addTrack(playlistId: number, trackId: number, key: string): Observable<Saved> {
    return this.http
      .post<Item>(this.url(`/playlists/${playlistId}/tracks/${trackId}`), null, {
        headers: { [IDEMPOTENCY_HEADER]: key },
        observe: 'response',
      })
      .pipe(map(toSaved));
  }

  /** Tira uma faixa da playlist; a faixa continua existindo. */
  removeTrack(playlistId: number, trackId: number): Observable<number> {
    return this.http
      .delete(this.url(`/playlists/${playlistId}/tracks/${trackId}`), { observe: 'response' })
      .pipe(map((response) => response.status));
  }

  /** Requisição livre, para a aba Status codes provocar cada erro do jeito que um cliente erraria. */
  raw(method: string, target: string, options: RawOptions = {}): Observable<RawResponse> {
    return this.http
      .request(method, this.url(target), {
        body: options.body ?? null,
        headers: options.headers,
        context: options.context,
        observe: 'response',
        responseType: 'text',
      })
      .pipe(map((response) => ({ status: response.status, headers: response.headers, body: parseJson(response.body) })));
  }
}

function toSaved(response: HttpResponse<Item>): Saved {
  return {
    item: response.body as Item,
    status: response.status,
    location: response.headers.get('Location'),
    replayed: response.headers.get(REPLAYED_HEADER),
  };
}

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
