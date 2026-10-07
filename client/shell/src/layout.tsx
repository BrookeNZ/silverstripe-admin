import * as React from 'react';
import { Link, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import { ComponentsState, ErrorComponentsState, SwitchErrorInfo } from 'piral-core';
import { Notifications } from 'piral-notifications';
import { Button, CloseIcon, MenuIcon, Link as TextLink } from '@silverstripe/admin-patterns';
import { LiveAnnouncer } from './announcer';
import { SectionHeaderBar } from './header/SectionHeader';
import { useSectionHeader } from './header/state';
import { usePreviewMode } from './preview/mode';
import { PreviewPane } from './preview/PreviewPane';
import { useMenuCollapsed } from './menu/collapse';
import { Menu } from './menu/Menu';
import { routerLink } from './routing';
import type { SilverstripeMenuItem } from './silverstripe';
import { NotificationsHost, NotificationsToast } from './notifications';
import { UnsavedChangesGuard } from './unsaved';

const RouterChildren = React.createContext<React.ReactNode>(null);

const Splat = () => <>{React.useContext(RouterChildren)}</>;

/**
 * A data router (createBrowserRouter) rather than <BrowserRouter>, so useBlocker and other data APIs
 * work for the unsaved-changes guard. Piral hands the app tree in as children; a context carries it into
 * the single splat route so re-renders propagate.
 */
export function createRouter(basename: string): ComponentsState['Router'] {
  const router = createBrowserRouter([{ path: '*', Component: Splat }], { basename });
  const Router: ComponentsState['Router'] = ({ children }) => (
    <RouterChildren.Provider value={children}>
      <RouterProvider router={router} />
    </RouterChildren.Provider>
  );
  Router.displayName = 'ShellRouter';
  return Router;
}

export function readMenu(root: HTMLElement | null): Array<SilverstripeMenuItem> {
  try {
    return JSON.parse(root?.dataset.menu ?? '[]');
  } catch {
    return [];
  }
}

/** `owned` when a pilet registers pages in the section but none for this path */
export const SectionWithoutPilet = ({ owned = false }: { owned?: boolean }) => {
  const section = useLocation().pathname.split('/').filter(Boolean)[0] ?? '';
  return (
    <div className="shell-page">
      <div className="shell-page__inset">
        {owned ? (
          <>
            <h1 className="shell-page__title">Nothing is registered for this page yet</h1>
            <p>
              A pilet owns /{section}, but none of its pages matches this address. Turn the shell flag off to
              use the legacy admin here.
            </p>
          </>
        ) : (
          <>
            <h1 className="shell-page__title">No pilet owns “{section}” yet</h1>
            <p>
              This section still belongs to the legacy admin. Turn the shell flag off to use it, or ship a pilet
              that registers pages under /{section}.
            </p>
          </>
        )}
        {section === 'assets' && (
          <p>
            The file edit form already renders in the shell:{' '}
            <TextLink href="/assets/edit/2" renderLink={routerLink}>edit file 2</TextLink>.
          </p>
        )}
        <p>
          <TextLink href="/" renderLink={routerLink}>Shell home</TextLink>
        </p>
      </div>
    </div>
  );
};

export const errors: Partial<ErrorComponentsState> = {
  not_found: () => <SectionWithoutPilet />,
  loading: () => (
    <div className="shell-page">
      <div className="shell-page__inset">
        <h1 className="shell-page__title">The shell could not load its modules</h1>
        <p>
          The pilet feed did not answer. Your CMS session may have expired:{' '}
          <TextLink href={window.ss?.config?.adminUrl ?? '/admin/'}>log in again</TextLink>.
        </p>
      </div>
    </div>
  ),
};

export const Home = () => (
  <div className="shell-page">
    <div className="shell-page__inset">
      <h1 className="shell-page__title">Piral shell</h1>
      <p>
        The legacy admin is switched off while the shell flag is on. Pilets listed by the feed register pages
        and extensions in this shell; a section without a pilet shows a placeholder.
      </p>
    </div>
  </div>
);

export const mainId = 'shell-main';

/** Moves focus to the main landmark without a hash navigation, which the router would treat as a route change */
export const SkipLink = () => (
  <a
    className="shell__skip-link"
    href={`#${mainId}`}
    onClick={(event) => {
      const main = document.getElementById(mainId);
      if (main) {
        event.preventDefault();
        main.focus();
        main.scrollIntoView();
      }
    }}
  >
    Skip to content
  </a>
);

export const menuId = 'shell-menu';

/**
 * The logo and the menu. Below 1024px the menu is a disclosure behind the toggle (style.css); it closes
 * on a route change, on Escape (focus returns to the toggle) and when focus leaves the sidebar, so it
 * never covers the page the user moved on to. From 1024px the menu's collapse button narrows the whole
 * sidebar to the icon rail, which has no room for the logo and badge
 */
export const Sidebar = ({ menu, adminPath }: { menu: Array<SilverstripeMenuItem>; adminPath: string }) => {
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = useMenuCollapsed();
  const toggleRef = React.useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const { pathname } = useLocation();

  React.useEffect(() => setOpen(false), [pathname]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      setOpen(false);
      toggleRef.current?.focus();
    }
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  const sidebarClasses = ['shell__sidebar', open && 'shell__sidebar--open', collapsed && 'shell__sidebar--collapsed']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={sidebarClasses} onKeyDown={onKeyDown} onBlur={onBlur}>
      <header className="shell__banner">
        <Button
          ref={toggleRef}
          className="shell__menu-toggle"
          variant="tertiary"
          iconOnly
          icon={open ? <CloseIcon /> : <MenuIcon />}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          Menu
        </Button>
        <Link className="shell__logo" to="/">
          Silverstripe
        </Link>
        <span className="shell__badge">Piral shell</span>
      </header>
      <Menu
        id={menuId}
        menu={menu}
        adminPath={adminPath}
        open={open}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
    </div>
  );
};

