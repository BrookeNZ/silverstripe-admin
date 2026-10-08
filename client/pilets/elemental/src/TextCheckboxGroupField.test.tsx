// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { CheckboxField, TextField } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import { afterEach, describe, expect, it } from 'vitest';
import { TextCheckboxGroupField } from './TextCheckboxGroupField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Field = FieldComponentProps['field'];

const child = (name: string, title: string, schemaType: string) =>
  ({ key: name, name, id: `Form_ElementForm_1_${name}`, title, schemaType, component: null, readOnly: false, disabled: false, data: {}, source: [], children: [] }) as unknown as Field;

const titleText = child('PageElements_1_Title', 'Title', 'Text');
const showTitle = child('PageElements_1_ShowTitle', 'Displayed', 'Boolean');
const group = {
  ...child('Title', 'Title', 'Structural'),
  holderId: 'Form_ElementForm_1_Title_Holder',
  component: 'TextCheckboxGroupField',
  children: [titleText, showTitle],
} as unknown as Field;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Stands in for the form: each child is bound to a posted value, as the shell binds them */
const Form = ({ field, values }: { field: Field; values: Record<string, unknown> }) => {
  const [, rerender] = React.useState(0);
  const renderFields = (fields: Array<Field>) =>
    fields.map((item) => {
      const Component = item.schemaType === 'Boolean' ? CheckboxField : TextField;
      return (
        <Component
          key={item.id}
          field={item}
          value={values[item.name]}
          onChange={(value) => {
            values[item.name] = value;
            rerender((count) => count + 1);
          }}
          onBlur={() => undefined}
          submitting={false}
          renderFields={() => null}
        />
      );
    });
  const props = { field, value: null, onChange: () => undefined, onBlur: () => undefined, submitting: false, renderFields } as unknown as FieldComponentProps;
  return <TextCheckboxGroupField {...props} />;
};

function render(field: Field, values: Record<string, unknown>): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Form field={field} values={values} />));
}

describe('TextCheckboxGroupField', () => {
  it('labels the title input with the group title and puts the Displayed checkbox after it', () => {
    render(group, { PageElements_1_Title: 'Child page block', PageElements_1_ShowTitle: 1 });
    const labels = [...container.querySelectorAll('label')].map((label) => [label.textContent, label.htmlFor]);
    expect(labels).toEqual([
      ['Title', titleText.id],
      ['Displayed', showTitle.id],
    ]);
    const text = container.querySelector<HTMLInputElement>(`#${titleText.id}`)!;
    const checkbox = container.querySelector<HTMLInputElement>(`#${showTitle.id}`)!;
    expect(text.value).toBe('Child page block');
    expect(checkbox.checked).toBe(true);
    expect(text.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reports both children\'s values under their own posted names', () => {
    const values: Record<string, unknown> = { PageElements_1_Title: 'Old', PageElements_1_ShowTitle: 1 };
    render(group, values);
    const text = container.querySelector<HTMLInputElement>(`#${titleText.id}`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(text, 'New title');
      text.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => container.querySelector<HTMLInputElement>(`#${showTitle.id}`)!.click());
    expect(values).toEqual({ PageElements_1_Title: 'New title', PageElements_1_ShowTitle: 0 });
  });

  it('renders the title alone when the checkbox was removed', () => {
    render({ ...group, children: [titleText] } as unknown as Field, { PageElements_1_Title: 'Only' });
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('label')?.htmlFor).toBe(titleText.id);
  });
});
