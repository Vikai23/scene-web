/**
 * Endereço da Scene API. Este front roda em outra origem (http://localhost:4200) e chama a API pelo navegador;
 * as respostas só chegam ao JavaScript porque o CORS da API libera essa origem (scene.cors.allowed-origins).
 */
export const API_URL = location.hostname === 'localhost' ? 'http://localhost:8080' : 'https://scene-api-kwmn.onrender.com/';

/** Headers da Parte 2 que o front envia ou lê. */
export const API_KEY_HEADER = 'X-API-Key';
export const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';
export const REPLAYED_HEADER = 'X-Idempotent-Replayed';
export const LIMIT_HEADER = 'X-RateLimit-Limit';
export const REMAINING_HEADER = 'X-RateLimit-Remaining';
export const RESET_HEADER = 'X-RateLimit-Reset';
export const RETRY_AFTER_HEADER = 'Retry-After';
