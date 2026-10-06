/**
 * The section header from the CMS Refresh design: a back button, the page title as the page's h1, and
 * the page's views (Content, Settings, History; a ModelAdmin's model tabs) as route links. The views
 * are navigation between routes, so they are a nav of links with aria-current rather than the
 * patterns package's Tabs, which switch panels inside one page; both draw the package's TabStrip.
 *
 * The layout renders it above every route; it draws nothing until the showing page sets a header.
 * The bar also keeps the document title on the header, and after a client route change it moves focus
 * to the new h1 and announces the title, so keyboard and screen reader users land on the new page.
 * The first load keeps the browser's own focus and announcement.
 */
import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BackIcon, TabStrip } from '@silverstripe/admin-patterns';
import { announce } from '../announcer';
import { useSectionHeader } from './state';
import type { SectionHeader as SectionHeaderContent } from './state';
import './header.css';

export type SectionHeaderProps = Omit<SectionHeaderContent, 'documentTitle'> & {
  titleRef?: React.Ref<HTMLHeadingElement>;
};

export const SectionHeader = ({ title, backTo, backLabel = 'Back', views = [], titleRef }: SectionHeaderProps) => (
  <div className="shell-header">
    <div className="shell-header__current">
      {backTo && (
        <Link className="shell-header__back" to={backTo} aria-label={backLabel}>
          <BackIcon />
        </Link>
      )}
      <h1 className="shell-header__title" ref={titleRef} tabIndex={-1}>
        {title}
      </h1>
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

/** "Pages - Silverstripe" from the server's "Silverstripe - Pages": the application name leads the first title */
export function applicationName(serverTitle: string): string {
  return serverTitle.split(' - ')[0].trim() || 'Silverstripe';
}

export function documentTitle(header: SectionHeaderContent, application: string): string {
  return `${header.documentTitle ?? header.title} - ${application}`;
}

/** The header the showing page set, or nothing */
export const SectionHeaderBar = () => {
  const entry = useSectionHeader();
  const { pathname } = useLocation();
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const application = React.useRef(applicationName(document.title)).current;
  const mounted = React.useRef(false);
  const pendingFocus = React.useRef(false);

  React.useEffect(() => {
    pendingFocus.current = mounted.current;
    mounted.current = true;
  }, [pathname]);

  React.useEffect(() => {
    if (entry) {
      document.title = documentTitle(entry.header, application);
    }
  }, [entry, application]);

  // A frame's wait lets the leaving page dispose its header and the arriving page set its own
  React.useEffect(() => {
    if (!pendingFocus.current || !entry) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      if (pendingFocus.current && titleRef.current) {
        pendingFocus.current = false;
        titleRef.current.focus();
        announce(titleRef.current.textContent ?? '');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [entry?.id, pathname]);

  return entry ? <SectionHeader {...entry.header} titleRef={titleRef} /> : null;
};
