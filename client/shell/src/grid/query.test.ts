// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fromSorting, readGridQuery, rowsParams, toSorting, writeGridQuery } from './query';

describe('grid query', () => {
  it('round-trips a grid state through the page URL without touching other params or grids', () => {
    const page = new URLSearchParams('tab=main&grid[Other][sort]=Title&grid[Teams][page]=9');
    const written = writeGridQuery(page, 'Teams', { sort: '-Name', filter: { q: 'alp', City: '' }, page: 2 });

    expect(written.get('tab')).toBe('main');
    expect(written.get('grid[Other][sort]')).toBe('Title');
    expect(written.get('grid[Teams][sort]')).toBe('-Name');
    expect(written.get('grid[Teams][filter][q]')).toBe('alp');
    expect(written.has('grid[Teams][filter][City]')).toBe(false);
    expect(readGridQuery(written, 'Teams')).toEqual({ sort: '-Name', filter: { q: 'alp' }, page: 2 });
    expect(readGridQuery(written, 'Other')).toEqual({ sort: 'Title', filter: {}, page: null });
  });

  it('drops page 1 and invalid pages so the default state leaves no params', () => {
    const written = writeGridQuery(new URLSearchParams(), 'Teams', { sort: null, filter: {}, page: 1 });
    expect(written.toString()).toBe('');
    expect(readGridQuery(new URLSearchParams('grid[Teams][page]=x'), 'Teams').page).toBeNull();
  });

  it('serialises to the endpoint parameters', () => {
    const params = rowsParams({ sort: '-LinkTo.Title', filter: { q: 'a b' }, page: 3 });
    expect(params.get('sort')).toBe('-LinkTo.Title');
    expect(params.get('filter[q]')).toBe('a b');
    expect(params.get('page[number]')).toBe('3');
    expect(rowsParams({ sort: null, filter: {}, page: null }).toString()).toBe('');
  });

  it('maps a sort string to TanStack sorting state and back', () => {
    expect(toSorting('-Name')).toEqual([{ id: 'Name', desc: true }]);
    expect(toSorting(null)).toEqual([]);
    expect(fromSorting([{ id: 'Name', desc: false }])).toBe('Name');
    expect(fromSorting([])).toBeNull();
  });
});
