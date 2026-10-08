import * as React from 'react';
import { RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom';
import type { ComponentsState, ErrorComponentsState} from 'piral-core';
import { SwitchErrorInfo } from 'piral-core';
import { Notifications } from 'piral-notifications';
import { Link as TextLink } from '@silverstripe/admin-patterns';
import { LiveAnnouncer } from './announcer';
import { SectionHeaderBar } from './header/SectionHeader';
import { SectionSidebar } from './header/SectionSidebar';
import { useSectionHeader } from './header/state';
import { usePreviewMode } from './preview/mode';
import { PreviewPane } from './preview/PreviewPane';
import { useMenuCollapsed } from './menu/collapse';
import { Menu } from './menu/Menu';
import { routerLink } from './routing';
import { TopBar } from './topbar/TopBar';
import type { TopBarData } from './topbar/TopBar';
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
    <RouterChildren value={children}>
      <RouterProvider router={router} />
    </RouterChildren>
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

interface MenuDisclosure {
  open: boolean;
  toggle: () => void;
  toggleRef: React.RefObject<HTMLButtonElement | HTMLAnchorElement | null>;
  sidebarRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
}

/**
 * Below 1024px the menu is a disclosure behind the top bar's toggle (style.css); it closes on a route
 * change, on Escape (focus returns to the toggle) and when focus leaves both the toggle and the
 * sidebar, so it never covers the page the user moved on to
 */
const useMenuDisclosure = (): MenuDisclosure => {
  const [open, setOpen] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const [shownPath, setShownPath] = React.useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setOpen(false);
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      setOpen(false);
      toggleRef.current?.focus();
    }
  };
  const onBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (!toggleRef.current?.contains(next) && !sidebarRef.current?.contains(next)) {
      setOpen(false);
    }
  };

  return { open, toggle: () => setOpen(!open), toggleRef, sidebarRef, onKeyDown, onBlur };
};

interface SidebarProps {
  menu: Array<SilverstripeMenuItem>;
  adminPath: string;
  disclosure: MenuDisclosure;
}

/** The menu. From 1024px its collapse button narrows the whole sidebar to the icon rail */
export const Sidebar = ({ menu, adminPath, disclosure }: SidebarProps) => {
  const [collapsed, setCollapsed] = useMenuCollapsed();
  const { open, sidebarRef, onKeyDown, onBlur } = disclosure;

  const sidebarClasses = ['shell__sidebar', collapsed && 'shell__sidebar--collapsed'].filter(Boolean).join(' ');

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape and focus-out handling for the menu links inside it
    <div className={sidebarClasses} ref={sidebarRef} onKeyDown={onKeyDown} onBlur={onBlur}>
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

interface ChromeProps {
  menu: Array<SilverstripeMenuItem>;
  adminPath: string;
  topBar: TopBarData;
}

/** The top bar and the sidebar, sharing the menu's open state; both are cells of the shell's grid */
export const Chrome = ({ menu, adminPath, topBar }: ChromeProps) => {
  const disclosure = useMenuDisclosure();
  return (
    <>
      <TopBar
        data={topBar}
        menuId={menuId}
        menuOpen={disclosure.open}
        onMenuToggle={disclosure.toggle}
        toggleRef={disclosure.toggleRef}
        onKeyDown={disclosure.onKeyDown}
        onBlur={disclosure.onBlur}
      />
      <Sidebar menu={menu} adminPath={adminPath} disclosure={disclosure} />
    </>
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
 * The main landmark. When the page's header asks for a sidebar, the sidebar column sits before the
 * content column (section header, then the page), at every width, as the legacy tree panel did. The
 * content column keeps its place in the tree either way, so the page does not remount when its header
 * adds or drops the sidebar. Preview mode hides the sidebar but keeps it mounted
 */
export const Content = ({ children }: { children: React.ReactNode }) => {
  const header = useSectionHeader()?.header;
  const { mode } = usePreviewMode();
  const sidebar = header?.sidebar;
  const sidebarHidden = Boolean(header?.preview) && mode === 'preview';
  return (
    <main
      className={sidebar && !sidebarHidden ? 'shell__content shell__content--split' : 'shell__content'}
      id={mainId}
      tabIndex={-1}
    >
      {sidebar && <SectionSidebar title={sidebar.title} section={sidebar.section} hidden={sidebarHidden} />}
      <div className="shell__column">
        <SectionHeaderBar />
        <Workspace>{children}</Workspace>
      </div>
      <LiveAnnouncer />
    </main>
  );
};

/**
 * Menu links are client navigations: the shell serves every admin section while the flag is on, so a
 * full load would only rebuild the shell, and the unsaved-changes guard can ask in its own dialog
 */
export function createLayout(menu: Array<SilverstripeMenuItem>, adminPath: string, topBar: TopBarData): Partial<ComponentsState> {
  const Layout: ComponentsState['Layout'] = ({ children }) => (
    <div className="shell">
      <SkipLink />
      <Chrome menu={menu} adminPath={adminPath} topBar={topBar} />
      <Content>{children}</Content>
      <Notifications />
      <UnsavedChangesGuard />
    </div>
  );
  Layout.displayName = 'ShellLayout';

  return {
    Layout,
    NotificationsHost,
    NotificationsToast,
    // not_found is the generic section renderer (index.tsx), which draws a whole page of its own
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
