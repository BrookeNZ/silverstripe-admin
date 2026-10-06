/**
 * Search above the tree: after two characters and a pause it asks the search endpoint and lists the
 * matches flat, each a link to the page's edit route. Following a link (or clearing the field) returns
 * to the tree, which stays mounted underneath so its open nodes survive.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { FieldHolder } from '@silverstripe/admin-patterns';
import { ApiError } from './api';
import type { SearchResponse, TreeApi } from './api';

export interface PageSearchProps {
  api: TreeApi;
  editPath(id: number): string;
  query: string;
  onQueryChange(query: string): void;
  minLength?: number;
}

const debounceMs = 300;

const inputId = 'pages-search-input';

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; response: SearchResponse }
  | { status: 'failed'; error: ApiError };

export const PageSearch = ({ api, editPath, query, onQueryChange, minLength = 2 }: PageSearchProps) => {
  const [state, setState] = React.useState<SearchState>({ status: 'idle' });
  const term = query.trim();

  React.useEffect(() => {
    if (term.length < minLength) {
      setState({ status: 'idle' });
      return undefined;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ status: 'searching' });
      api
        .search(term, abort.signal)
        .then((response) => setState({ status: 'done', response }))
        .catch((error: unknown) => {
          if (!abort.signal.aborted) {
            setState({
              status: 'failed',
              error: error instanceof ApiError ? error : new ApiError(String(error), 0, 'network'),
            });
          }
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [api, term, minLength]);

  let status = '';
  if (term.length > 0 && term.length < minLength) {
    status = `Type at least ${minLength} characters to search`;
  } else if (state.status === 'searching') {
    status = 'Searching…';
  } else if (state.status === 'done') {
    const { totalCount: total } = state.response.pageInfo;
    const shown = state.response.items.length;
    status = total === 0 ? 'No pages found' : `${total} ${total === 1 ? 'page' : 'pages'} found${shown < total ? `, showing ${shown}` : ''}`;
  }

  const error = state.status === 'failed' ? state.error.message : undefined;

  return (
    <div className="pages-search">
      <FieldHolder
        field={{ id: inputId, title: 'Search pages' }}
        labelFor={inputId}
        error={error}
      >
        <input
          className="admin-field__control"
          id={inputId}
          type="search"
          autoComplete="off"
          aria-describedby={error ? `${inputId}_status ${inputId}_message` : `${inputId}_status`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              onQueryChange('');
            }
          }}
        />
      </FieldHolder>
      <p className="pages-search__status" id={`${inputId}_status`} role="status">
        {status}
      </p>
      {term.length >= minLength && state.status === 'done' && state.response.items.length > 0 && (
        <ul className="pages-search__results" aria-label="Search results">
          {state.response.items.map((item) => (
            <li className="pages-search__result" key={item.id}>
              <Link className="pages-search__link" to={editPath(item.id)}>
                {item.title}
              </Link>
              {item.statusFlags.map((flag) => (
                <React.Fragment key={flag.key}>
                  {' '}
                  <span className="pages-search__flag" title={flag.title ?? undefined}>
                    {flag.text}
                  </span>
                </React.Fragment>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
