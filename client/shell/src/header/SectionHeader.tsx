/**
 * The section header from the CMS Refresh design: a back button, the page's ancestors as a breadcrumb
 * above the title (the second-level header, Figma 2:1870), the page title as the page's h1, and
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
import { BackIcon, Link as TextLink, TabStrip } from '@silverstripe/admin-patterns';
import { announce } from '../announcer';
import { useMeasuredHeight } from '../measure';
import { routerLink } from '../routing';
import { useSectionHeader } from './state';
import type { SectionHeaderCrumb, SectionHeader as SectionHeaderContent } from './state';
import './header.css';

export type SectionHeaderProps = Omit<SectionHeaderContent, 'documentTitle' | 'preview' | 'sidebar'> & {
  titleRef?: React.Ref<HTMLHeadingElement>;
  headerRef?: React.Ref<HTMLDivElement>;
};

interface Back {
  to: string;
  label: string;
}

function back(backTo: string | undefined, backLabel: string | undefined, crumbs: Array<SectionHeaderCrumb>): Back | null {
  if (backTo) {
    return { to: backTo, label: backLabel ?? 'Back' };
  }
  const parent = crumbs[crumbs.length - 1];
  return parent ? { to: parent.to, label: backLabel ?? `Back to ${parent.label}` } : null;
}

export const SectionHeader = ({ title, badge, crumbs = [], backTo, backLabel, views = [], titleRef, headerRef }: SectionHeaderProps) => {
  const backLink = back(backTo, backLabel, crumbs);
  const badgeId = React.useId();
  const titleClass = crumbs.length > 0 ? 'shell-header__title shell-header__title--nested' : 'shell-header__title';
  return (
    <div className="shell-header" ref={headerRef}>
      <div className="shell-header__current">
        {backLink && (
          <Link className="shell-header__back" to={backLink.to} aria-label={backLink.label}>
            <BackIcon />
          </Link>
        )}
        <div className="shell-header__heading">
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb">
              <ol className="shell-header__crumbs">
                {crumbs.map((crumb) => (
                  <li className="shell-header__crumb" key={crumb.to}>
                    <TextLink href={crumb.to} renderLink={routerLink}>
                      {crumb.label}
                    </TextLink>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="shell-header__title-row">
            <h1 className={titleClass} ref={titleRef} tabIndex={-1} aria-describedby={badge ? badgeId : undefined}>
              {title}
            </h1>
            {badge && (
              <span className="shell-header__badge" id={badgeId}>
                {badge}
              </span>
            )}
          </div>
        </div>
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
};

/** "Pages - Silverstripe" from the server's "Silverstripe - Pages": the application name leads the first title */
export function applicationName(serverTitle: string): string {
  return serverTitle.split(' - ')[0].trim() || 'Silverstripe';
}

export function documentTitle(header: SectionHeaderContent, application: string): string {
  return `${header.documentTitle ?? header.title} - ${application}`;
}

export const keptHeaderDelay = 300;

export const retitleWindow = 3000;

/** The header the showing page set, or nothing */
export const SectionHeaderBar = () => {
  const entry = useSectionHeader();
  const { pathname } = useLocation();
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const headerRef = useMeasuredHeight<HTMLDivElement>('--shell-header-offset');
  const application = React.useRef(applicationName(document.title)).current;
  const mounted = React.useRef(false);
  const pending = React.useRef<{ staleId: number | undefined } | null>(null);
  const [landings, setLandings] = React.useState(0);
  const announceUntil = React.useRef(0);
  const announced = React.useRef('');

  React.useEffect(() => {
    if (mounted.current) {
      pending.current = { staleId: entry?.id };
    }
    mounted.current = true;
  }, [pathname]);

  React.useEffect(() => {
    if (entry) {
      document.title = documentTitle(entry.header, application);
    }
  }, [entry, application]);

  // The arriving page usually sets its header just after the route changes; one that keeps the
  // leaving page's header gets focus after a short wait instead
  React.useEffect(() => {
    if (!pending.current || !entry) {
      return undefined;
    }
    const land = () => {
      pending.current = null;
      titleRef.current?.focus();
      announced.current = '';
      announceUntil.current = performance.now() + retitleWindow;
      setLandings((count) => count + 1);
    };
    if (entry.id !== pending.current.staleId) {
      const frame = requestAnimationFrame(land);
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(land, keptHeaderDelay);
    return () => clearTimeout(timer);
  }, [entry, pathname]);

  // A record page titles itself again once its record loads ("Users #1", then the name): the
  // announcement waits for the header to settle, and a retitle soon after landing is read too
  React.useEffect(() => {
    if (!entry || performance.now() > announceUntil.current) {
      return undefined;
    }
    const { title } = entry.header;
    const timer = setTimeout(() => {
      if (title !== announced.current && document.activeElement === titleRef.current) {
        announced.current = title;
        announce(title);
      }
    }, keptHeaderDelay);
    return () => clearTimeout(timer);
  }, [entry, landings]);

  return entry ? <SectionHeader {...entry.header} titleRef={titleRef} headerRef={headerRef} /> : null;
};
