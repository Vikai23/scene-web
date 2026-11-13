import { HttpContext } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';

import { KEEP_CONNECTION, NO_API_KEY, QUIET } from '../../core/api.interceptor';
import { API_KEY_HEADER } from '../../core/api.config';
import { STATUS_NAMES, statusText } from '../../core/http-status';
import { Item, Outcome, errorOutcome, isApiError } from '../../core/models';
import { RawOptions, SceneApiService, newIdempotencyKey } from '../../core/scene-api.service';
import { TrafficService } from '../../core/traffic.service';
import { OutcomeBox } from '../../shared/outcome-box';

/** Um caso: o status esperado, o que a página manda e como provoca o erro. */
interface StatusCase {
  code: number;
  title: string;
  request: string;
  /** Só nos casos de CORS: o que a API não libera (a requisição nem chega a ter status). */
  blocked?: string;
  run: () => Promise<Outcome>;
}

interface CaseResult {
  outcome: Outcome;
  hit: boolean;
}

/** Opções de uma requisição dos cards: as do SceneApiService e "noKey", para o card de 401 sem chave. */
interface CaseOptions extends RawOptions {
  noKey?: boolean;
}

const BURST_SIZE = 120;

/** Métodos que exigem a chave de API (o card de cada um usa a chave própria desta aba). */
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/** Chave que ninguém gerou: a API responde 401 com a mensagem de chave inválida. */
const UNKNOWN_KEY = 'scn_chave-que-nao-existe';

/** Status codes: cada card provoca de propósito um status de erro da API, do jeito que um cliente erraria. */
@Component({
  selector: 'app-status-codes',
  imports: [OutcomeBox],
  templateUrl: './status-codes.html',
})
export class StatusCodes {
  private readonly api = inject(SceneApiService);
  private readonly traffic = inject(TrafficService);

  protected readonly results = signal<Record<number, CaseResult | undefined>>({});
  protected readonly running = signal<number | null>(null);

  /** Chave de API desta aba, gerada na primeira escrita: os casos de 400, 409, 415 e 422 precisam passar do 401. */
  private labKey: string | null = null;

