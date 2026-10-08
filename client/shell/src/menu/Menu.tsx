/**
 * The CMS section menu: one link per menu item with its section icon, then the items pilets register with
 * `registerMenuItem` drawn the same way, then the legacy `SilverStripe\Admin\LeftAndMain.menu.bottom`
 * extensions (pilet markup, each in its own item), and the button that collapses the
 * desktop menu to an icon rail. The sidebar in layout.tsx owns the collapsed state, because the
 * sidebar's width changes with it; below 1024px the menu is the top bar's disclosure and never collapses
 * (menu.css).
 */
import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExtensionSlot } from 'piral-core';
import { Button, CollapseMenuIcon, ExpandMenuIcon, SectionIcon } from '@silverstripe/admin-patterns';
import { extensionSlotName } from '../api/silverstripe';
import type { SilverstripeMenuItem } from '../silverstripe';
import { MenuSectionIcon } from './sectionIcons';
import { usePiletMenuItems } from './menuItems';
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

interface MenuLinkContentProps {
  label: string;
  icon: React.ReactNode;
}

const MenuLinkContent = ({ label, icon }: MenuLinkContentProps) => (
  <>
    <span className="shell-menu__icon">{icon}</span>
    <span className="shell-menu__label">{label}</span>
  </>
);

interface MenuLinkProps extends MenuLinkContentProps {
  /** A router path relative to the admin base */
  to: string;
}

export const MenuLink = ({ to, label, icon }: MenuLinkProps) => {
  const { pathname } = useLocation();
  const section = to.replace(/\/$/, '');
  const current = section ? pathname === section || pathname.startsWith(`${section}/`) : pathname === '/';
  return (
    <Link className="shell-menu__link" to={to} title={label} aria-current={current ? 'page' : undefined}>
      <MenuLinkContent label={label} icon={icon} />
    </Link>
  );
};

interface SectionLinkProps {
  item: SilverstripeMenuItem;
  adminPath: string;
}

const SectionLink = ({ item, adminPath }: SectionLinkProps) => {
  const to = menuPath(item.link, adminPath);
  const icon = <MenuSectionIcon code={item.code} iconClass={item.iconClass} />;
  if (to === null) {
    return (
      <a className="shell-menu__link" href={item.link} title={item.title}>
        <MenuLinkContent label={item.title} icon={icon} />
      </a>
    );
  }
  return <MenuLink to={to} label={item.title} icon={icon} />;
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
  const piletItems = usePiletMenuItems();
  const classes = ['shell-menu', open && 'shell-menu--open', collapsed && 'shell-menu--collapsed'].filter(Boolean).join(' ');
  return (
    <nav className={classes} id={id} aria-label="CMS sections">
      <ul className="shell-menu__list">
        {menu.map((item) => (
          <li className="shell-menu__item" key={item.code}>
            <SectionLink item={item} adminPath={adminPath} />
          </li>
        ))}
        {piletItems.map(({ code, label, to, Icon = SectionIcon }) => (
          <li className="shell-menu__item" key={`pilet:${code}`}>
            <MenuLink to={to} label={label} icon={<Icon />} />
          </li>
        ))}
        <ExtensionSlot
          name={extensionSlotName(leftAndMain, 'menu.bottom')}
          render={(children: Array<React.ReactNode>) => (
            <>
              {React.Children.map(children, (child) => (
                <li className="shell-menu__item">{child}</li>
              ))}
            </>
          )}
        />
      </ul>
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
