import { Item } from './models';

export type ResourceKey = 'artists' | 'artist-profiles' | 'albums' | 'tracks' | 'playlists';

export const GENRES = [
  'ROCK', 'ALTERNATIVE', 'PUNK', 'EMO', 'POST_HARDCORE', 'METALCORE', 'METAL',
  'POP', 'HIP_HOP', 'ELECTRONIC', 'JAZZ', 'FOLK', 'CLASSICAL', 'OTHER',
] as const;
export const ALBUM_TYPES = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION', 'LIVE'] as const;
export const VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;

/** Um campo do formulário. O name é o nome do campo no JSON da API. */
export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'ref';
  options?: readonly string[];
  /** Campo que guarda o id de outro recurso (o formulário mostra uma lista para escolher). */
  ref?: 'artists' | 'albums';
  optional?: boolean;
  hint?: string;
}

/** Como o front trata cada recurso: rotas de entrada, campos, ordenação aceita e como mostrar um item. */
export interface ResourceConfig {
  key: ResourceKey;
  tab: string;
  number: string;
  one: string;
  deleted: string;
  createLabel: string;
  path: string;
  embedded: string;
  sort: readonly string[];
  search: { path: string; param: string; label: string; placeholder: string };
  filter?: { label: string; options: readonly string[]; path: (value: string) => string };
  title: (item: Item) => string;
  meta: (item: Item) => unknown[];
  cascade: string;
  fields: FieldConfig[];
}

export const RESOURCES: Record<ResourceKey, ResourceConfig> = {
  artists: {
    key: 'artists', tab: 'Artistas', number: '01', one: 'artista', deleted: 'excluído', createLabel: 'Novo artista',
    path: '/artists', embedded: 'artists',
    sort: ['id', 'name', 'genre', 'country', 'formedYear'],
    search: { path: '/artists/search', param: 'name', label: 'Buscar por nome', placeholder: 'ex.: horizon' },
    filter: { label: 'Gênero', options: GENRES, path: (value) => `/artists/by-genre/${value}` },
    title: (item) => String(item['name']),
    meta: (item) => [item['genre'], item['country'], item['formedYear']],
    cascade: 'O perfil, os álbuns e as faixas dele também saem, e as faixas saem das playlists.',
    fields: [
      { name: 'name', label: 'Nome', type: 'text', hint: '2 a 100 caracteres, com ao menos uma letra; não pode repetir' },
      { name: 'genre', label: 'Gênero', type: 'select', options: GENRES },
      { name: 'country', label: 'País', type: 'text', optional: true, hint: '2 a 60 letras, sem números' },
      { name: 'formedYear', label: 'Ano de formação', type: 'number', optional: true, hint: '1000 a 2100' },
    ],
  },
  'artist-profiles': {
    key: 'artist-profiles', tab: 'Perfis', number: '02', one: 'perfil', deleted: 'excluído', createLabel: 'Novo perfil',
    path: '/artist-profiles', embedded: 'artistProfiles',
    sort: ['id', 'hometown', 'website', 'instagram'],
    search: { path: '/artist-profiles/search', param: 'hometown', label: 'Buscar por cidade', placeholder: 'ex.: england' },
    title: (item) => String(item['artistName']),
    meta: (item) => [item['hometown'], item['instagram'] ? `@${item['instagram']}` : null],
    cascade: 'O artista continua existindo, só fica sem perfil.',
    fields: [
      { name: 'artistId', label: 'Artista', type: 'ref', ref: 'artists', hint: 'o artista precisa existir e ainda não ter perfil; depois não pode trocar' },
      { name: 'biography', label: 'Biografia', type: 'textarea', hint: '10 a 1000 caracteres' },
      { name: 'hometown', label: 'Cidade natal', type: 'text', optional: true, hint: '2 a 100 letras, sem números' },
      { name: 'website', label: 'Site', type: 'text', optional: true, hint: 'começa com http:// ou https://' },
      { name: 'instagram', label: 'Instagram', type: 'text', optional: true, hint: 'sem o @, até 30 caracteres' },
    ],
  },
  albums: {
    key: 'albums', tab: 'Álbuns', number: '03', one: 'álbum', deleted: 'excluído', createLabel: 'Novo álbum',
    path: '/albums', embedded: 'albums',
    sort: ['id', 'title', 'releaseYear', 'type', 'label'],
    search: { path: '/albums/search', param: 'title', label: 'Buscar por título', placeholder: 'ex.: scream' },
    filter: { label: 'Formato', options: ALBUM_TYPES, path: (value) => `/albums/by-type/${value}` },
    title: (item) => String(item['title']),
    meta: (item) => [item['artistName'], item['releaseYear'], item['type']],
    cascade: 'As faixas dele também saem, e saem das playlists.',
    fields: [
      { name: 'artistId', label: 'Artista', type: 'ref', ref: 'artists' },
      { name: 'title', label: 'Título', type: 'text', hint: '1 a 150 caracteres; não repete no mesmo artista' },
      { name: 'releaseYear', label: 'Ano de lançamento', type: 'number', hint: '1900 a 2100' },
      { name: 'type', label: 'Formato', type: 'select', options: ALBUM_TYPES },
      { name: 'label', label: 'Gravadora', type: 'text', optional: true, hint: '2 a 100 caracteres' },
    ],
  },
  tracks: {
    key: 'tracks', tab: 'Faixas', number: '04', one: 'faixa', deleted: 'excluída', createLabel: 'Nova faixa',
    path: '/tracks', embedded: 'tracks',
    sort: ['id', 'title', 'trackNumber', 'durationSeconds'],
    search: { path: '/tracks/search', param: 'title', label: 'Buscar por título', placeholder: 'ex.: heart' },
    title: (item) => String(item['title']),
    meta: (item) => [
      item['artistName'],
      item['albumTitle'],
      item['trackNumber'] != null ? `faixa ${item['trackNumber']}` : null,
      duration(item['durationSeconds']),
    ],
    cascade: 'Ela também sai de todas as playlists.',
    fields: [
      { name: 'albumId', label: 'Álbum', type: 'ref', ref: 'albums' },
      { name: 'title', label: 'Título', type: 'text', hint: '1 a 150 caracteres' },
      { name: 'trackNumber', label: 'Número da faixa', type: 'number', hint: '1 a 99; não repete no mesmo álbum' },
      { name: 'durationSeconds', label: 'Duração em segundos', type: 'number', optional: true, hint: '1 a 7200' },
    ],
  },
  playlists: {
    key: 'playlists', tab: 'Playlists', number: '05', one: 'playlist', deleted: 'excluída', createLabel: 'Nova playlist',
    path: '/playlists', embedded: 'playlists',
    sort: ['id', 'name', 'description', 'visibility'],
    search: { path: '/playlists/search', param: 'name', label: 'Buscar por nome', placeholder: 'ex.: rotation' },
    filter: { label: 'Visibilidade', options: VISIBILITIES, path: (value) => `/playlists/by-visibility/${value}` },
    title: (item) => String(item['name']),
    meta: (item) => [item['visibility'], item['trackCount'] != null ? `${item['trackCount']} faixa(s)` : null],
    cascade: 'As faixas continuam existindo, só deixam de estar nela.',
    fields: [
      { name: 'name', label: 'Nome', type: 'text', hint: '2 a 100 caracteres; não pode repetir' },
      { name: 'description', label: 'Descrição', type: 'textarea', optional: true, hint: 'até 255 caracteres' },
      { name: 'visibility', label: 'Visibilidade', type: 'select', options: VISIBILITIES },
    ],
  },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES) as ResourceKey[];

