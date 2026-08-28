import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { extractPlaceholders } from '../store/clipboard-store';
import './tags-input';

/**
 * Shown inside an action editor dialog when its fields contain ::placeholder::
 * tokens. Renders one <tags-input> per distinct placeholder name, letting the
 * user curate default option values (e.g. ::env:: -> ['stage.x.com', 'prod.x.com'])
 * that show ahead of typed-value history in the placeholder-fill dialog at run time.
 * Emits a 'param-options-changed' CustomEvent with detail: { paramOptions } on any change.
 */
@customElement('param-options-editor')
export class ParamOptionsEditor extends LitElement {
  @property({ type: String }) text = '';
  @property({ type: Object }) paramOptions: Record<string, string[]> = {};

  static styles = css`
    :host { display: block; }
    .name { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 600; }
    .name code { font-weight: 400; color: var(--accent-pinned); background: var(--bg-hover); border-radius: 3px; padding: 0 4px; font-size: 11px; }
    .field { margin-bottom: 14px; }
    .hint { font-size: 11px; color: var(--text-muted); margin: -8px 0 14px; line-height: 1.4; }
  `;

  private _setOptions(name: string, values: string[]): void {
    const next = { ...this.paramOptions };
    if (values.length === 0) delete next[name];
    else next[name] = values;
    this.paramOptions = next;
    this.dispatchEvent(new CustomEvent('param-options-changed', { detail: { paramOptions: next }, bubbles: true, composed: true }));
  }

  render() {
    const names = extractPlaceholders(this.text);
    if (names.length === 0) return html``;
    return html`
      <p class="hint">Optional: predefine values for each ::placeholder:: below, so they can be picked instead of typed each time.</p>
      ${names.map((name) => html`
        <div class="field">
          <div class="name">Default values for <code>::${name}::</code></div>
          <tags-input
            .tags=${this.paramOptions[name] ?? []}
            .suggestions=${[]}
            placeholder="Add a default value…"
            @tags-changed=${(e: CustomEvent) => this._setOptions(name, e.detail.tags)}
          ></tags-input>
        </div>
      `)}
    `;
  }
}
