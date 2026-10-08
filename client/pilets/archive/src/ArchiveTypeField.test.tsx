// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { archiveTypeUrl, createArchiveTypeField } from './ArchiveTypeField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FakeSelect = ({ field, onChange }: FieldComponentProps) => (
  <select aria-label={String(field.title)} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select…</option>
    <option value="NZTA\SiteBanner\Models\SiteBanner">Site banners</option>
  </select>
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (go: (url: string) => void, onChange = vi.fn()) => {
  const ArchiveTypeField = createArchiveTypeField(FakeSelect, go);
  const props = {
    field: { id: 'Form_EditForm_OtherDropdown', title: 'Select a content type', attributes: { 'data-others-archive-url': 'admin/archive/' } },
    value: '',
    onChange,
  } as unknown as FieldComponentProps;
  act(() => root.render(<ArchiveTypeField {...props} />));
  return container.querySelector('select') as HTMLSelectElement;
};

const choose = (select: HTMLSelectElement, value: string) =>
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

it('loads the chosen type as its model tab without changing the form value', () => {
  const go = vi.fn();
  const onChange = vi.fn();
  choose(render(go, onChange), 'NZTA\\SiteBanner\\Models\\SiteBanner');

  expect(go).toHaveBeenCalledWith(new URL('admin/archive/NZTA-SiteBanner-Models-SiteBanner/', document.baseURI).href);
  expect(onChange).not.toHaveBeenCalled();
});

it('stays put on the empty choice', () => {
  const go = vi.fn();
  choose(render(go), '');

  expect(go).not.toHaveBeenCalled();
});

it('joins the base URL with or without its trailing slash', () => {
  expect(archiveTypeUrl('admin/archive', 'A\\B')).toBe(archiveTypeUrl('admin/archive/', 'A\\B'));
});
