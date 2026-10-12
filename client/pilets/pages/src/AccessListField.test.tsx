// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { FieldComponentProps, FieldSchema, FormSchemaTree } from '@silverstripe/admin-shell';
import { afterEach, describe, expect, it } from 'vitest';
import { accessListFieldName, accessListSchema, createAccessListField } from './AccessListField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const schemaField = (name: string, overrides: Partial<FieldSchema> = {}) =>
  ({ name, id: `Form_EditForm_${name}`, type: null, schemaType: null, component: null, title: name, readOnly: false, disabled: false, data: [], ...overrides }) as FieldSchema;

const settingsSchema = (...fields: Array<FieldSchema>) =>
  ({
    id: 'schema/EditForm',
    name: 'EditForm',
    action: 'admin/pages/settings/EditForm/2',
    method: 'POST',
    attributes: {},
    fields: [schemaField('Root', { component: 'Tabs', children: fields })],
    actions: [],
  }) as FormSchemaTree;

describe('accessListSchema', () => {
  it('routes each picker with an option field to the access list field, keeping its own component', () => {
    const schema = accessListSchema(
      settingsSchema(
        schemaField('CanViewType', { component: 'OptionsetField' }),
        schemaField('ViewerGroups', { component: 'TreeDropdownField' }),
        schemaField('ViewerMembers', { component: 'SearchableDropdownField' }),
        schemaField('EditorGroups', { component: 'TreeDropdownField' }),
      ),
    );
    const [, groups, members, editors] = schema.fields[0]!.children!;
    expect(groups!.component).toBe(accessListFieldName);
    expect(groups!.data).toEqual({ accessList: { component: 'TreeDropdownField', optionField: 'CanViewType', shownFor: 'OnlyTheseUsers' } });
    expect(members!.data).toEqual({ accessList: { component: 'SearchableDropdownField', optionField: 'CanViewType', shownFor: 'OnlyTheseMembers' } });
    expect(editors!.component).toBe('TreeDropdownField');
  });

  it('leaves a form without an option field alone', () => {
    const schema = settingsSchema(schemaField('ViewerGroups', { component: 'TreeDropdownField' }));
    expect(accessListSchema(schema)).toBe(schema);
  });
});

describe('AccessListField', () => {
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const render = (option: unknown) => {
    const Picker = () => <span data-testid="picker" />;
    const AccessListField = createAccessListField({
      useFormFieldValue: () => option,
      getSilverstripeComponent: (() => Picker) as never,
    });
    const field = schemaField('ViewerGroups', {
      component: accessListFieldName,
      data: { accessList: { component: 'TreeDropdownField', optionField: 'CanViewType', shownFor: 'OnlyTheseUsers' } },
    });
    const container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    act(() => root!.render(<AccessListField {...({ field } as FieldComponentProps)} />));
    return container.querySelector('[data-testid="picker"]');
  };

  it('shows the picker only for its option, as legacy did', () => {
    expect(render('OnlyTheseUsers')).not.toBeNull();
  });

  it('hides the picker for any other option', () => {
    expect(render('Inherit')).toBeNull();
  });

  it('shows the picker when the option field is not posted', () => {
    expect(render(undefined)).not.toBeNull();
  });
});
