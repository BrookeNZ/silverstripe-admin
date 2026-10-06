import * as React from 'react';
import { Link, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import { ComponentsState, ErrorComponentsState, ExtensionSlot, SwitchErrorInfo } from 'piral-core';
import { Notifications } from 'piral-notifications';
import { extensionSlotName } from './api/silverstripe';
import { SectionHeaderBar } from './header/SectionHeader';
import type { SilverstripeMenuItem } from './silverstripe';
import { UnsavedChangesGuard } from './unsaved';

const leftAndMain = 'SilverStripe\\Admin\\LeftAndMain';

const RouterChildren = React.createContext<React.ReactNode>(null);

const Splat: React.FC = () => <>{React.useContext(RouterChildren)}</>;

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

export const SectionWithoutPilet: React.FC = () => {
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
          <Link className="shell-page__link" to="/assets/edit/2">edit file 2</Link>.
        </p>
      )}
      <p>
        <Link className="shell-page__link" to="/">Shell home</Link>
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
        <a className="shell-page__link" href={window.ss?.config?.adminUrl ?? '/admin/'}>log in again</a>.
      </p>
    </div>
  ),
};

export const Home: React.FC = () => (
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

const MenuLink: React.FC<{ item: SilverstripeMenuItem; adminPath: string }> = ({ item, adminPath }) => {
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

/**
 * Menu links are client navigations: the shell serves every admin section while the flag is on, so a
 * full load would only rebuild the shell, and the unsaved-changes guard can ask in its own dialog
 */
export function createLayout(menu: Array<SilverstripeMenuItem>, adminPath: string): Partial<ComponentsState> {
  const Layout: ComponentsState['Layout'] = ({ children }) => (
    <div className="shell">
      <nav className="shell__menu" aria-label="CMS sections">
        <Link className="shell__logo" to="/">
          Silverstripe
        </Link>
        <span className="shell__badge">Piral shell</span>
        <ul className="shell__list">
          {menu.map((item) => (
            <li className="shell__item" key={item.code}>
              <MenuLink item={item} adminPath={adminPath} />
            </li>
          ))}
        </ul>
        <ExtensionSlot name={extensionSlotName(leftAndMain, 'menu.bottom')} />
      </nav>
      <main className="shell__content">
        <SectionHeaderBar />
        <div className="shell__body">{children}</div>
      </main>
      <Notifications />
      <UnsavedChangesGuard />
    </div>
  );
  Layout.displayName = 'ShellLayout';

  const NotificationsToast: ComponentsState['NotificationsToast'] = ({ children, onClose, options }) => (
    <div className={`piral-notification piral-notification--${options.type ?? 'info'}`} role="status">
      <span className="piral-notification__message">{children}</span>
      <button className="piral-notification-close" type="button" aria-label="Dismiss notification" onClick={onClose}>
        ×
      </button>
    </div>
  );
  NotificationsToast.displayName = 'ShellToast';

  return {
    Layout,
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
