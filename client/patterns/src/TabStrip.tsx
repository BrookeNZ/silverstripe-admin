/**
 * The CMS Refresh tab strip (Figma "Tabs", used by the section header and the page edit tab bar): a row
 * of labels with the current one bold and underlined. It draws the strip only; the semantics belong to
 * the caller. The section header gives it route links in a nav and marks the current one with
 * aria-current, and Tabs gives it buttons with the tab roles, ids and roving tabindex.
 *
 * An item with `href` renders through `renderLink`, a plain anchor by default, so a router link can be
 * passed in without this package depending on the router. Any other item renders a button carrying its
 * `buttonProps`. Given a `role` (tablist), the list items become presentational so the tabs are the
 * list's only children in the accessibility tree.
 */
import * as React from 'react';

export interface TabStripItem {
  key: React.Key;
  label: React.ReactNode;
  current?: boolean;
  href?: string;
  buttonProps?: React.ComponentPropsWithRef<'button'>;
}

export interface TabStripLinkProps {
  className: string;
  href: string;
  'aria-current'?: 'page';
  children: React.ReactNode;
}

export interface TabStripProps extends Omit<React.HTMLAttributes<HTMLUListElement>, 'children'> {
  items: TabStripItem[];
  renderLink?: (props: TabStripLinkProps) => React.ReactElement;
}

const renderAnchor = (props: TabStripLinkProps) => <a {...props} />;

export const TabStrip = ({ items, renderLink = renderAnchor, className, role, ...list }: TabStripProps) => (
  <ul {...list} role={role} className={className ? `admin-tab-strip ${className}` : 'admin-tab-strip'}>
    {items.map(({ key, label, current = false, href, buttonProps }) => {
      const tabClassName = current ? 'admin-tab-strip__tab admin-tab-strip__tab--current' : 'admin-tab-strip__tab';
      return (
        <li className="admin-tab-strip__item" key={key} role={role ? 'presentation' : undefined}>
          {href !== undefined ? (
            renderLink({ className: tabClassName, href, 'aria-current': current ? 'page' : undefined, children: label })
          ) : (
            <button type="button" {...buttonProps} className={tabClassName}>
              {label}
            </button>
          )}
        </li>
      );
    })}
  </ul>
);
