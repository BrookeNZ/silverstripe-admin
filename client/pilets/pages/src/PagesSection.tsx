/**
 * The Pages section: the page tree beside the page edit form. One route (`<prefix>/*`) renders it, so
 * the tree stays mounted while the tail of the URL changes; the tail keeps the legacy shape
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
 * the section emits the records-changed event, and the tree re-reads the saved page's row, or moves it
 * when the save changed its parent.
 *
 * The section header carries the page title (from the tree, so a save that renames the page retitles
 * it), the page's ancestors as its breadcrumb and the page's views; the index has the section title and
 * no back button. A deep link shows the ancestors the tree has loaded and fills in as the tree loads.
 * It also carries the page's preview URL, read from the loaded form (see preview.ts) for the stage the
 * Draft/Published toggle picks, so switching stage reloads the preview pane.
 *
 * "Add page" above the tree creates a page under the open page, or at the top level from the index, through
 * PageCreateController, then re-reads the parent's children and lands on the new page's edit route.
 */
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PageComponentProps, SectionHeader } from '@silverstripe/admin-shell';
import { AddIcon, Button, fieldTitle, Toggle } from '@silverstripe/admin-patterns';
import { AddPageDialog } from './AddPageDialog';
import { addPage } from './addPage';
import { ApiError, createPageApi, createTreeApi } from './api';
import { PageSearch } from './PageSearch';
import { PageTree } from './PageTree';
import { previewLinks } from './preview';
import type { PreviewLinks } from './preview';
import { stageOptions } from './stage';
import type { PageStage } from './stage';
import { TreeStore } from './treeStore';
import { currentPageDataKey, recordsChangedEvent } from './events';
import type { RecordsChangedEvent } from './events';

export interface PagesSectionOptions {
  routePrefix: string;
  pageClass: string;
  treeUrl: string;
  createUrl: string;
  securityId(): string;
  loginUrl: string;
  /** The schema URL of each view's form, for the views whose controller the site has */
  schemaUrls: Partial<Record<PageView, (id: number) => string>>;
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

function useStoreVersion(store: TreeStore): number {
  return React.useSyncExternalStore(store.subscribe, store.getVersion);
}

// The preview pane and header modes replace it, as the legacy preview panel plucked it out of the form
const navigatorFields = ['SilverStripeNavigator'];

const SessionExpired = ({ loginUrl }: { loginUrl: string }) => (
  <p className="pages__alert" role="alert">
    Your CMS session has expired: <a href={loginUrl}>log in again</a>.
  </p>
);

export function createPagesSection(options: PagesSectionOptions): React.ComponentType<PageComponentProps> {
  const editPath = (id: number) => `${options.routePrefix}/edit/show/${id}`;
  const availableViews = pageViews.map(({ view }) => view).filter((view) => options.schemaUrls[view]);

  const PagesSection = ({ piral }: PageComponentProps) => {
    const api = React.useMemo(() => createTreeApi(options.treeUrl), []);
    const store = React.useMemo(() => new TreeStore(api), [api]);
    const createClient = React.useMemo(() => createPageApi(options.createUrl, options.securityId), []);
    useStoreVersion(store);
    const navigate = useNavigate();
    const tail = useParams()['*'] ?? '';
    const opened = parsePageTail(tail, availableViews);
    const currentId = opened?.id ?? null;
    const [query, setQuery] = React.useState('');
    const [revealError, setRevealError] = React.useState<ApiError | null>(null);
    const [stage, setStage] = React.useState<PageStage>('draft');
    const [links, setLinks] = React.useState<PreviewLinks>({});
    const [adding, setAdding] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [createError, setCreateError] = React.useState<string | null>(null);
    const FormSchemaForm = React.useMemo(() => piral.getSilverstripeComponent('FormSchemaForm'), [piral]);

    React.useEffect(() => {
      setQuery('');
      setRevealError(null);
      setStage('draft');
      setLinks({});
    }, [tail]);

    const onStateChange = React.useCallback(
      (state: { fields: Array<{ name: string; value: unknown }> }) => setLinks(previewLinks(state.fields, window.location.href)),
      [],
    );

    React.useEffect(() => {
      piral.setData(currentPageDataKey, currentId);
    }, [piral, currentId]);

    React.useEffect(() => {
      const refresh = ({ recordClass, ids }: RecordsChangedEvent) => {
        if (recordClass === options.pageClass || ids.some((id) => store.node(id)?.className === recordClass)) {
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

    const header = pageSectionHeader(
      options.routePrefix,
      opened
        ? {
            id: opened.id,
            title: store.node(opened.id)?.title,
            view: opened.view,
            ancestors: pageAncestors(store, opened.id),
            preview: links[stage],
          }
        : null,
      availableViews,
    );
    const headerKey = JSON.stringify(header);
    React.useEffect(() => piral.setSectionHeader(header), [piral, headerKey]);
    const searching = query.trim().length > 0;
    const sessionExpired = store.sessionExpired || Boolean(revealError?.sessionExpired);

    let main: React.ReactNode;
    if (opened) {
      const schemaUrl = options.schemaUrls[opened.view]?.(opened.id) ?? '';
      main = (
        <>
          {revealError && !revealError.sessionExpired && (
            <p className="pages__alert pages__inset" role="alert">
              This page could not be found in the tree: {revealError.message}
            </p>
          )}
          {opened.view === 'history' ? (
            <div className="pages__inset">
              <FormSchemaForm key={schemaUrl} schemaUrl={schemaUrl} headless />
            </div>
          ) : (
            <FormSchemaForm
              key={schemaUrl}
              schemaUrl={schemaUrl}
              onSubmitted={onSubmitted}
              onStateChange={onStateChange}
              omitFields={navigatorFields}
              trackUnsavedChanges
              actionsEnd={
                <Toggle<PageStage>
                  label="Stage"
                  options={stageOptions(store.node(opened.id)?.statusFlags)}
                  value={stage}
                  onChange={setStage}
                />
              }
            />
          )}
        </>
      );
    } else {
      main = (
        <p className="pages__empty pages__inset">Select a page in the tree to edit it.</p>
      );
    }

    return (
      <div className="pages">
        <nav className="pages__sidebar" aria-label="Page tree">
          <Button icon={<AddIcon />} onClick={() => setAdding(true)}>
            Add page
          </Button>
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
        <AddPageDialog
          open={adding}
          parentId={currentId ?? 0}
          client={createClient}
          creating={creating}
          error={createError}
          onCreate={create}
          onClose={closeAdd}
        />
      </div>
    );
  };
  PagesSection.displayName = 'PagesSection';
  return PagesSection;
}

