/**
 * The CMS section menu: one link per menu item with its section icon, the
 * `SilverStripe\Admin\LeftAndMain.menu.bottom` extension slot, and the button that collapses the
 * desktop menu to an icon rail. The sidebar in layout.tsx owns the collapsed state, because the
 * sidebar's width changes with it; below 1024px the menu is the top bar's disclosure and never collapses
 * (menu.css).
 */
import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExtensionSlot } from 'piral-core';
import { Button, CollapseMenuIcon, ExpandMenuIcon } from '@silverstripe/admin-patterns';
import { extensionSlotName } from '../api/silverstripe';
import type { SilverstripeMenuItem } from '../silverstripe';
import { MenuSectionIcon } from './sectionIcons';
import './menu.css';

const leftAndMain = 'SilverStripe\\Admin\\LeftAndMain';

/** The menu link's path inside the router, or null when it points outside the admin */
function menuPath(link: string, adminPath: string): string | null {
  const url = new URL(link, document.baseURI);
  if (url.origin !== window.location.origin || !`${url.pathname}/`.startsWith(`${adminPath}/`)) {
    return null;
  }
  return url.pathname.slice(adminPath.length) || '/';
}

const MenuLinkContent = ({ item }: { item: SilverstripeMenuItem }) => (
  <>
    <span className="shell-menu__icon">
      <MenuSectionIcon code={item.code} iconClass={item.iconClass} />
    </span>
    <span className="shell-menu__label">{item.title}</span>
  </>
);

export const MenuLink = ({ item, adminPath }: { item: SilverstripeMenuItem; adminPath: string }) => {
  const { pathname } = useLocation();
  const to = menuPath(item.link, adminPath);
  if (to === null) {
    return (
      <a className="shell-menu__link" href={item.link} title={item.title}>
        <MenuLinkContent item={item} />
      </a>
    );
  }
  const section = to.replace(/\/$/, '');
  const current = section ? pathname === section || pathname.startsWith(`${section}/`) : pathname === '/';
  return (
    <Link className="shell-menu__link" to={to} title={item.title} aria-current={current ? 'page' : undefined}>
      <MenuLinkContent item={item} />
    </Link>
  );
};

interface MenuProps {
  id: string;
  menu: Array<SilverstripeMenuItem>;
  adminPath: string;
  open: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export const Menu = ({ id, menu, adminPath, open, collapsed, onCollapsedChange }: MenuProps) => {
  const classes = ['shell-menu', open && 'shell-menu--open', collapsed && 'shell-menu--collapsed'].filter(Boolean).join(' ');
  return (
    <nav className={classes} id={id} aria-label="CMS sections">
      <ul className="shell-menu__list">
        {menu.map((item) => (
          <li className="shell-menu__item" key={item.code}>
            <MenuLink item={item} adminPath={adminPath} />
          </li>
        ))}
      </ul>
      <ExtensionSlot name={extensionSlotName(leftAndMain, 'menu.bottom')} />
      <div className="shell-menu__footer">
        <Button
          className="shell-menu__collapse"
          variant="tertiary"
          iconOnly
          icon={collapsed ? <ExpandMenuIcon /> : <CollapseMenuIcon />}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? 'Expand menu' : 'Collapse menu'}
        </Button>
      </div>
    </nav>
  );
};
