/**
 * The Pages section: the page tree beside the page edit form. One route (`<prefix>/*`) renders it, so
 * the tree stays mounted while the tail of the URL changes; the tail keeps the legacy shape
 * (`edit/show/<id>`) so CMSEditLink() and bookmarks still land here.
 *
 * The form is the shell's FormSchema renderer, fetched by name from the component registry. The page
 * edit form's state does not ask for change tracking (the legacy admin tracked every edit form), so the
 * section asks for it, and the shell's guard confirms before a tree selection navigates away. After a save
 * the section emits the records-changed event, and the tree re-reads the saved page's row.
 *
 * The section header carries the page title (from the tree, so a save that renames the page retitles
 * it) and the page's views; the index has the section title and no back button.
 */
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PageComponentProps, SectionHeader } from '@silverstripe/admin-shell';
import { fieldTitle } from '@silverstripe/admin-patterns';
import { ApiError, createTreeApi } from './api';
import { PageSearch } from './PageSearch';
import { PageTree } from './PageTree';
import { TreeStore } from './treeStore';
import { currentPageDataKey, recordsChangedEvent } from './events';
import type { RecordsChangedEvent } from './events';

export interface PagesSectionOptions {
  routePrefix: string;
  pageClass: string;
  treeUrl: string;
  loginUrl: string;
  schemaUrl(id: number): string;
}

const editTail = /^edit\/show\/(\d+)\/?$/;
const otherViewTail = /^(settings|history)\/show\/(\d+)\/?$/;

export type PageView = 'edit' | 'settings' | 'history';

const pageViews: Array<{ view: PageView; label: string }> = [
  { view: 'edit', label: 'Content' },
  { view: 'settings', label: 'Settings' },
  { view: 'history', label: 'History' },
];

/** The header for a page view, or for the section index when no page is open */
export function pageSectionHeader(
  routePrefix: string,
  page: { id: number; title: string | undefined; view: PageView } | null,
): SectionHeader {
  if (!page) {
    return { title: 'Pages' };
  }
  return {
    title: page.title ?? `Page ${page.id}`,
    backTo: `${routePrefix}/`,
    backLabel: 'Back to Pages',
    views: pageViews.map(({ view, label }) => ({
      key: view,
      label,
      to: `${routePrefix}/${view}/show/${page.id}`,
      current: view === page.view,
    })),
  };
}

function useStoreVersion(store: TreeStore): number {
  return React.useSyncExternalStore(store.subscribe, store.getVersion);
}

const SessionExpired = ({ loginUrl }: { loginUrl: string }) => (
  <p className="pages__alert" role="alert">
    Your CMS session has expired: <a href={loginUrl}>log in again</a>.
  </p>
);

const Breadcrumbs = ({ store, id, editPath }: { store: TreeStore; id: number; editPath(id: number): string }) => {
  const trail = [];
  for (let node = store.node(id); node; node = node.parentId ? store.node(node.parentId) : undefined) {
    trail.unshift(node);
  }
  if (trail.length < 2) {
    return null;
  }
  return (
    <nav className="pages__breadcrumbs" aria-label="Breadcrumb">
      <ol className="pages__breadcrumb-list">
        {trail.map((node, index) => (
          <li className="pages__breadcrumb" key={node.id}>
            {index === trail.length - 1 ? (
              <span aria-current="page">{node.title}</span>
            ) : (
              <Link to={editPath(node.id)}>{node.title}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export function createPagesSection(options: PagesSectionOptions): React.ComponentType<PageComponentProps> {
  const editPath = (id: number) => `${options.routePrefix}/edit/show/${id}`;

  const PagesSection = ({ piral }: PageComponentProps) => {
    const api = React.useMemo(() => createTreeApi(options.treeUrl), []);
    const store = React.useMemo(() => new TreeStore(api), [api]);
    useStoreVersion(store);
    const navigate = useNavigate();
    const tail = useParams()['*'] ?? '';
    const editMatch = editTail.exec(tail);
    const otherView = otherViewTail.exec(tail);
    const currentId = editMatch ? Number(editMatch[1]) : null;
    const [query, setQuery] = React.useState('');
    const [revealError, setRevealError] = React.useState<ApiError | null>(null);
    const FormSchemaForm = React.useMemo(() => piral.getSilverstripeComponent('FormSchemaForm'), [piral]);

    React.useEffect(() => {
      setQuery('');
      setRevealError(null);
    }, [tail]);

    React.useEffect(() => {
      piral.setData(currentPageDataKey, currentId);
    }, [piral, currentId]);

    React.useEffect(() => {
      const refresh = ({ recordClass, ids }: RecordsChangedEvent) => {
        if (recordClass === options.pageClass) {
          for (const id of ids) {
            store.refresh(id).catch(() => undefined);
          }
        }
      };
      piral.on(recordsChangedEvent, refresh);
      return () => {
        piral.off(recordsChangedEvent, refresh);
      };
    }, [piral, store]);

    const onSubmitted = React.useCallback(
      (_response: unknown, action: Parameters<typeof fieldTitle>[0]) => {
        piral.showNotification(`${fieldTitle(action)} succeeded`, { type: 'success' });
        if (currentId !== null) {
          const event: RecordsChangedEvent = { recordClass: options.pageClass, ids: [currentId] };
          piral.emit(recordsChangedEvent, event);
        }
      },
      [piral, currentId],
    );

    const viewId = currentId ?? (otherView ? Number(otherView[2]) : null);
    const header = pageSectionHeader(
      options.routePrefix,
      viewId === null
        ? null
        : { id: viewId, title: store.node(viewId)?.title, view: otherView ? (otherView[1] as PageView) : 'edit' },
    );
    const headerKey = JSON.stringify(header);
    React.useEffect(() => piral.setSectionHeader(header), [piral, headerKey]);
    const searching = query.trim().length > 0;
    const sessionExpired = store.sessionExpired || Boolean(revealError?.sessionExpired);

    let main: React.ReactNode;
    if (currentId !== null) {
      main = (
        <>
          <Breadcrumbs store={store} id={currentId} editPath={editPath} />
          {revealError && !revealError.sessionExpired && (
            <p className="pages__alert" role="alert">
              This page could not be found in the tree: {revealError.message}
            </p>
          )}
          <FormSchemaForm schemaUrl={options.schemaUrl(currentId)} onSubmitted={onSubmitted} trackUnsavedChanges />
        </>
      );
    } else if (otherView) {
      main = (
        <p>
          The page {otherView[1]} view is not in the shell yet; it still belongs to the legacy admin.{' '}
          <Link to={editPath(Number(otherView[2]))}>Edit the page content instead</Link>.
        </p>
      );
    } else {
      main = (
        <p className="pages__empty">Select a page in the tree to edit it.</p>
      );
    }

    return (
      <div className="pages">
        <nav className="pages__sidebar" aria-label="Page tree">
          <PageSearch api={api} editPath={editPath} query={query} onQueryChange={setQuery} />
          {sessionExpired && <SessionExpired loginUrl={options.loginUrl} />}
          <PageTree
            store={store}
            currentId={currentId}
            hidden={searching}
            onSelect={(id) => navigate(editPath(id))}
            onRevealError={(error) =>
              setRevealError(error instanceof ApiError ? error : new ApiError(String(error), 0, 'network'))
            }
          />
        </nav>
        <div className="pages__main">{main}</div>
      </div>
    );
  };
  PagesSection.displayName = 'PagesSection';
  return PagesSection;
}

