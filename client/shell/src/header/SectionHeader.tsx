/**
 * The section header from the CMS Refresh design: a back button, the page title as the page's h1, and
 * the page's views (Content, Settings, History; a ModelAdmin's model tabs) as route links. The views
 * are navigation between routes, so they are a nav of links with aria-current rather than the
 * patterns package's Tabs, which switch panels inside one page; both draw the package's TabStrip.
 *
 * The layout renders it above every route; it draws nothing until the showing page sets a header.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { BackIcon, TabStrip } from '@silverstripe/admin-patterns';
import { useSectionHeader } from './state';
import type { SectionHeader as SectionHeaderContent } from './state';
import './header.css';

export type SectionHeaderProps = SectionHeaderContent;

export const SectionHeader = ({ title, backTo, backLabel = 'Back', views = [] }: SectionHeaderProps) => (
  <div className="shell-header">
    <div className="shell-header__current">
      {backTo && (
        <Link className="shell-header__back" to={backTo} aria-label={backLabel}>
          <BackIcon />
        </Link>
      )}
      <h1 className="shell-header__title">{title}</h1>
    </div>
    {views.length > 0 && (
      <nav className="shell-header__views" aria-label={`${title} views`}>
        <TabStrip
          items={views.map((view) => ({ key: view.key, label: view.label, current: view.current, href: view.to }))}
          renderLink={({ href, ...link }) => <Link {...link} to={href} />}
        />
      </nav>
    )}
  </div>
);

/** The header the showing page set, or nothing */
export const SectionHeaderBar = () => {
  const header = useSectionHeader();
  return header ? <SectionHeader {...header} /> : null;
};