  protected readonly cases: StatusCase[] = [
    {
      code: 400, title: 'Versão da API que não existe', request: 'GET /artists/1\nX-API-Version: 9',
      run: () => this.call('GET', '/artists/1', { headers: { 'X-API-Version': '9' } }),
    },
    {
      code: 400, title: 'Campo com tipo errado no JSON',
      request: 'POST /artists\n{"name": "Banda Lab", "genre": "ROCK", "formedYear": "2004"}',
      run: () => this.call('POST', '/artists', {
        body: '{"name": "Banda Lab", "genre": "ROCK", "formedYear": "2004"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    },
    {
      code: 400, title: 'Dados inválidos (Bean Validation)', request: 'POST /artists\n{"name": "A"}',
      run: () => this.call('POST', '/artists', { body: { name: 'A' } }),
    },
    {
      code: 400, title: 'Busca sem o texto', request: 'GET /artists/search?name=',
      run: () => this.call('GET', '/artists/search?name='),
    },
    {
      code: 400, title: 'sort por campo que não existe', request: 'GET /artists?sort=senha,asc',
      run: () => this.call('GET', '/artists?sort=senha,asc'),
    },
    {
      code: 400, title: 'X-Idempotency-Key fora do formato', request: 'POST /playlists\nX-Idempotency-Key: chave com espaco!',
      run: () => this.call('POST', '/playlists', {
        body: { name: 'Playlist Lab', visibility: 'PUBLIC' },
        headers: { 'X-Idempotency-Key': 'chave com espaco!' },
      }),
    },
    {
      code: 401, title: 'Escrita sem chave de API', request: 'POST /artists\n(sem o header X-API-Key)',
      run: () => this.call('POST', '/artists', {
        body: { name: 'Banda Lab', genre: 'ROCK' },
        context: new HttpContext().set(NO_API_KEY, true),
        noKey: true,
      }),
    },
    {
      code: 401, title: 'Chave de API que não existe', request: `POST /artists\nX-API-Key: ${UNKNOWN_KEY}`,
      run: () => this.call('POST', '/artists', {
        body: { name: 'Banda Lab', genre: 'ROCK' },
        headers: { [API_KEY_HEADER]: UNKNOWN_KEY },
      }),
    },
    {
      code: 401, title: 'Chave de API revogada',
      request: 'POST /api-keys (gera uma chave)\nDELETE /api-keys/me (revoga)\nPOST /artists com a chave revogada',
      run: () => this.revokedKey(),
    },
    {
      code: 403, title: 'CORS: header não liberado', request: 'GET /artists\nX-Teste: 1\n(antes, o navegador faz o preflight OPTIONS)',
      blocked: 'o header X-Teste',
      run: () => this.call('GET', '/artists?page=0&size=1', {
        headers: { 'X-Teste': '1' },
        context: new HttpContext().set(KEEP_CONNECTION, true),
      }),
    },
    {
      code: 403, title: 'CORS: método não liberado', request: 'PATCH /artists/1\n(o preflight pede o método PATCH)',
      blocked: 'o método PATCH',
      run: () => this.call('PATCH', '/artists/1', {
        body: {},
        context: new HttpContext().set(KEEP_CONNECTION, true),
      }),
    },
    {
      code: 404, title: 'Recurso que não existe', request: 'GET /artists/999999',
      run: () => this.call('GET', '/artists/999999'),
    },
    {
      code: 404, title: 'Rota que não existe', request: 'GET /rota-inexistente',
      run: () => this.call('GET', '/rota-inexistente'),
    },
    {
      code: 405, title: 'Método que a rota não aceita', request: 'PUT /artists\n(sem o id: essa rota só aceita GET e POST)',
      run: () => this.call('PUT', '/artists', { body: { name: 'Banda Lab', genre: 'ROCK' } }),
    },
    {
      code: 406, title: 'Accept que não é JSON', request: 'GET /artists/1\nAccept: application/xml',
      run: () => this.call('GET', '/artists/1', { headers: { Accept: 'application/xml' } }),
    },
    {
      code: 409, title: 'Nome repetido', request: 'POST /artists duas vezes com o mesmo nome\n(o primeiro é apagado no fim)',
      run: () => this.conflict(),
    },
    {
      code: 415, title: 'Corpo que não é JSON', request: 'POST /artists\nContent-Type: text/plain',
      run: () => this.call('POST', '/artists', { body: 'name=Banda Lab', headers: { 'Content-Type': 'text/plain' } }),
    },
    {
      code: 422, title: 'Mesma key, corpo diferente',
      request: 'POST /playlists, key K, nome A\nPOST /playlists, key K, nome B\n(a playlist A é apagada no fim)',
      run: () => this.reusedKey(),
    },
    {
      code: 429, title: 'Rate limit estourado', request: `${BURST_SIZE} x GET /artists de uma vez\n(token bucket com 30 tokens)`,
      run: () => this.burst(),
    },
  ];

  protected name(code: number): string {
    return STATUS_NAMES[code] ?? '';
  }

  protected expected(code: number): string {
    return statusText(code);
  }

  protected async run(index: number): Promise<void> {
    const statusCase = this.cases[index];
    this.running.set(index);
    try {
      const outcome = await statusCase.run();
      const hit = statusCase.blocked ? outcome.failure === 'blocked' : outcome.status === statusCase.code;
      if (statusCase.blocked && hit) {
        outcome.message =
          `O preflight (OPTIONS) recebeu 403 Forbidden porque a API não libera ${statusCase.blocked}. ` +
          'O JavaScript não vê nem o status, só um erro de rede; o detalhe está no Console (F12).';
      }
      this.results.update((results) => ({ ...results, [index]: { outcome, hit } }));
    } finally {
      this.running.set(null);
    }
  }

  /** Uma requisição; erro ou sucesso, devolve o que aparece na caixa de resposta. */
  private async call(method: string, path: string, options: CaseOptions = {}): Promise<Outcome> {
    try {
      const response = await firstValueFrom(this.api.raw(method, path, await this.withKey(method, options)));
      return { status: response.status };
    } catch (error) {
      return errorOutcome(error);
    }
  }

  /** Escritas levam a chave desta aba, a não ser que o card já mande outra ou queira testar sem nenhuma. */
  private async withKey(method: string, options: CaseOptions): Promise<RawOptions> {
    const { noKey, ...raw } = options;
    if (noKey || !WRITE_METHODS.has(method) || raw.headers?.[API_KEY_HEADER]) {
      return raw;
    }
    const key = await this.ensureLabKey();
    return key ? { ...raw, headers: { ...raw.headers, [API_KEY_HEADER]: key } } : raw;
  }

  private async ensureLabKey(): Promise<string | null> {
    this.labKey ??= await this.newKey('scene-web (Status codes)');
    return this.labKey;
  }

  /** POST /api-keys: devolve a chave completa (ou null, se a API recusar). */
  private async newKey(owner: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(this.api.raw('POST', '/api-keys', { body: { owner } }));
      return (response.body as { key?: string } | null)?.key ?? null;
    } catch {
      return null;
    }
  }

  /** Gera uma chave, revoga e tenta escrever com ela. */
  private async revokedKey(): Promise<Outcome> {
    const key = await this.newKey('scene-web (chave para revogar)');
    if (!key) {
      return { status: 0, message: 'Não deu para gerar a chave (POST /api-keys).' };
    }
    const headers = { [API_KEY_HEADER]: key };
    await this.call('DELETE', '/api-keys/me', { headers });
    return this.call('POST', '/artists', { body: { name: 'Banda Lab', genre: 'ROCK' }, headers });
  }

  private async conflict(): Promise<Outcome> {
    const body = { name: `Banda Lab ${shortId()}`, genre: 'ROCK' };
    const first = await this.created('/artists', body);
    const second = await this.call('POST', '/artists', { body });
    await this.cleanUp(first);
    return second;
  }

  private async reusedKey(): Promise<Outcome> {
    const key = newIdempotencyKey();
    const headers = { 'X-Idempotency-Key': key };
    const first = await this.created('/playlists', { name: `Lab A ${shortId()}`, visibility: 'PUBLIC' }, headers);
    const second = await this.call('POST', '/playlists', {
      body: { name: `Lab B ${shortId()}`, visibility: 'PUBLIC' },
      headers,
    });
    await this.cleanUp(first);
    return second;
  }

  /** Dispara várias requisições de uma vez: o bucket tem 30 tokens, então as que sobram recebem 429. */
  private async burst(): Promise<Outcome> {
    const context = new HttpContext().set(QUIET, true);
    const calls = Array.from({ length: BURST_SIZE }, () =>
      this.api.raw('GET', '/artists?page=0&size=1', { context }).pipe(
        map((response) => ({ status: response.status, retryAfter: null as string | null })),
        catchError((error: unknown) =>
          of(isApiError(error) ? { status: error.status, retryAfter: error.retryAfter } : { status: 0, retryAfter: null }),
        ),
      ),
    );
    const responses = await firstValueFrom(forkJoin(calls));
    const refused = responses.filter((response) => response.status === 429);
    const accepted = responses.filter((response) => response.status === 200).length;
    this.traffic.logSummary(
      `${BURST_SIZE} x GET /artists?page=0&size=1`,
      `${accepted} x 200 OK, ${refused.length} x 429 Too Many Requests`,
      refused.length ? 'error' : 'ok',
    );
    const note = `${accepted} aceitas (200 OK) e ${refused.length} recusadas (429 Too Many Requests). ` +
      'Os tokens voltam aos poucos, um a cada 2 s.';
    if (!refused.length) {
      return { status: 200, note };
    }
    return {
      status: 429,
      message: 'Limite de requisições excedido.',
      retryAfter: refused[refused.length - 1].retryAfter,
      note,
    };
  }

  /** POST que deve dar certo, para os casos que precisam de um registro antes. Devolve o item criado. */
  private async created(path: string, body: unknown, headers?: Record<string, string>): Promise<Item | null> {
    try {
      const response = await firstValueFrom(this.api.raw('POST', path, await this.withKey('POST', { body, headers })));
      return response.body as Item;
    } catch {
      return null;
    }
  }

  private async cleanUp(item: Item | null): Promise<void> {
    const href = item?._links?.['delete']?.href;
    if (!href) return;
    try {
      await firstValueFrom(this.api.raw('DELETE', href, await this.withKey('DELETE', {})));
    } catch {
      // se a limpeza falhar, o registro de teste fica; não muda o resultado do card
    }
  }
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}
