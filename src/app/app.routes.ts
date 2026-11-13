import { Routes } from '@angular/router';

import { RESOURCES, RESOURCE_KEYS } from './core/resources';
import { ResourcePage } from './pages/resources/resource-page';
import { StatusCodes } from './pages/status-codes/status-codes';

/** Uma aba por recurso da API (/artists, /artist-profiles, /albums, /tracks, /playlists) e a de status codes. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'artists' },
  ...RESOURCE_KEYS.map((key) => ({
    path: key,
    component: ResourcePage,
    data: { resource: key },
    title: `${RESOURCES[key].tab} · Scene API web`,
  })),
  { path: 'status-codes', component: StatusCodes, title: 'Status codes · Scene API web' },
  { path: '**', redirectTo: 'artists' },
];