/**
 * The page's content and, when its header gives a preview URL, the preview beside it or in its place.
 * The content stays mounted in every mode so a form keeps its unsaved edits
 */
export const Workspace = ({ children }: { children: React.ReactNode }) => {
  const entry = useSectionHeader();
  const { mode } = usePreviewMode();
  const preview = entry?.header.preview;
  const shown = preview ? mode : 'edit';
  return (
    <div className="shell__workspace">
      <div className={shown === 'preview' ? 'shell__body shell__body--hidden' : 'shell__body'}>{children}</div>
      {preview && shown !== 'edit' && <PreviewPane url={preview} title={entry.header.title} full={shown === 'preview'} />}
    </div>
  );
};

/**
 * Menu links are client navigations: the shell serves every admin section while the flag is on, so a
 * full load would only rebuild the shell, and the unsaved-changes guard can ask in its own dialog
 */
export function createLayout(menu: Array<SilverstripeMenuItem>, adminPath: string): Partial<ComponentsState> {
  const Layout: ComponentsState['Layout'] = ({ children }) => (
    <div className="shell">
      <SkipLink />
      <Sidebar menu={menu} adminPath={adminPath} />
      <main className="shell__content" id={mainId} tabIndex={-1}>
        <SectionHeaderBar />
        <Workspace>{children}</Workspace>
        <LiveAnnouncer />
      </main>
      <Notifications />
      <UnsavedChangesGuard />
    </div>
  );
  Layout.displayName = 'ShellLayout';

  return {
    Layout,
    NotificationsHost,
    NotificationsToast,
    ErrorInfo: (props) =>
      props.type === 'not_found' ? (
        <SwitchErrorInfo {...props} />
      ) : (
        <div className="shell-page">
          <div className="shell-page__inset">
            <h1 className="shell-page__title">Error</h1>
            <SwitchErrorInfo {...props} />
          </div>
        </div>
      ),
  };
}
