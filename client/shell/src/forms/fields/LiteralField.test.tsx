// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { FieldComponentProps } from '../types';
import { LiteralField } from './LiteralField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LiteralField', () => {
  it('strips scripts and inline handlers from its HTML and keeps its links', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const props = {
      field: { id: 'Form_EditForm_Note', name: 'Note' },
      value: '<p>Hi <img src="x" onerror="alert(1)"><a href="/admin/pages/">Pages</a></p><script>alert(2)</script>',
    } as unknown as FieldComponentProps;

    act(() => root.render(<LiteralField {...props} />));

    const literal = container.querySelector('#Form_EditForm_Note')!;
    expect(literal.querySelector('script')).toBeNull();
    expect(literal.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(literal.querySelector('a')?.getAttribute('href')).toBe('/admin/pages/');
    act(() => root.unmount());
  });
});
