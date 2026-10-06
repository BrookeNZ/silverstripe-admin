// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { prepareGridHtml, resolveCell } from './cells';
import type { GridColumn } from './types';

const column: GridColumn = { name: 'Title', title: 'Title', sortable: true, actions: false, cell: { component: 'GridField.cell.Badge', props: {} } };

describe('resolveCell', () => {
  it('renders server HTML whatever the column declares', () => {
    expect(resolveCell({ html: '<b>x</b>' }, column, () => true)).toEqual({ kind: 'html', html: '<b>x</b>' });
  });

  it('uses the declared component when a pilet registered it, else falls back to the value as text', () => {
    expect(resolveCell({ value: 3 }, column, (name) => name === 'GridField.cell.Badge')).toEqual({ kind: 'component', name: 'GridField.cell.Badge', value: 3 });
    expect(resolveCell({ value: 3 }, column, () => false)).toEqual({ kind: 'text', text: '3' });
    expect(resolveCell({ value: null }, { ...column, cell: null }, () => true)).toEqual({ kind: 'text', text: '' });
    expect(resolveCell(undefined, column, () => true)).toEqual({ kind: 'empty' });
  });
});

describe('prepareGridHtml', () => {
  it('drops handlers and links and disables controls that would submit the CMS form', () => {
    const body = prepareGridHtml('<a href="/admin/x" onclick="go()">x</a><button name="action_archive">Archive</button>');

    expect(body.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(body.querySelector('a')?.hasAttribute('onclick')).toBe(false);
    expect(body.querySelector('button')?.hasAttribute('disabled')).toBe(true);
    expect(body.querySelector('button')?.getAttribute('type')).toBe('button');
  });
});
