/**
 * The Pages section: the page edit form, with the page tree (PagesSidebar.tsx) in the sidebar column the
 * shell draws when the section header names it. One route (`<prefix>/*`) renders the page, so the tree's
 * session stays open while the tail of the URL changes; the tail keeps the legacy shape
 * (`edit/show/<id>`) so CMSEditLink() and bookmarks still land here.
 *
 * A page has three views, as in legacy CMSMain: Content (`edit`), Settings (`settings`, the settings
 * controller's form, posted the same way) and History (`history`, a form whose only field is
 * versioned-admin's HistoryViewer, which the history pilet renders; headless, since it posts nothing).
 * A view whose controller the site lacks is left out of the header and its tail shows the empty state.
 *
 * The form is the shell's FormSchema renderer, fetched by name from the component registry. The page
 * edit form's state does not ask for change tracking (the legacy admin tracked every edit form), so the
 * section asks for it, and the shell's guard confirms before a tree selection navigates away. After a save
 * the section announces the page as a changed SiteTree record, which refetches the cached tree listing
 * showing its row; the shell matches classes by ancestry, so an event for a page's own class (a history
 * revert) reaches the listing too.
 *
 * With no page open the index draws the tree across the content area under the section header, with
 * no sidebar column, as legacy CMSMain's index did (PagesIndex.tsx); opening a page brings the column back.
 *
 * The section header carries the page title (from the tree, so a save that renames the page retitles
 * it, or the Title field's unsaved draft while the edit form has one), the page's ancestors as its breadcrumb and the page's views; the index has the section title and
 * no back button. A deep link shows the ancestors the tree has loaded and fills in as the tree loads.
 * It also carries the page's preview URL, read from the loaded form's navigator (the patterns package's previewLinks) for the stage the
 * Draft/Published toggle picks, so switching stage reloads the preview pane. The form draws the toggle in
 * split and preview modes only; the stage lives here, so it survives the toggle unmounting in edit mode.
 *
 * The page opens the session the sidebar reads (the tree store and the API clients) while it is mounted,
 * sets the open page as the shared `currentRecord`, and renders `TreeQueries`, the cached reads behind the
 * store, so the tree loads even while the sidebar is not drawn. Leaving the section and coming back starts
 * a new store over the same cache.
 */
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { FormField, FormSchemaResponse, PageComponentProps, SectionHeader } from '@silverstripe/admin-shell';
import { fieldTitle, navigatorField, previewLinks, Toggle } from '@silverstripe/admin-patterns';
import type { PreviewLinks } from '@silverstripe/admin-patterns';
import { createPageApi, createTreeApi } from './api';
import type { ChildrenResponse, TreeApi } from './api';
import { createMoveApi } from './move';
import { createPagesSessionHolder, createPagesSidebar, useStoreVersion } from './PagesSidebar';
import { PagesIndex } from './PagesIndex';
import { stageOptions } from './stage';
import type { PageStage } from './stage';
import { childPageKey, childPageRecords, TreeStore } from './treeStore';
import type { ChildPageKey, ChildPageRequest } from './treeStore';
import { currentPageDataKey } from './events';
import type { DraftTitleStore } from './draftTitle';

export interface PagesSectionOptions {
  routePrefix: string;
  /** The section's menu item code, which the sidebar is registered under */
  sectionCode: string;
  /** The section's menu title, drawn over the tree */
  sectionTitle: string;
  /** The base class tree keys, records-changed events and the shared current record name */
  pageClass: string;
  treeUrl: string;
  createUrl: string;
  moveUrl: string;
  loginUrl: string;
  /** The schema URL of each view's form, for the views whose controller the site has */
  schemaUrls: Partial<Record<PageView, (id: number) => string>>;
  draftTitle: DraftTitleStore;
}

export type PageView = 'edit' | 'settings' | 'history';

const viewTail = /^(edit|settings|history)\/show\/([1-9]\d*)\/?$/;

const pageViews: Array<{ view: PageView; label: string }> = [
  { view: 'edit', label: 'Content' },
  { view: 'settings', label: 'Settings' },
  { view: 'history', label: 'History' },
];

/** The view and page a route tail names, when the site has that view */
export function parsePageTail(tail: string, available: ReadonlyArray<PageView>): { view: PageView; id: number } | null {
  const match = viewTail.exec(tail);
  const id = match ? Number(match[2]) : 0;
  if (!match || !available.includes(match[1] as PageView) || !Number.isSafeInteger(id)) {
    return null;
  }
  return { view: match[1] as PageView, id };
}

export interface PageAncestor {
  id: number;
  title: string;
}

