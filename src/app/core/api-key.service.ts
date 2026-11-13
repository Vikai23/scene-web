import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { API_KEY_HEADER, API_URL } from './api.config';
import { Outcome, errorOutcome } from './models';

/** Dados da chave que a API devolve. A chave completa só vem na resposta de POST /api-keys. */
export interface KeyInfo {
  owner: string;
  prefix: string;
  active: boolean;
  createdAt: string;
}

interface CreatedKey extends KeyInfo {
  key: string;
}

/**
 * Chave de API desta página. As rotas que alteram dados (POST, PUT e DELETE) exigem o header X-API-Key, e o
 * interceptor manda esta chave nelas. A chave completa fica só aqui, na memória da página (a API guarda apenas o
 * hash): recarregar a página pede uma chave nova.
 */
@Injectable({ providedIn: 'root' })
export class ApiKeyService {
  private readonly http = inject(HttpClient);

  readonly key = signal<string | null>(null);
  readonly info = signal<KeyInfo | null>(null);

  /** POST /api-keys: rota aberta, que devolve a chave completa uma única vez. */
  generate(owner: string): Observable<Outcome> {
    return this.http.post<CreatedKey>(`${API_URL}/api-keys`, { owner }, { observe: 'response' }).pipe(
      map((response) => {
        const created = response.body as CreatedKey;
        this.key.set(created.key);
        this.info.set(toInfo(created));
        return {
          status: response.status,
          location: response.headers.get('Location'),
          note: 'A chave completa só aparece nesta resposta: a API guarda apenas o hash dela.',
        };
      }),
      catchError((error: unknown) => of(errorOutcome(error))),
    );
  }

  /** GET /api-keys/me: os dados da chave enviada no header. */
  check(): Observable<Outcome> {
    return this.http.get<KeyInfo>(`${API_URL}/api-keys/me`, { headers: this.header(), observe: 'response' }).pipe(
      map((response) => {
        const info = toInfo(response.body as KeyInfo);
        this.info.set(info);
        return { status: response.status, note: `A chave ${info.prefix}… de ${info.owner} está ativa.` };
      }),
      catchError((error: unknown) => {
        const outcome = errorOutcome(error);
        if (outcome.status === 401) {
          // revogada, ou a API reiniciou e o banco em memória perdeu a chave: ela não abre mais nada
          this.info.update((info) => (info ? { ...info, active: false } : info));
        }
        return of(outcome);
      }),
    );
  }

  /** DELETE /api-keys/me: revoga a chave. Ela continua na página, para mostrar o 401 de chave revogada. */
  revoke(): Observable<Outcome> {
    return this.http.delete(`${API_URL}/api-keys/me`, { headers: this.header(), observe: 'response' }).pipe(
      map((response) => {
        this.info.update((info) => (info ? { ...info, active: false } : info));
        return { status: response.status, note: 'Chave revogada: a próxima escrita com ela volta 401 Unauthorized.' };
      }),
      catchError((error: unknown) => of(errorOutcome(error))),
    );
  }

  private header(): Record<string, string> {
    const key = this.key();
    return key ? { [API_KEY_HEADER]: key } : {};
  }
}

function toInfo(body: KeyInfo): KeyInfo {
  return { owner: body.owner, prefix: body.prefix, active: body.active, createdAt: body.createdAt };
}
