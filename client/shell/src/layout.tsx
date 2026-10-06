import * as React from 'react';
import { Link, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import { ComponentsState, ErrorComponentsState, ExtensionSlot, SwitchErrorInfo } from 'piral-core';
import { Notifications } from 'piral-notifications';
import { extensionSlotName } from './api/silverstripe';
import type { SilverstripeMenuItem } from './silverstripe';

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

const SectionWithoutPilet: React.FC = () => {
  const section = useLocation().pathname.split('/').filter(Boolean)[0] ?? '';
  return (
    <div className="shell-page">
      <h1 className="shell-page__title">No pilet owns “{section}” yet</h1>
      <p>
        This section still belongs to the legacy admin. Turn the shell flag off to use it, or ship a pilet
        that registers pages under /{section}.
      </p>
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

export function createLayout(menu: Array<SilverstripeMenuItem>): Partial<ComponentsState> {
  const Layout: ComponentsState['Layout'] = ({ children }) => (
    <div className="shell">
      <nav className="shell__menu" aria-label="CMS sections">
        <a className="shell__logo" href={window.ss?.config?.adminUrl ?? '/admin/'}>
          Silverstripe
        </a>
        <span className="shell__badge">Piral shell</span>
        <ul className="shell__list">
          {menu.map((item) => (
            <li className="shell__item" key={item.code}>
              <a className="shell__link" href={item.link} aria-current={item.current ? 'page' : undefined}>
                {item.title}
              </a>
            </li>
          ))}
        </ul>
        <ExtensionSlot name={extensionSlotName(leftAndMain, 'menu.bottom')} />
      </nav>
      <main className="shell__content">{children}</main>
      <Notifications />
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