/** The page's ancestors the tree has loaded, root first; the chain stops at the first one it has not */
export function pageAncestors(store: Pick<TreeStore, 'node'>, id: number): Array<PageAncestor> {
  const ancestors: Array<PageAncestor> = [];
  for (let node = store.node(id); node?.parentId; ) {
    node = store.node(node.parentId);
    if (node) {
      ancestors.unshift({ id: node.id, title: node.title });
    }
  }
  return ancestors;
}

/** The header for a page view, or for the section index when no page is open */
export function pageSectionHeader(
  routePrefix: string,
  page: {
    id: number;
    title: string | undefined;
    view: PageView;
    ancestors?: ReadonlyArray<PageAncestor>;
    preview?: string;
  } | null,
  available: ReadonlyArray<PageView> = pageViews.map(({ view }) => view),
): SectionHeader {
  if (!page) {
    return { title: 'Pages' };
  }
  const crumbs = (page.ancestors ?? []).map(({ id, title }) => ({ label: title, to: `${routePrefix}/edit/show/${id}` }));
  return {
    title: page.title ?? `Page ${page.id}`,
    ...(crumbs.length > 0 ? { crumbs } : { backTo: `${routePrefix}/`, backLabel: 'Back to pages' }),
    views: pageViews.filter(({ view }) => available.includes(view)).map(({ view, label }) => ({
      key: view,
      label,
      to: `${routePrefix}/${view}/show/${page.id}`,
      current: view === page.view,
    })),
    ...(page.preview ? { preview: page.preview } : {}),
  };
}

// The preview pane and header modes replace it, as the legacy preview panel plucked it out of the form
const navigatorFields = [navigatorField];

/** The shape of the Pilet API's `useServerQuery` that the tree's reads use */
export type ChildPageQueryHook = (
  key: ChildPageKey,
  fetcher: (context: { signal: AbortSignal }) => Promise<ChildrenResponse>,
  options: { records: (data: ChildrenResponse) => ReadonlyArray<number> },
) => { status: 'pending' | 'error' | 'success'; data: ChildrenResponse | undefined; error: Error | null; isFetching: boolean };

interface TreeQueriesProps {
  store: TreeStore;
  api: TreeApi;
  useServerQuery: ChildPageQueryHook;
}

const ChildPageQuery = ({ store, api, useServerQuery, request }: TreeQueriesProps & { request: ChildPageRequest }) => {
  const { data, error, status, isFetching } = useServerQuery(
    childPageKey(request),
    ({ signal }) => api.children(request.parentId, request.page, request.limit, signal),
    { records: childPageRecords },
  );
  // A retry remounts on the cached error; it is reported once the new read settles
  const failed = status === 'error' && !isFetching;
  React.useEffect(() => {
    if (data !== undefined || failed) {
      store.receive(request, { data, error });
    }
  }, [store, request, data, error, failed]);
  return null;
};

/** Reads every page of children the store asks for through the server cache and hands it back */
export const TreeQueries = ({ store, api, useServerQuery }: TreeQueriesProps) => {
  const requests = React.useSyncExternalStore(store.subscribe, store.getRequests);
  return (
    <>
      {requests.map((request) => (
        <ChildPageQuery
          key={`${request.parentId}:${request.page}:${request.limit}:${request.attempt}`}
          store={store}
          api={api}
          useServerQuery={useServerQuery}
          request={request}
        />
      ))}
    </>
  );
};

export interface PagesSectionComponents {
  Page: React.ComponentType<PageComponentProps>;
  /** For `registerSectionSidebar` under `sectionCode` */
  Sidebar: ReturnType<typeof createPagesSidebar>;
}

