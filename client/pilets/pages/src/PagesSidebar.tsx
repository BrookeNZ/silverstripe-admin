/**
 * The page tree column: the page search, the toolbar with "Add new" and the tree (`PagesTreePane`), drawn
 * by the shell in the sidebar column its layout puts beside the section header and the page edit form
 * (registered with `registerSectionSidebar`). The section index draws the same pane across its content
 * area (PagesIndex.tsx). The search shows while the shell's header search button has it open, and
 * closing it clears the query; a shell that passes no `searchOpen` gets the field always shown. It lives
 * outside the section's route, so it shares the tree with the page through a session the page opens while
 * it is mounted: the tree store (a selector over the cached tree pages, whose reads the page drives) and
 * the API clients. The open page comes from the shared `currentRecord`. Without an open session it draws
 * nothing.
 *
 * Tree clicks are router navigations, so the shell's unsaved-changes guard still confirms before one
 * leaves an edited form. The search clears whenever the route changes, as it did beside the page.
 */
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PiletApi } from '@silverstripe/admin-shell';
import { AddPageDialog } from './AddPageDialog';
import { addPage } from './addPage';
import type { CreatePageApi, TreeApi } from './api';
import type { MoveApi } from './move';
import { PageSearch } from './PageSearch';
import { PageTree } from './PageTree';
import type { PageTreeExpansion } from './PageTree';
import { TreeToolbar } from './TreeToolbar';
import type { TreeStore } from './treeStore';

export interface PagesSession {
  api: TreeApi;
  store: TreeStore;
  createClient: CreatePageApi;
  moveClient: MoveApi;
  /** The tree's open nodes, kept across the index and sidebar trees */
  expandedItems: PageTreeExpansion;
}

export interface PagesSessionHolder {
  get: () => PagesSession | null;
  open: (session: PagesSession) => void;
  close: (session: PagesSession) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPagesSessionHolder(): PagesSessionHolder {
  let session: PagesSession | null = null;
  const listeners = new Set<() => void>();
  const replace = (next: PagesSession | null) => {
    session = next;
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    get: () => session,
    open: (opened) => replace(opened),
    // A page unmounting after the next one opened its session leaves that session alone
    close: (closed) => {
      if (session?.store === closed.store) {
        replace(null);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function usePagesSession(holder: PagesSessionHolder): PagesSession | null {
  return React.useSyncExternalStore(holder.subscribe, holder.get);
}

export function useStoreVersion(store: TreeStore | undefined): number {
  return React.useSyncExternalStore(
    React.useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => undefined), [store]),
    () => store?.getVersion() ?? 0,
  );
}

/** Mirrors SectionSidebarSlotProps in the shell's header/SectionSidebar.tsx */
export interface PagesSidebarSlotProps {
  titleId?: string;
  searchId?: string;
  searchOpen?: boolean;
  closeSearch?: () => void;
}

export interface PagesSidebarOptions {
  holder: PagesSessionHolder;
  /** The class the section sets the shared `currentRecord` with */
  recordClass: string;
  editPath: (id: number) => string;
  loginUrl: string;
}

const SessionExpired = ({ loginUrl }: { loginUrl: string }) => (
  <p className="admin-error-text pages-sidebar__alert" role="alert">
    Your CMS session has expired: <a href={loginUrl}>log in again</a>.
  </p>
);

export interface PagesTreePaneProps extends PagesSidebarSlotProps {
  piral: Pick<PiletApi, 'showNotification' | 'useSharedState' | 'useServerQuery'>;
  session: PagesSession;
  recordClass: string;
  editPath: (id: number) => string;
  loginUrl: string;
  /** Drawn at the end of the toolbar row */
  toolbarEnd?: React.ReactNode;
  /** Fills the section index rather than the sidebar column */
  fill?: boolean;
}

/** The search, toolbar and tree, in the sidebar column or filling the section index */
export const PagesTreePane = ({
  piral,
  session,
  recordClass,
  editPath,
  loginUrl,
  titleId,
  searchId,
  searchOpen,
  closeSearch,
  toolbarEnd,
  fill = false,
}: PagesTreePaneProps) => {
  const { api, store, createClient, moveClient, expandedItems } = session;
  useStoreVersion(store);
  const record = piral.useSharedState((state) => state.currentRecord);
  const currentId = record?.recordClass === recordClass ? record.id : null;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const showSearch = searchOpen ?? true;

  // A route change or the shell closing the search clears the query
  const searchPlace = `${String(showSearch)} ${pathname}`;
  const [shownSearchPlace, setShownSearchPlace] = React.useState(searchPlace);
  if (searchPlace !== shownSearchPlace) {
    setShownSearchPlace(searchPlace);
    setQuery('');
  }

  const closeAdd = () => {
    setAdding(false);
    setCreateError(null);
  };
  const create = (className: string) => {
    setCreating(true);
    setCreateError(null);
    addPage(
      {
        client: createClient,
        store,
        land: (page) => {
          setAdding(false);
          piral.showNotification(`Created "${page.title}"`, { type: 'success' });
          navigate(editPath(page.id));
        },
      },
      currentId ?? 0,
      className,
    )
      .catch((failure: unknown) => setCreateError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setCreating(false));
  };

  return (
    <>
      <nav
        className={fill ? 'pages-sidebar pages-sidebar--index' : 'pages-sidebar'}
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : 'Page tree'}
      >
        {showSearch && (
          <PageSearch
            id={searchId}
            api={api}
            useServerQuery={piral.useServerQuery}
            recordClass={recordClass}
            editPath={editPath}
            query={query}
            onQueryChange={setQuery}
            onClose={closeSearch}
          />
        )}
        <TreeToolbar onAdd={() => setAdding(true)} end={toolbarEnd} />
        {store.sessionExpired && <SessionExpired loginUrl={loginUrl} />}
        <PageTree
          store={store}
          currentId={currentId}
          hidden={query.trim().length > 0}
          onSelect={(id) => navigate(editPath(id))}
          mover={{ client: moveClient, notify: (message, type) => piral.showNotification(message, { type }) }}
          expansion={expandedItems}
        />
      </nav>
      <AddPageDialog
        open={adding}
        parentId={currentId ?? 0}
        client={createClient}
        creating={creating}
        error={createError}
        onCreate={create}
        onClose={closeAdd}
      />
    </>
  );
};

export function createPagesSidebar({ holder, recordClass, editPath, loginUrl }: PagesSidebarOptions) {
  const PagesSidebar = ({
    piral,
    ...slot
  }: PagesSidebarSlotProps & { piral: PagesTreePaneProps['piral'] }) => {
    const session = usePagesSession(holder);
    return session ? (
      <PagesTreePane piral={piral} session={session} recordClass={recordClass} editPath={editPath} loginUrl={loginUrl} {...slot} />
    ) : null;
  };
  PagesSidebar.displayName = 'PagesSidebar';
  return PagesSidebar;
}
