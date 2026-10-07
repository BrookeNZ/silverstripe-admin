import * as React from 'react';
import { Link, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import { ComponentsState, ErrorComponentsState, ExtensionSlot, SwitchErrorInfo } from 'piral-core';
import { Notifications } from 'piral-notifications';
import { Button, CloseIcon, MenuIcon, Link as TextLink } from '@silverstripe/admin-patterns';
import { LiveAnnouncer } from './announcer';
import { extensionSlotName } from './api/silverstripe';
import { SectionHeaderBar } from './header/SectionHeader';
import { routerLink } from './routing';
import type { SilverstripeMenuItem } from './silverstripe';
import { NotificationsHost, NotificationsToast } from './notifications';
import { UnsavedChangesGuard } from './unsaved';

const leftAndMain = 'SilverStripe\\Admin\\LeftAndMain';

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

export const SectionWithoutPilet = () => {
  const section = useLocation().pathname.split('/').filter(Boolean)[0] ?? '';
  return (
    <div className="shell-page">
      <h1 className="shell-page__title">No pilet owns “{section}” yet</h1>
      <p>
        This section still belongs to the legacy admin. Turn the shell flag off to use it, or ship a pilet
        that registers pages under /{section}.
      </p>
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
  );
};

export const errors: Partial<ErrorComponentsState> = {
  not_found: SectionWithoutPilet,
  loading: () => (
    <div className="shell-page">
      <h1 className="shell-page__title">The shell could not load its modules</h1>
      <p>
        The pilet feed did not answer. Your CMS session may have expired:{' '}
        <TextLink href={window.ss?.config?.adminUrl ?? '/admin/'}>log in again</TextLink>.
      </p>
    </div>
  ),
};

export const Home = () => (
  <div className="shell-page">
    <h1 className="shell-page__title">Piral shell</h1>
    <p>
      The legacy admin is switched off while the shell flag is on. Pilets listed by the feed register pages
      and extensions in this shell; a section without a pilet shows a placeholder.
    </p>
  </div>
);

/** The menu link's path inside the router, or null when it points outside the admin */
function routerPath(link: string, adminPath: string): string | null {
  const url = new URL(link, document.baseURI);
  if (url.origin !== window.location.origin || !`${url.pathname}/`.startsWith(`${adminPath}/`)) {
    return null;
  }
  return url.pathname.slice(adminPath.length) || '/';
}

const MenuLink = ({ item, adminPath }: { item: SilverstripeMenuItem; adminPath: string }) => {
  const { pathname } = useLocation();
  const to = routerPath(item.link, adminPath);
  if (to === null) {
    return (
      <a className="shell__link" href={item.link}>
        {item.title}
      </a>
    );
  }
  const section = to.replace(/\/$/, '');
  const current = section ? pathname === section || pathname.startsWith(`${section}/`) : pathname === '/';
  return (
    <Link className="shell__link" to={to} aria-current={current ? 'page' : undefined}>
      {item.title}
    </Link>
  );
};

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
 * never covers the page the user moved on to
 */
export const Sidebar = ({ menu, adminPath }: { menu: Array<SilverstripeMenuItem>; adminPath: string }) => {
  const [open, setOpen] = React.useState(false);
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

  return (
    <div className={open ? 'shell__sidebar shell__sidebar--open' : 'shell__sidebar'} onKeyDown={onKeyDown} onBlur={onBlur}>
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
      <nav className={open ? 'shell__menu shell__menu--open' : 'shell__menu'} id={menuId} aria-label="CMS sections">
        <ul className="shell__list">
          {menu.map((item) => (
            <li className="shell__item" key={item.code}>
              <MenuLink item={item} adminPath={adminPath} />
            </li>
          ))}
        </ul>
        <ExtensionSlot name={extensionSlotName(leftAndMain, 'menu.bottom')} />
      </nav>
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
        <div className="shell__body">{children}</div>
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
          <h1 className="shell-page__title">Error</h1>
          <SwitchErrorInfo {...props} />
        </div>
      ),
  };
}