export function createPagesSection(options: PagesSectionOptions): PagesSectionComponents {
  const editPath = (id: number) => `${options.routePrefix}/edit/show/${id}`;
  const availableViews = pageViews.map(({ view }) => view).filter((view) => options.schemaUrls[view]);
  const holder = createPagesSessionHolder();
  const sidebar = { title: options.sectionTitle, section: options.sectionCode };

  const PagesSection = ({ piral }: PageComponentProps) => {
    const api = React.useMemo(() => createTreeApi(options.treeUrl, piral.fetchJson), [piral]);
    const store = React.useMemo(
      () => new TreeStore(api, { invalidate: (ids) => piral.invalidateRecords(options.pageClass, ids) }),
      [api, piral],
    );
    const createClient = React.useMemo(() => createPageApi(options.createUrl, piral.fetchJson), [piral]);
    const moveClient = React.useMemo(() => createMoveApi(options.moveUrl, piral.fetchJson), [piral]);
    useStoreVersion(store);
    const tail = useParams()['*'] ?? '';
    const navigate = useNavigate();
    const [leaving, setLeaving] = React.useState(false);
    const unsaved = piral.useSharedState((state) => state.unsavedChanges);
    const draft = React.useSyncExternalStore(options.draftTitle.subscribe, options.draftTitle.get);
    const opened = parsePageTail(tail, availableViews);
    const currentId = opened?.id ?? null;
    const revealError = opened ? store.revealError(opened.id) : null;
    const [stage, setStage] = React.useState<PageStage>('draft');
    const [links, setLinks] = React.useState<PreviewLinks>({});
    const [shownTail, setShownTail] = React.useState(tail);
    const FormSchemaForm = React.useMemo(() => piral.getSilverstripeComponent('FormSchemaForm'), [piral]);
    const expandedItems = React.useRef<Array<string>>([]);
    const session = React.useMemo(
      () => ({ api, store, createClient, moveClient, expandedItems }),
      [api, store, createClient, moveClient],
    );

    // Layout effects, so the session is open with the current page before the header draws the sidebar
    React.useLayoutEffect(() => {
      holder.open(session);
      return () => holder.close(session);
    }, [session]);

    React.useLayoutEffect(
      () => (currentId === null ? undefined : piral.setCurrentRecord({ recordClass: options.pageClass, id: currentId })),
      [piral, currentId],
    );

    if (tail !== shownTail) {
      setShownTail(tail);
      setStage('draft');
      setLinks({});
    }

    const onStateChange = React.useCallback(
      (state: { fields: Array<{ name: string; value: unknown }> }) => setLinks(previewLinks(state.fields, window.location.href)),
      [],
    );

    // The HTML editor's link dialog reads it to list the open page's anchors
    React.useEffect(() => {
      piral.setData(currentPageDataKey, currentId);
    }, [piral, currentId]);

    const onSubmitted = React.useCallback(
      (response: FormSchemaResponse, action: FormField) => {
        piral.showNotification(response.message || `${fieldTitle(action)} succeeded`, { type: 'success' });
        if (currentId !== null) {
          piral.invalidateRecords(options.pageClass, [currentId]);
        }
        if (response.deleted) {
          setLeaving(true);
        }
      },
      [piral, currentId],
    );

    // Leaving unmounts the archived form, which clears its unsaved changes. The guard's blocker updates in
    // its own effect, so the navigation waits a tick past the commit that saw the changes cleared
    React.useEffect(() => {
      if (!leaving || unsaved) {
        return undefined;
      }
      const timer = window.setTimeout(() => {
        setLeaving(false);
        navigate(`${options.routePrefix}/`);
      });
      return () => window.clearTimeout(timer);
    }, [leaving, unsaved, navigate]);

    const header = pageSectionHeader(
      options.routePrefix,
      opened
        ? {
            id: opened.id,
            title: draft?.pageId === opened.id ? draft.title : store.node(opened.id)?.title,
            view: opened.view,
            ancestors: pageAncestors(store, opened.id),
            preview: links[stage],
          }
        : null,
      availableViews,
    );
    if (opened) {
      header.sidebar = sidebar;
    }
    const headerKey = JSON.stringify(header);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headerKey stands in for header, a new object every render
    React.useEffect(() => piral.setSectionHeader(header), [piral, headerKey]);

    let main: React.ReactNode;
    if (opened) {
      const schemaUrl = options.schemaUrls[opened.view]?.(opened.id) ?? '';
      main = (
        <>
          {revealError && !revealError.sessionExpired && (
            <p className="admin-error-text shell-page__inset" role="alert">
              This page could not be found in the tree: {revealError.message}
            </p>
          )}
          {opened.view === 'history' ? (
            <div className="shell-page__inset">
              <FormSchemaForm key={schemaUrl} schemaUrl={schemaUrl} headless />
            </div>
          ) : (
            !leaving && (
              <FormSchemaForm
                key={schemaUrl}
                schemaUrl={schemaUrl}
                onSubmitted={onSubmitted}
                onStateChange={onStateChange}
                omitFields={navigatorFields}
                trackUnsavedChanges
                previewControls={
                  <Toggle<PageStage>
                    label="Stage"
                    options={stageOptions(store.node(opened.id)?.statusFlags)}
                    value={stage}
                    onChange={setStage}
                  />
                }
              />
            )
          )}
        </>
      );
    } else {
      main = (
        <PagesIndex
          piral={piral}
          session={session}
          recordClass={options.pageClass}
          editPath={editPath}
          loginUrl={options.loginUrl}
          sectionTitle={options.sectionTitle}
        />
      );
    }

    return (
      <div className={opened ? 'pages' : 'pages pages--index'}>
        {main}
        <TreeQueries store={store} api={api} useServerQuery={piral.useServerQuery} />
      </div>
    );
  };
  PagesSection.displayName = 'PagesSection';

  return {
    Page: PagesSection,
    Sidebar: createPagesSidebar({ holder, recordClass: options.pageClass, editPath, loginUrl: options.loginUrl }),
  };
}

