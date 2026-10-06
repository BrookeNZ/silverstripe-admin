/**
 * The section header from the CMS Refresh design: a back button, the page title as the page's h1, and
 * the page's views (Content, Settings, History; a ModelAdmin's model tabs) as route links. The views
 * are navigation between routes, so they are a nav of links with aria-current rather than the
 * patterns package's Tabs, which switch panels inside one page.
 *
 * The layout renders it above every route; it draws nothing until the showing page sets a header.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { useSectionHeader } from './state';
import type { SectionHeader as SectionHeaderContent } from './state';
import './header.css';

const BackChevron = () => (
  <svg width="25" height="25" viewBox="0 0 25 25" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M11.2 12.5 15.1 8.6 13.5 7 8 12.5l5.5 5.5 1.6-1.6zM9 11.5h2v2H9z" />
  </svg>
);

export type SectionHeaderProps = SectionHeaderContent;

export const SectionHeader = ({ title, backTo, backLabel = 'Back', views = [] }: SectionHeaderProps) => (
  <div className="shell-header">
    <div className="shell-header__current">
      {backTo && (
        <Link className="shell-header__back" to={backTo} aria-label={backLabel}>
          <BackChevron />
        </Link>
      )}
      <h1 className="shell-header__title">{title}</h1>
    </div>
    {views.length > 0 && (
      <nav className="shell-header__views" aria-label={`${title} views`}>
        <ul className="shell-header__view-list">
          {views.map((view) => (
            <li className="shell-header__view" key={view.key}>
              <Link
                className={view.current ? 'shell-header__view-link shell-header__view-link--current' : 'shell-header__view-link'}
                to={view.to}
                aria-current={view.current ? 'page' : undefined}
              >
                {view.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    )}
  </div>
);

/** The header the showing page set, or nothing */
export const SectionHeaderBar = () => {
  const header = useSectionHeader();
  return header ? <SectionHeader {...header} /> : null;
};
