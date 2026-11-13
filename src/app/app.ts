import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { API_URL } from './core/api.config';
import { RESOURCES, RESOURCE_KEYS } from './core/resources';
import { StatusService } from './core/status.service';
import { TrafficLog } from './shared/traffic-log';

interface Tab {
  path: string;
  number: string;
  label: string;
  codes?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TrafficLog],
  templateUrl: './app.html',
})
export class App {
  protected readonly status = inject(StatusService);
  protected readonly apiUrl = API_URL;
  protected readonly pageOrigin = location.origin;

  protected readonly tabs: Tab[] = [
    ...RESOURCE_KEYS.map((key) => ({ path: `/${key}`, number: RESOURCES[key].number, label: RESOURCES[key].tab })),
    { path: '/status-codes', number: '!!', label: 'Status codes', codes: true },
  ];

  /** Relógio para a contagem regressiva do Retry-After depois de um 429. */
  private readonly now = signal(Date.now());

  protected readonly wait = computed(() => {
    const until = this.status.blockedUntil();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });

  protected readonly corsLabel = computed(() => {
    switch (this.status.connection()) {
      case 'allowed':
        return 'CORS liberado';
      case 'blocked':
        return 'Bloqueado pelo CORS';
      case 'offline':
        return 'API fora do ar';
      default:
        return 'conferindo o CORS';
    }
  });

  protected readonly corsHelp = computed(() => {
    switch (this.status.connection()) {
      case 'blocked':
        return `A API está no ar, mas não libera a origem ${this.pageOrigin}, então o navegador barra as respostas. ` +
          'Rode o front com npm start (porta 4200), que é a origem de scene.cors.allowed-origins. ' +
          'O erro completo aparece no Console do navegador (F12).';
      case 'offline':
        return `Nenhuma resposta em ${API_URL}. Rode a SceneApiApplication e recarregue a página.`;
      default:
        return null;
    }
  });

  protected readonly online = computed(() => {
    const connection = this.status.connection();
    return connection === 'checking' ? 'checking' : connection === 'offline' ? 'offline' : 'online';
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
