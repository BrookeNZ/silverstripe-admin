/**
 * Moving between admin URLs inside the shell's router. The server sends links relative to the site base
 * (`admin/redirects/...`); the router's paths are relative to the admin root (`/redirects/...`).
 */
import type * as React from 'react';
import { Link } from 'react-router-dom';
import type { LinkRenderProps } from '@silverstripe/admin-patterns';

export const routerLink = ({ href, ...link }: LinkRenderProps) => <Link {...link} to={href} />;

/** The router path for a server link under the admin root, or null for a link that leaves it */
export function routerPath(url: string, adminUrl: string = window.ss?.config?.adminUrl ?? 'admin/'): string | null {
  const target = new URL(url, document.baseURI);
  const admin = new URL(adminUrl, document.baseURI);
  const adminPath = admin.pathname.endsWith('/') ? admin.pathname : `${admin.pathname}/`;
  if (target.origin !== admin.origin || !`${target.pathname}/`.startsWith(adminPath)) {
    return null;
  }
  return `/${target.pathname.slice(adminPath.length)}${target.search}${target.hash}`;
}

/** Whether a click on a link should be left to the browser: a modified click, or not the main button */
export function isNewTabClick(event: React.MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
