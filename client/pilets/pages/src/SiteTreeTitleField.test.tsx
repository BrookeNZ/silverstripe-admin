// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { FieldComponentProps, FieldSchema, FormSchemaTree } from '@silverstripe/admin-shell';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonRequest } from './api';
import { createSiteTreeTitleField, siteTreeTitleFieldName, titleFieldSchema } from './SiteTreeTitleField';
import { siteTreeURLSegmentFieldClass } from './urlSegment';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const suggestUrl = 'admin/pages/edit/EditForm/2/field/URLSegment/suggest/';

const schemaField = (name: string, overrides: Partial<FieldSchema> = {}) =>
  ({
    name,
    id: `Form_EditForm_${name}`,
    type: 'text',
    schemaType: 'Text',
    component: null,
    componentCandidates: ['SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
    title: name,
    readOnly: false,
    disabled: false,
    data: [],
    ...overrides,
  }) as FieldSchema;

const segmentSchema = schemaField('URLSegment', {
  componentCandidates: [siteTreeURLSegmentFieldClass, 'SilverStripe\\Forms\\TextField', 'SilverStripe\\Forms\\FormField'],
  data: { urlPrefix: 'https://example.test/', urlSuffix: '?stage=Stage', defaultUrl: 'new-page', suggestUrl },
});

const pageSchema = (title: FieldSchema, segment: FieldSchema = segmentSchema) =>
  ({
    id: 'schema/EditForm',
    name: 'EditForm',
    action: 'admin/pages/edit/EditForm/2',
    method: 'POST',
    attributes: {},
    fields: [schemaField('Root', { component: 'Tabs', schemaType: 'Structural', children: [title, segment] })],
    actions: [],
  }) as FormSchemaTree;

describe('titleFieldSchema', () => {
  it('routes a page form\'s Title to the title field with the URL segment field\'s link', () => {
    const schema = titleFieldSchema(pageSchema(schemaField('Title')));
    const title = schema.fields[0]!.children![0]!;
    expect(title.componentCandidates?.[0]).toBe(siteTreeTitleFieldName);
    expect(title.data).toEqual({ urlSegment: { name: 'URLSegment', suggestUrl, defaultUrl: 'new-page' } });
  });

  it('leaves the schema alone without an editable URL segment field or an editable Title', () => {
    const readonlySegment = { ...segmentSchema, data: { urlPrefix: 'https://example.test/' } };
    const withoutSuggest = pageSchema(schemaField('Title'), readonlySegment);
    expect(titleFieldSchema(withoutSuggest)).toBe(withoutSuggest);
    const readonlyTitle = pageSchema(schemaField('Title', { readOnly: true }));
    expect(titleFieldSchema(readonlyTitle)).toBe(readonlyTitle);
    const otherForm = { ...pageSchema(schemaField('Title')), fields: [schemaField('Title')] };
    expect(titleFieldSchema(otherForm)).toBe(otherForm);
  });
});

type Field = FieldComponentProps['field'];

const titleField = {
  key: 'Title',
  name: 'Title',
  id: 'Form_EditForm_Title',
  holderId: 'Form_EditForm_Title_Holder',
  title: 'Page name',
  schemaType: 'Text',
  component: null,
  readOnly: false,
  disabled: false,
  attributes: {},
  data: { urlSegment: { name: 'URLSegment', suggestUrl, defaultUrl: 'new-page' } },
  source: [],
  children: [],
} as unknown as Field;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

/** Stands in for the form: the Title's value, and the siblings the title field reads and writes */
function render(request: JsonRequest, siblings: { URLSegment: string; LiveLink: string | null }, initialTitle = 'New page') {
  const autofill = vi.fn((name: string, value: unknown) => {
    (siblings as Record<string, unknown>)[name] = value;
  });
  const useFormFieldValue = (name: string) => (siblings as Record<string, unknown>)[name];
  const Component = createSiteTreeTitleField({ request, useFormFieldValue });
  const Form = () => {
    const [value, setValue] = React.useState<unknown>(initialTitle);
    return (
      <Component
        field={titleField}
        value={value}
        onChange={setValue}
        onBlur={() => undefined}
        submitting={false}
        renderFields={() => null}
        autofill={autofill}
      />
    );
  };
  const host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  container = host;
  root = created;
  act(() => created.render(<Form />));
  return autofill;
}

const input = () => container!.querySelector<HTMLInputElement>('#Form_EditForm_Title')!;
const updateButton = () => [...container!.querySelectorAll('button')].find((button) => button.textContent === 'Update URL');

async function changeTitle(value: string) {
  act(() => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input().blur());
}

describe('SiteTreeTitleField', () => {
  it('updates the default segment of an unpublished page through suggest when the title changes', async () => {
    const request = vi.fn(async () => ({ value: 'about-us' })) as unknown as JsonRequest;
    const autofill = render(request, { URLSegment: 'new-page', LiveLink: '' });

    await changeTitle('About us');

    expect(request).toHaveBeenCalledWith(suggestUrl, expect.objectContaining({ query: { value: 'About us' } }));
    expect(autofill).toHaveBeenCalledWith('URLSegment', 'about-us');
    expect(updateButton()).toBeUndefined();
  });

  it('offers Update URL on a published page instead, and updates the segment when pressed', async () => {
    const request = vi.fn(async () => ({ value: 'team-2' })) as unknown as JsonRequest;
    const autofill = render(request, { URLSegment: 'new-page', LiveLink: 'https://example.test/new-page/' });

    await changeTitle('Team');
    expect(request).not.toHaveBeenCalled();
    expect(updateButton()).toBeDefined();

    await act(async () => updateButton()!.click());
    expect(request).toHaveBeenCalledWith(suggestUrl, expect.objectContaining({ query: { value: 'Team' } }));
    expect(autofill).toHaveBeenCalledWith('URLSegment', 'team-2');
    expect(updateButton()).toBeUndefined();
    expect(document.activeElement).toBe(input());
  });

  it('offers Update URL on an unpublished page whose segment was already changed', async () => {
    const request = vi.fn() as unknown as JsonRequest;
    render(request, { URLSegment: 'our-team', LiveLink: '' });
    await changeTitle('Team');
    expect(request).not.toHaveBeenCalled();
    expect(updateButton()).toBeDefined();
  });

  it('does nothing when the title is left as it was', async () => {
    const request = vi.fn() as unknown as JsonRequest;
    render(request, { URLSegment: 'new-page', LiveLink: '' });
    await changeTitle('New page');
    expect(request).not.toHaveBeenCalled();
    expect(updateButton()).toBeUndefined();
  });

  it('shows a suggest failure under the title', async () => {
    const failure = Object.assign(new Error('The server answered 500'), { name: 'ServerRequestError', serverMessage: 'Something broke' });
    const request = vi.fn(() => Promise.reject(failure)) as unknown as JsonRequest;
    render(request, { URLSegment: 'new-page', LiveLink: '' });
    await changeTitle('About');
    expect(container!.querySelector('#Form_EditForm_Title_message')?.textContent).toBe('Something broke');
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });
});
