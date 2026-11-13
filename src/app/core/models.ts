/** Tipos que espelham o JSON da Scene API (formato HAL, com _links e _embedded). */

export interface Link {
  href: string;
}

export type Links = Record<string, Link | undefined>;

/** Um recurso qualquer da API: todos têm id e _links; os demais campos variam. */
export interface Item {
  id: number;
  _links: Links;
  [field: string]: unknown;
}

export type Genre =
  | 'ROCK' | 'ALTERNATIVE' | 'PUNK' | 'EMO' | 'POST_HARDCORE' | 'METALCORE' | 'METAL'
  | 'POP' | 'HIP_HOP' | 'ELECTRONIC' | 'JAZZ' | 'FOLK' | 'CLASSICAL' | 'OTHER';
export type AlbumType = 'ALBUM' | 'EP' | 'SINGLE' | 'COMPILATION' | 'LIVE';
export type Visibility = 'PUBLIC' | 'PRIVATE';

export interface Artist extends Item {
  name: string;
  genre: Genre;
  country: string | null;
  formedYear: number | null;
}

export interface ArtistProfile extends Item {
  artistId: number;
  artistName: string;
  biography: string;
  hometown: string | null;
  website: string | null;
  instagram: string | null;
}

export interface Album extends Item {
  title: string;
  releaseYear: number;
  type: AlbumType;
  label: string | null;
  artistId: number;
  artistName: string;
}

export interface Track extends Item {
  title: string;
  trackNumber: number;
  durationSeconds: number | null;
  albumId: number;
  albumTitle: string;
  artistName: string;
}

export interface Playlist extends Item {
  name: string;
  description: string | null;
  visibility: Visibility;
  trackCount: number;
}

/** Bloco "page" das listagens paginadas. */
export interface PageMeta {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

/** Corpo de uma listagem: itens em _embedded, links de navegação (first, prev, next, last) e o bloco page. */
export interface HalPage {
  _embedded?: Record<string, Item[] | undefined>;
  _links?: Links;
  page?: PageMeta;
}

export interface PageResult {
  url: string;
  items: Item[];
  page: PageMeta | null;
  links: Links;
}

/** Um problema campo a campo, como vem em details. */
export interface FieldIssue {
  field: string;
  message: string;
}

/** Corpo padrão de erro da API (ApiError). */
export interface ApiErrorBody {
  status: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  details: FieldIssue[];
}

/**
 * Erro já tratado pelo interceptor. status 0 = a resposta nem chegou ao JavaScript: ou a API está fora do ar
 * (failure "offline") ou o navegador bloqueou pelo CORS (failure "blocked").
 */
export interface ApiError {
  status: number;
  failure?: 'blocked' | 'offline';
  message: string;
  details: FieldIssue[];
  retryAfter: string | null;
}

/** Resultado de um POST ou PUT que deu certo. */
export interface Saved {
  item: Item;
  status: number;
  location: string | null;
  replayed: string | null;
}

/** O que as caixas de resposta mostram: status, mensagem, erros por campo e os headers da Parte 2. */
export interface Outcome {
  status: number;
  failure?: 'blocked' | 'offline';
  message?: string;
  details?: FieldIssue[];
  retryAfter?: string | null;
  location?: string | null;
  replayed?: string | null;
  note?: string;
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'status' in value && 'details' in value;
}

export function errorOutcome(error: unknown): Outcome {
  if (!isApiError(error)) {
    return { status: 0, failure: 'offline', message: String(error) };
  }
  return {
    status: error.status,
    failure: error.failure,
    message: error.message,
    details: error.details,
    retryAfter: error.retryAfter,
  };
}

export function savedOutcome(saved: Saved, note?: string): Outcome {
  return { status: saved.status, location: saved.location, replayed: saved.replayed, note };
}
