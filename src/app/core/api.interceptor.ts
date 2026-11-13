import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, mergeMap, tap, throwError } from 'rxjs';

import { API_URL, RETRY_AFTER_HEADER } from './api.config';
import { ApiError, FieldIssue } from './models';
import { StatusService } from './status.service';
import { TrafficService } from './traffic.service';

/** Não registra a chamada no Tráfego nem mexe no estado da ligação (a rajada de 120 requisições da aba Status codes). */
export const QUIET = new HttpContextToken<boolean>(() => false);

/** Uma falha de rede nesta chamada não muda o estado da ligação no topo (os testes de bloqueio da aba Status codes). */
export const KEEP_CONNECTION = new HttpContextToken<boolean>(() => false);

/**
 * Roda em toda chamada para a API: pede JSON, informa o Content-Type, atualiza o rate limit e o estado da
 * ligação (CORS), registra no Tráfego e transforma qualquer erro num ApiError com status, message e details.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_URL)) {
    return next(req);
  }
  const status = inject(StatusService);
  const traffic = inject(TrafficService);

  const headers: Record<string, string> = {};
  if (!req.headers.has('Accept')) {
    headers['Accept'] = 'application/json';
  }
  const contentType = req.detectContentTypeHeader();
  if (req.body !== null && !req.headers.has('Content-Type') && contentType) {
    headers['Content-Type'] = contentType;
  }
  const request = req.clone({ setHeaders: headers });
  const quiet = request.context.get(QUIET);
  const keepConnection = quiet || request.context.get(KEEP_CONNECTION);

  return next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        if (!keepConnection) status.connection.set('allowed');
        status.readRateLimit(event.headers);
        if (!quiet) traffic.logResponse(request, event.status, event.headers, null);
      }
    }),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      if (error.status === 0) {
        // O navegador não entregou a resposta: ou a API está fora do ar, ou o CORS barrou
        return from(diagnose()).pipe(
          mergeMap((failure) => {
            if (!keepConnection) status.connection.set(failure);
            if (!quiet) traffic.logFailure(request, failure);
            return throwError(() => failureError(failure));
          }),
        );
      }
      if (!keepConnection) status.connection.set('allowed');
      status.readRateLimit(error.headers);
      const apiError = toApiError(error);
      if (!quiet) traffic.logResponse(request, error.status, error.headers, apiError.message);
      return throwError(() => apiError);
    }),
  );
};

/**
 * Uma chamada no modo "no-cors" (cuja resposta o JavaScript não lê) separa os dois casos de status 0:
 * se ela chega, a API está no ar e quem barrou foi o CORS.
 */
async function diagnose(): Promise<'blocked' | 'offline'> {
  try {
    await fetch(`${API_URL}/artists?page=0&size=1`, { mode: 'no-cors' });
    return 'blocked';
  } catch {
    return 'offline';
  }
}

function failureError(failure: 'blocked' | 'offline'): ApiError {
  return {
    status: 0,
    failure,
    message:
      failure === 'blocked'
        ? 'O navegador bloqueou a resposta (CORS). O JavaScript não recebe nem o status; o motivo aparece no Console (F12).'
        : `Nenhuma resposta em ${API_URL}. Rode a SceneApiApplication e tente de novo.`,
    details: [],
    retryAfter: null,
  };
}

function toApiError(error: HttpErrorResponse): ApiError {
  const body = parse(error.error);
  const message = typeof body?.['message'] === 'string' ? body['message'] : `Erro ${error.status} ao chamar a API.`;
  const details = Array.isArray(body?.['details']) ? (body['details'] as FieldIssue[]) : [];
  return { status: error.status, message, details, retryAfter: error.headers.get(RETRY_AFTER_HEADER) };
}

/** O corpo do erro pode chegar como objeto (JSON) ou como texto (chamadas da aba Status codes com responseType text). */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
}
