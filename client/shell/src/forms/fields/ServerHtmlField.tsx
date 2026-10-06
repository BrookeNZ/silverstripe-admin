/**
 * Transitional: renders a field the shell has no component for from the holder HTML the admin
 * module sends with the schema (`fallback.html`), marked as such, with one console warning per field
 * name. No legacy JavaScript runs on it, and its links and inline handlers are removed. When the HTML is a single plain control named like the field,
 * that control's value is bound to the form and posted; otherwise the controls are disabled and the
 * field posts nothing (see serverHtml.ts).
 */
import * as React from 'react';
import { bindServerHtml, prepareServerHtml } from '../serverHtml';
import type { FieldComponentProps } from '../types';
import './server-html-field.css';

const warned = new Set<string>();

type ValueControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export const ServerHtmlField = ({ field, value, onChange, onBlur, error }: FieldComponentProps) => {
  const html = field.fallback?.html ?? '';
  const binding = bindServerHtml(field.name, html);
  const prepared = React.useMemo(() => prepareServerHtml(html), [html]);
  const content = React.useRef<HTMLFieldSetElement>(null);

  React.useEffect(() => {
    if (!warned.has(field.name)) {
      warned.add(field.name);
      console.warn(
        `Field "${field.name}" is rendered from server HTML because no component is registered for it` +
          (binding.posts ? '.' : `; it posts nothing because ${binding.reason}.`),
      );
    }
  }, [field.name, binding]);

  React.useLayoutEffect(() => {
    const control = binding.posts ? content.current?.querySelector<ValueControl>(`[name="${CSS.escape(field.name)}"]`) : null;
    const text = value == null ? '' : String(value);
    if (control && control.value !== text) {
      control.value = text;
    }
  }, [binding.posts, field.name, value]);

  React.useEffect(() => {
    const element = content.current;
    if (!binding.posts || !element) {
      return undefined;
    }
    const report = (event: Event) => {
      const target = event.target as ValueControl;
      if (target.name === field.name) {
        onChange(target.value);
      }
    };
    element.addEventListener('input', report);
    element.addEventListener('change', report);
    element.addEventListener('focusout', onBlur);
    return () => {
      element.removeEventListener('input', report);
      element.removeEventListener('change', report);
      element.removeEventListener('focusout', onBlur);
    };
  }, [binding.posts, field.name, onChange, onBlur]);

  return (
    <div className="shell-server-html">
      <p className="shell-server-html__marker">
        Rendered from server HTML{binding.posts ? '' : '; changes here are not saved'}
        {prepared.links > 0 ? '; its links are not available in the shell yet' : ''}
      </p>
      <fieldset
        className="shell-server-html__content"
        ref={content}
        disabled={!binding.posts}
        dangerouslySetInnerHTML={{ __html: prepared.html }}
      />
      {error && (
        <p className="admin-field__message" id={`${field.id}_message`}>
          {error}
        </p>
      )}
    </div>
  );
};
