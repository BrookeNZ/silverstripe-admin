/**
 * Search above the tree: after two characters and a pause it asks the search endpoint and lists the
 * matches flat, each a link to the page's edit route. Following a link (or clearing the field) returns
 * to the tree, which stays mounted underneath so its open nodes survive. With `onClose` the field is
 * a disclosure the sidebar's header button opened: it takes focus when drawn and Escape closes it.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { PiletApi } from '@silverstripe/admin-shell';
import type { TreeApi } from './api';

export interface PageSearchProps {
  /** The id the opening button's aria-controls names */
  id?: string;
  api: TreeApi;
  useServerQuery: PiletApi['useServerQuery'];
  /** The page class, whose records-changed events re-run the search */
  recordClass: string;
  editPath: (id: number) => string;
  query: string;
  onQueryChange: (query: string) => void;
  minLength?: number;
  onClose?: () => void;
}

const debounceMs = 300;

const inputId = 'pages-search-input';

export const PageSearch = ({ id, api, useServerQuery, recordClass, editPath, query, onQueryChange, minLength = 2, onClose }: PageSearchProps) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const term = query.trim();
  const [searchedTerm, setSearchedTerm] = React.useState(term);
  const opened = Boolean(onClose);
  const active = term.length >= minLength;
  const search = useServerQuery(
    [recordClass, 'search', searchedTerm],
    ({ signal }) => api.search(searchedTerm, signal),
    { enabled: searchedTerm.length >= minLength },
  );
  const response = search.status === 'success' ? search.data : undefined;

  React.useEffect(() => {
    if (opened) {
      inputRef.current?.focus();
    }
  }, [opened]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearchedTerm(term), debounceMs);
    return () => window.clearTimeout(timer);
  }, [term]);

  let status = '';
  if (term.length > 0 && !active) {
    status = `Type at least ${minLength} characters to search`;
  } else if (active && search.isFetching && !response) {
    status = 'Searching…';
  } else if (active && response) {
    const { totalCount: total } = response.pageInfo;
    const shown = response.items.length;
    status = total === 0 ? 'No pages found' : `${total} ${total === 1 ? 'page' : 'pages'} found${shown < total ? `, showing ${shown}` : ''}`;
  }

  const error = active && search.status === 'error' ? search.error?.message : undefined;

  return (
    <div className="pages-search" id={id}>
      <FieldHolder
        field={{ id: inputId, title: 'Search pages' }}
        labelFor={inputId}
        error={error}
      >
        <input
          ref={inputRef}
          className="admin-field__control"
          id={inputId}
          type="search"
          autoComplete="off"
          aria-describedby={error ? `${inputId}_status ${inputId}_message` : `${inputId}_status`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') {
              return;
            }
            if (onClose) {
              event.preventDefault();
              onClose();
            } else if (query) {
              event.preventDefault();
              onQueryChange('');
            }
          }}
        />
      </FieldHolder>
      <p className="pages-search__status" id={`${inputId}_status`} role="status">
        {status}
      </p>
      {active && response && response.items.length > 0 && (
        <ul className="pages-search__results" aria-label="Search results">
          {response.items.map((item) => (
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
