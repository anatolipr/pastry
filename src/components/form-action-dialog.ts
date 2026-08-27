import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from 'avosignals';
import { newActionKind, editActionTarget, createAction, updateAction } from '../store/actions-store';
import type { FormStep } from '../shared-types';

@customElement('form-action-dialog')
export class FormActionDialog extends LitElement {
  private watcher = new SignalWatcher(this);

  @state() private _name = '';
  @state() private _url = '';
  @state() private _steps: FormStep[] = [{ value: '', then: 'tab' }, { value: '', then: 'enter' }];
  private _wasOpen = false;

  static styles = css`
    :host { display: contents; }
    .overlay {
      position: fixed; inset: 0; background: var(--overlay-bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
      overflow-y: auto; padding: 16px; box-sizing: border-box;
    }
    .dialog {
      background: var(--bg-dialog); border: 1px solid var(--border-dialog);
      border-radius: 10px; padding: 20px 24px; width: 480px;
      max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h3 { margin: 0 0 14px; font-size: 14px; color: var(--accent-pinned); }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
    input, select {
      box-sizing: border-box; background: var(--bg-input);
      border: 1px solid var(--border-input-strong); border-radius: 5px;
      color: var(--text-primary); font-size: 13px; padding: 7px 10px;
      outline: none; font-family: inherit;
    }
    input:focus, select:focus { border-color: var(--accent-pinned); }
    .name-input, .url-input { width: 100%; margin-bottom: 14px; }
    .steps-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .step-block { margin-bottom: 12px; }
    .step-row { display: flex; gap: 8px; align-items: center; }
    .step-row input { flex: 1; min-width: 0; }
    .step-row select { width: auto; min-width: 108px; flex-shrink: 0; }
    .wait-row { display: flex; align-items: center; margin-top: 6px; }
    .wait-label {
      display: flex; align-items: center; gap: 5px; font-size: 11px;
      color: var(--text-secondary); white-space: nowrap; cursor: pointer; margin: 0;
    }
    .wait-label input { width: auto; padding: 0; margin: 0; }
    .remove-step { background: transparent; border: none; color: var(--accent-danger); cursor: pointer; font-size: 13px; flex-shrink: 0; }
    .add-step { background: transparent; border: 1px dashed var(--border-input-strong); color: var(--text-secondary); border-radius: 5px; padding: 5px 10px; font-size: 12px; cursor: pointer; margin-bottom: 14px; }
    .add-step:hover { background: var(--bg-hover); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; position: sticky; bottom: 0; background: var(--bg-dialog); padding: 10px 0 2px; }
    button.cancel, button.confirm {
      border-radius: 5px; cursor: pointer; font-size: 12px;
      padding: 6px 14px; border: 1px solid var(--border-input-strong);
    }
    .cancel { background: transparent; color: var(--text-secondary); }
    .cancel:hover { background: var(--bg-hover); }
    .confirm { background: var(--accent-pinned); color: #1a1a1e; border-color: var(--accent-pinned); font-weight: 600; }
    .confirm:disabled { opacity: 0.4; cursor: default; }
  `;

  private _isOpen(): boolean {
    return newActionKind.get() === 'form' || editActionTarget.get()?.kind === 'form';
  }

  updated() {
    const open = this._isOpen();
    if (open && !this._wasOpen) {
      const editing = editActionTarget.get();
      this._name = editing?.name ?? '';
      this._url = editing?.url ?? '';
      this._steps = editing?.steps ?? [{ value: '', then: 'tab' }, { value: '', then: 'enter' }];
      this.shadowRoot?.querySelector<HTMLInputElement>('#form-name-input')?.focus();
    }
    this._wasOpen = open;
  }

  private _close(): void {
    newActionKind.set(null);
    editActionTarget.set(null);
    this._reset();
  }

  private _reset(): void {
    this._name = '';
    this._url = '';
    this._steps = [{ value: '', then: 'tab' }, { value: '', then: 'enter' }];
  }

  private _setStep(i: number, patch: Partial<FormStep>): void {
    this._steps = this._steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
  }

  private _addStep(): void {
    this._steps = [...this._steps, { value: '', then: 'none' }];
  }

  private _removeStep(i: number): void {
    this._steps = this._steps.filter((_, idx) => idx !== i);
  }

  private _validSteps(): FormStep[] {
    return this._steps.filter((s) => s.value.trim() !== '');
  }

  private _confirm(): void {
    const steps = this._validSteps();
    if (!this._name.trim() || steps.length === 0) return;
    const editing = editActionTarget.get();
    if (editing) {
      updateAction(editing.id, { name: this._name, url: this._url, steps });
    } else {
      createAction({ name: this._name, kind: 'form', url: this._url, steps });
    }
    this._close();
  }

  render() {
    if (!this._isOpen()) return html``;
    const canConfirm = this._name.trim() && this._validSteps().length > 0;
    return html`
      <div
        class="overlay"
        @mousedown=${(e: MouseEvent) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).dataset['dismissDown'] = '1'; }}
        @mouseup=${(e: MouseEvent) => { const el = e.currentTarget as HTMLElement; if (e.target === el && el.dataset['dismissDown']) this._close(); delete el.dataset['dismissDown']; }}
      >
        <div
          class="dialog"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this._close(); }}
        >
          <h3>${editActionTarget.get() ? 'Edit Form Action' : 'New Form Action'}</h3>
          <label for="form-name-input">Name</label>
          <input id="form-name-input" class="name-input" .value=${this._name} placeholder="Login — Demo Advertiser"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <label for="form-url-input">URL (optional — leave blank to fill in the current window instead)</label>
          <input id="form-url-input" class="url-input" .value=${this._url} placeholder="http://localhost:12680"
            @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)} />
          <div class="steps-label"><label>Fields to type, in order</label></div>
          ${this._steps.map((step, i) => html`
            <div class="step-block">
              <div class="step-row">
                <input .value=${step.value} placeholder=${i === 0 ? 'demoadvertiser' : 'password'}
                  @input=${(e: Event) => this._setStep(i, { value: (e.target as HTMLInputElement).value })} />
                <select @change=${(e: Event) => this._setStep(i, { then: (e.target as HTMLSelectElement).value as FormStep['then'] })}>
                  <option value="tab" ?selected=${step.then === 'tab'}>Then Tab</option>
                  <option value="enter" ?selected=${step.then === 'enter'}>Then Enter</option>
                  <option value="none" ?selected=${step.then === 'none'}>Then nothing</option>
                </select>
                <button class="remove-step" @click=${() => this._removeStep(i)}>✕</button>
              </div>
              <div class="wait-row">
                <label class="wait-label" title="Pause and show a 'waiting for page to load' popup before the next field. Turn off for an instant, in-memory step (e.g. a JS-only page change) that needs no wait.">
                  <input type="checkbox" .checked=${step.waitForLoad !== false}
                    @change=${(e: Event) => this._setStep(i, { waitForLoad: (e.target as HTMLInputElement).checked })} />
                  Wait for load
                </label>
              </div>
            </div>
          `)}
          <button class="add-step" @click=${() => this._addStep()}>+ Add field</button>
          <div class="actions">
            <button class="cancel" @click=${() => this._close()}>Cancel</button>
            <button class="confirm" ?disabled=${!canConfirm} @click=${() => this._confirm()}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
