// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { SingleSelectField } from './inputs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SingleSelectField', () => {
  it('marks its select so it takes the dropdown look', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <SingleSelectField
          field={{ id: 'Form_Colour', name: 'Colour', title: 'Colour', readOnly: false, disabled: true, source: [{ value: 'r', title: 'Red' }], children: [] }}
          value="r"
          onChange={() => {}}
          onBlur={() => {}}
          submitting={false}
          renderFields={() => null}
        />,
      ),
    );
    const select = container.querySelector('select');
    expect(select?.classList.contains('admin-field__control--select')).toBe(true);
    expect(select?.disabled).toBe(true);
    act(() => root.unmount());
  });
});
