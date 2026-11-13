import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { Item, Outcome, errorOutcome, isApiError } from '../../core/models';
import { FieldConfig, RESOURCES } from '../../core/resources';
import { SceneApiService, newIdempotencyKey } from '../../core/scene-api.service';
import { pathOf } from '../../core/traffic.service';
import { OutcomeBox } from '../../shared/outcome-box';
import { Replay, ResourceStore } from './resource-store';

interface Option {
  value: string;
  label: string;
}

type Controls = Record<string, FormControl<string>>;

/**
 * Cadastro (POST) e edição (PUT). O formulário não confere nada sozinho: manda o JSON como está e quem valida é a
 * API. Se algo estiver errado, o 400 Bad Request aponta o campo, e o erro aparece embaixo dele.
 */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, OutcomeBox],
  templateUrl: './item-form.html',
})
export class ItemForm {
  readonly editing = input<Item | null>(null);
  readonly preset = input<Record<string, unknown>>({});

  protected readonly store = inject(ResourceStore);
  private readonly api = inject(SceneApiService);
  protected readonly config = this.store.config;

  protected readonly form = signal(new FormGroup<Controls>({}));
  protected readonly refs = signal<Record<string, Option[] | undefined>>({});
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly outcome = signal<Outcome | null>(null);
  protected readonly busy = signal(false);

  protected readonly key = signal(newIdempotencyKey());
  protected readonly sendKey = signal(true);
  protected readonly newKey = newIdempotencyKey;

  protected readonly method = computed(() => (this.editing() ? 'PUT' : 'POST'));
  protected readonly target = computed(() => {
    const editing = this.editing();
    return editing ? (editing._links['update']?.href ?? '') : this.api.url(this.config().path);
  });

  constructor() {
    // Cada vez que o formulário abre (cadastro ou edição de outro item), começa do zero
    effect(() => {
      const editing = this.editing();
      const preset = this.preset();
      untracked(() => this.reset(editing, preset));
    });
    for (const field of this.config().fields) {
      if (field.ref) this.loadOptions(field);
    }
  }

  protected path(url: string): string {
    return pathOf(url);
  }

  protected setKey(event: Event): void {
    this.key.set((event.target as HTMLInputElement).value);
  }

  protected setSendKey(event: Event): void {
    this.sendKey.set((event.target as HTMLInputElement).checked);
  }

  protected submit(): void {
    const editing = this.editing();
    const body = this.body();
    const key = !editing && this.sendKey() ? this.key() : null;
    this.fieldErrors.set({});
    this.outcome.set(null);
    this.busy.set(true);

    const request = editing ? this.api.update(this.target(), body) : this.api.create(this.config().path, body, key);
    request.subscribe({
      next: (saved) => {
        this.busy.set(false);
        const replay: Replay | undefined = key ? { path: this.config().path, body, key } : undefined;
        this.store.saved(saved, editing !== null, replay);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.outcome.set(errorOutcome(error));
        if (isApiError(error)) {
          const errors: Record<string, string> = {};
          for (const issue of error.details) {
            errors[issue.field] = errors[issue.field] ? `${errors[issue.field]} / ${issue.message}` : issue.message;
          }
          this.fieldErrors.set(errors);
        }
      },
    });
  }

  private reset(editing: Item | null, preset: Record<string, unknown>): void {
    const controls: Controls = {};
    for (const field of this.config().fields) {
      const value = editing ? editing[field.name] : preset[field.name];
      controls[field.name] = new FormControl(value === null || value === undefined ? '' : String(value), {
        nonNullable: true,
      });
    }
    this.form.set(new FormGroup(controls));
    this.fieldErrors.set({});
    this.outcome.set(null);
    this.key.set(newIdempotencyKey());
    this.sendKey.set(true);
  }

  /** Monta o corpo do JSON com os nomes de campo da API. Campo vazio vai como null (ou "" no texto obrigatório). */
  private body(): Record<string, unknown> {
    const values = this.form().getRawValue();
    const body: Record<string, unknown> = {};
    for (const field of this.config().fields) {
      const raw = values[field.name] ?? '';
      if (field.type === 'number' || field.type === 'ref') {
        body[field.name] = raw === '' ? null : Number(raw);
      } else if (field.type === 'select') {
        body[field.name] = raw === '' ? null : raw;
      } else {
        body[field.name] = raw === '' && field.optional ? null : raw;
      }
    }
    return body;
  }

  /** Opções dos campos de artista e de álbum: os itens que já existem na API. */
  private loadOptions(field: FieldConfig): void {
    const ref = field.ref!;
    const config = RESOURCES[ref];
    const sort = ref === 'artists' ? 'name,asc' : 'title,asc';
    this.api.page(config.path, config.embedded, { size: 50, sort }).subscribe({
      next: (result) => {
        const options = result.items.map((item) => ({
          value: String(item.id),
          label: `${ref === 'albums' ? `${item['title']} / ${item['artistName']}` : item['name']} (#${item.id})`,
        }));
        this.refs.update((refs) => ({ ...refs, [field.name]: options }));
      },
      error: () => this.refs.update((refs) => ({ ...refs, [field.name]: [] })),
    });
  }
}
