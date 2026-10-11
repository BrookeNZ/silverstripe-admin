/**
 * The sidebar column a page asks for with its header's `sidebar` (the site tree in the CMS Refresh
 * Pages screen, Figma 2:3675): a header row level with the section header, holding the section title
 * and the search button, above the body a pilet registers with `registerSectionSidebar`, and the
 * collapse button at the foot. The layout draws it beside the content column, so the section header and
 * its breadcrumb sit over the page only.
 *
 * The title is not a heading, so the page's h1 stays the first; the body labels its landmark with it
 * through `titleId`. The search button only toggles `searchOpen`: the body draws the field (`searchId`)
 * and calls `closeSearch` when the viewer dismisses it, which hands focus back to the button.
 *
 * Collapsed, the body stays mounted but hidden, so the tree keeps its open nodes. From 1024px the
 * choice is remembered per browser (the menu's own collapse works the same way, menu/collapse.ts);
 * below 1024px, where the column stacks above the form, it starts collapsed on every load so the form is
 * one control away, as the legacy tree panel did.
 */
import * as React from 'react';
import { ExtensionSlot } from 'piral-core';
import { Button, CollapseMenuIcon, ExpandMenuIcon, SearchIcon } from '@silverstripe/admin-patterns';
import { useMediaQuery } from '../useMediaQuery';
import type { SectionHeaderSidebar } from './state';
import './section-sidebar.css';

/** What the shell hands the registered sidebar; the pages pilet mirrors it in PagesSidebar.tsx */
export interface SectionSidebarSlotProps {
  titleId: string;
  searchId: string;
  searchOpen: boolean;
  closeSearch: () => void;
}

export function sectionSidebarSlotName(section: string): string {
  return `silverstripe:section-sidebar:${section}`;
}

export const sectionSidebarCollapsedKey = 'ss-admin-shell.section-sidebar-collapsed';

// Same breakpoint as the stacking in section-sidebar.css
const wideQuery = '(width >= 1024px)';

const titleId = 'shell-section-sidebar-title';
const searchId = 'shell-section-sidebar-search';
const bodyId = 'shell-section-sidebar-body';

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(sectionSidebarCollapsedKey) === '1';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(sectionSidebarCollapsedKey, '1');
    } else {
      window.localStorage.removeItem(sectionSidebarCollapsedKey);
    }
  } catch {
    // Storage can be blocked; the state then lasts until the page reloads
  }
}

function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const wide = useMediaQuery(wideQuery);
  const [stored, setStored] = React.useState(readStoredCollapsed);
  const [narrow, setNarrow] = React.useState(true);
  const update = React.useCallback(
    (next: boolean) => {
      if (wide) {
        writeStoredCollapsed(next);
        setStored(next);
      } else {
        setNarrow(next);
      }
    },
    [wide],
  );
  return [wide ? stored : narrow, update];
}

export interface SectionSidebarProps extends SectionHeaderSidebar {
  /** Drops the column from view without unmounting it, as preview mode does */
  hidden?: boolean;
}

export const SectionSidebar = ({ title, section, hidden = false }: SectionSidebarProps) => {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchButtonRef = React.useRef<HTMLButtonElement | HTMLAnchorElement>(null);

  const closeSearch = React.useCallback(() => {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  }, []);
  const params = React.useMemo<SectionSidebarSlotProps>(
    () => ({ titleId, searchId, searchOpen, closeSearch }),
    [searchOpen, closeSearch],
  );

  const classes = [
    'shell-section-sidebar',
    collapsed && 'shell-section-sidebar--collapsed',
    hidden && 'shell-section-sidebar--hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="shell-section-sidebar__header">
        <span className="shell-section-sidebar__title" id={titleId}>
          {title}
        </span>
        {!collapsed && (
          <Button
            ref={searchButtonRef}
            variant="tertiary"
            iconOnly
            icon={<SearchIcon />}
            aria-expanded={searchOpen}
            aria-controls={searchId}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          >
            {`Search ${title}`}
          </Button>
        )}
      </div>
      <div className="shell-section-sidebar__body" id={bodyId} hidden={collapsed}>
        <ExtensionSlot
          name={sectionSidebarSlotName(section)}
          params={params}
          render={(children: Array<React.ReactNode>) => <>{children[children.length - 1] ?? null}</>}
        />
      </div>
      <div className="shell-section-sidebar__footer">
        <Button
          className="shell-section-sidebar__collapse"
          variant="tertiary"
          iconOnly
          icon={collapsed ? <ExpandMenuIcon /> : <CollapseMenuIcon />}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => {
            setSearchOpen(false);
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? `Expand ${title}` : `Collapse ${title}`}
        </Button>
      </div>
    </div>
  );
};