/** Para onde aponta cada rel dos links HATEOAS: um item só (single) ou uma lista. */
export const RELS: Record<string, { resource: ResourceKey; single?: boolean } | undefined> = {
  artists: { resource: 'artists' },
  artist: { resource: 'artists', single: true },
  'artist-profiles': { resource: 'artist-profiles' },
  profile: { resource: 'artist-profiles', single: true },
  albums: { resource: 'albums' },
  album: { resource: 'albums', single: true },
  tracks: { resource: 'tracks' },
  playlists: { resource: 'playlists' },
};

/** self, update e delete viram os botões de ação, não links de navegação. */
export const ACTION_RELS = new Set(['self', 'update', 'delete']);

/** O que cada link significa, para mostrar embaixo do rel. */
export const REL_TEXT: Record<string, string | undefined> = {
  'artists:artists': 'todos os artistas',
  'artists:albums': 'os álbuns deste artista',
  'artists:profile': 'o perfil deste artista',
  'artist-profiles:artist-profiles': 'todos os perfis',
  'artist-profiles:artist': 'o artista dono do perfil',
  'albums:albums': 'todos os álbuns',
  'albums:artist': 'o artista dono do álbum',
  'albums:tracks': 'as faixas deste álbum',
  'tracks:tracks': 'todas as faixas',
  'tracks:album': 'o álbum desta faixa',
  'tracks:playlists': 'as playlists que têm esta faixa',
  'playlists:playlists': 'todas as playlists',
  'playlists:tracks': 'as faixas desta playlist',
};

export function duration(seconds: unknown): string | null {
  if (typeof seconds !== 'number') return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Os campos de um item que aparecem na lista, sem os vazios. */
export function metaOf(config: ResourceConfig, item: Item): string[] {
  return config.meta(item)
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(String);
}
