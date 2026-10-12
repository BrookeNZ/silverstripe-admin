/**
 * Grid state in the page URL and in the rows request.
 *
 * The page URL keeps each grid's state under its field name, so a reload, a shared link or Back
 * restores it and two grids on one form do not collide:
 * `?grid[<name>][sort]=-Title&grid[<name>][filter][q]=about&grid[<name>][page]=2`.
 * The rows request uses the endpoint's JSON:API-style names: `sort`, `filter[<name>]`, `page[number]`.
 */

export interface GridQuery {
  /** A column name, `-` prefixed for descending; null leaves the server's default order */
  sort: string | null;
  filter: Record<string, string>;
  page: number | null;
}

export const emptyGridQuery: GridQuery = { sort: null, filter: {}, page: null };

function prefix(name: string): string {
  return `grid[${name}]`;
}

export function readGridQuery(search: URLSearchParams, name: string): GridQuery {
  const key = prefix(name);
  const filterKey = `${key}[filter][`;
  const filter: Record<string, string> = {};
  search.forEach((value, param) => {
    if (param.startsWith(filterKey) && param.endsWith(']') && value !== '') {
      filter[param.slice(filterKey.length, -1)] = value;
    }
  });
  const page = Number(search.get(`${key}[page]`));
  return {
    sort: search.get(`${key}[sort]`) || null,
    filter,
    page: Number.isInteger(page) && page > 1 ? page : null,
  };
}

/** A copy of the page's search params with this grid's state replaced */
export function writeGridQuery(search: URLSearchParams, name: string, query: GridQuery): URLSearchParams {
  const key = prefix(name);
  const next = new URLSearchParams();
  search.forEach((value, param) => {
    if (!param.startsWith(`${key}[`)) {
      next.append(param, value);
    }
  });
  if (query.sort) {
    next.set(`${key}[sort]`, query.sort);
  }
  for (const [filterName, value] of Object.entries(query.filter)) {
    if (value !== '') {
      next.set(`${key}[filter][${filterName}]`, value);
    }
  }
  if (query.page && query.page > 1) {
    next.set(`${key}[page]`, String(query.page));
  }
  return next;
}

export function rowsParams(query: GridQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.sort) {
    params.set('sort', query.sort);
  }
  for (const [filterName, value] of Object.entries(query.filter)) {
    if (value !== '') {
      params.set(`filter[${filterName}]`, value);
    }
  }
  if (query.page) {
    params.set('page[number]', String(query.page));
  }
  return params;
}

export function withParams(url: string, params: URLSearchParams): string {
  const resolved = new URL(url, document.baseURI);
  params.forEach((value, param) => resolved.searchParams.set(param, value));
  return resolved.href;
}

export interface SortingEntry {
  id: string;
  desc: boolean;
}

export function toSorting(sort: string | null): Array<SortingEntry> {
  if (!sort) {
    return [];
  }
  return [{ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }];
}

export function fromSorting(sorting: ReadonlyArray<SortingEntry>): string | null {
  const first = sorting[0];
  return first ? `${first.desc ? '-' : ''}${first.id}` : null;
}
