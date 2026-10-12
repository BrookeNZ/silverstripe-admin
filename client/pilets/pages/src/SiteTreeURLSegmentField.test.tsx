// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonRequest } from './api';
import { createSiteTreeURLSegmentField } from './SiteTreeURLSegmentField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Field = FieldComponentProps['field'];

const suggestUrl = 'admin/pages/edit/EditForm/2/field/URLSegment/suggest/';

const urlSegment = (overrides: Partial<Field> = {}) =>
  ({
    key: 'URLSegment',
    name: 'URLSegment',
    id: 'Form_EditForm_URLSegment',
    holderId: 'Form_EditForm_URLSegment_Holder',
    title: 'URL segment',
    schemaType: 'Text',
    component: null,
    readOnly: false,
    disabled: false,
    attributes: {},
    data: {
      urlPrefix: 'https://example.test/parent/',
      urlSuffix: '?stage=Stage',
      helpText: 'Special characters are automatically converted or removed.',
      suggestUrl,
    },
    source: [],
    children: [],
    ...overrides,
  }) as unknown as Field;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Stands in for the form: holds the posted value and records every change */
function render(field: Field, request: JsonRequest, initial = 'about-us') {
  const changes: Array<unknown> = [];
  const Component = createSiteTreeURLSegmentField(request);
  const Form = () => {
    const [value, setValue] = React.useState<unknown>(initial);
    return (
      <Component
        field={field}
        value={value}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
        onBlur={() => undefined}
        submitting={false}
        renderFields={() => null}
        autofill={() => undefined}
      />
    );
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Form />));
  return changes;
}

const button = (name: string) =>
  [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === name) as HTMLButtonElement;

const input = () => container.querySelector<HTMLInputElement>('#Form_EditForm_URLSegment')!;

function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

const unused: JsonRequest = () => Promise.reject(new Error('not expected'));

describe('SiteTreeURLSegmentField', () => {
  it('previews the full URL as a link to the draft page', () => {
    render(urlSegment(), unused);
    const link = container.querySelector('a')!;
    expect(link.textContent).toContain('https://example.test/parent/about-us');
    expect(link.getAttribute('href')).toBe('https://example.test/parent/about-us?stage=Stage');
    expect(link.target).toBe('_blank');
    expect(container.querySelector('input')).toBeNull();
    expect(button('Edit').getAttribute('aria-label')).toBe('Edit URL segment');
  });

  it('edits in an input, then adopts the segment suggest answers and returns focus to Edit', async () => {
    const request = vi.fn(async () => ({ value: 'about-us-2' })) as unknown as JsonRequest;
    const changes = render(urlSegment(), request);

    await click(button('Edit'));
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-describedby')).toBe('Form_EditForm_URLSegment_help');
    type('About us');
    await click(button('OK'));

    expect(request).toHaveBeenCalledWith(
      suggestUrl,
      expect.objectContaining({ query: { value: 'About us' }, headers: { 'X-SecurityID': expect.any(String) } }),
    );
    expect(changes[changes.length - 1]).toBe('about-us-2');
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('a')!.textContent).toContain('https://example.test/parent/about-us-2');
    expect(document.activeElement).toBe(button('Edit'));
  });

  it('suggests on Enter without submitting the form', async () => {
    const request = vi.fn(async () => ({ value: 'team' })) as unknown as JsonRequest;
    render(urlSegment(), request);
    await click(button('Edit'));
    type('Team');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => input().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('closes without a request when the segment is unchanged', async () => {
    const request = vi.fn() as unknown as JsonRequest;
    render(urlSegment(), request);
    await click(button('Edit'));
    await click(button('OK'));
    expect(request).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  });

  it('puts back the value from before Edit on Cancel', async () => {
    const changes = render(urlSegment(), unused);
    await click(button('Edit'));
    type('something-else');
    await click(button('Cancel'));

    expect(changes).toEqual(['something-else', 'about-us']);
    expect(container.querySelector('a')!.textContent).toContain('https://example.test/parent/about-us');
    expect(document.activeElement).toBe(button('Edit'));
  });

  it('shows no Edit button when read-only', () => {
    render(urlSegment({ readOnly: true, data: { urlPrefix: 'https://example.test/', urlSuffix: '?stage=Stage' } }), unused);
    expect(container.querySelector('a')!.getAttribute('href')).toBe('https://example.test/about-us?stage=Stage');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows a suggest failure inline and stays in edit mode', async () => {
    const failure = Object.assign(new Error('The server answered 405'), {
      name: 'ServerRequestError',
      serverMessage: 'Please enter a URL segment or click cancel',
    });
    const request = vi.fn(() => Promise.reject(failure)) as unknown as JsonRequest;
    render(urlSegment(), request);
    await click(button('Edit'));
    type('');
    await click(button('OK'));

    const message = container.querySelector('#Form_EditForm_URLSegment_message');
    expect(message?.textContent).toBe('Please enter a URL segment or click cancel');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().getAttribute('aria-describedby')).toBe('Form_EditForm_URLSegment_help Form_EditForm_URLSegment_message');
    expect(document.activeElement).toBe(input());
  });

  it('decodes a multibyte segment for the preview and encodes the link', () => {
    render(urlSegment(), unused, '%E3%81%82');
    const link = container.querySelector('a')!;
    expect(link.textContent).toContain('https://example.test/parent/あ');
    expect(link.getAttribute('href')).toBe('https://example.test/parent/%E3%81%82?stage=Stage');
  });
});
