/**
 * The admin top bar, after the CMS Refresh "Top bar" (Figma 2:53077, variants 2:1894): the Silverstripe
 * logo, the site name and the Piral shell badge at the start, the help and person menus at the end. The
 * server hands its data over as `data-top-bar` on the shell root (PiralTopBar in LeftAndMain.php), so
 * it draws before any pilet loads.
 *
 * Below 1024px the bar also holds the menu toggle, and the site name gives way to it as in the design's
 * "Mobile v2" (2:1909). The layout owns the open state, because the menu it discloses lives in the
 * sidebar. While the menu is open the bar is the design's "Mobile menu" (2:1916): Royal Blue, the close
 * cross and the site name in white. Help links open in a new tab, as the legacy menu's did.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CloseIcon, HelpIcon, Icon, Menu, MenuIcon, UserIcon } from '@silverstripe/admin-patterns';
import { routerPath } from '../routing';
import './topbar.css';

export interface TopBarData {
  siteName: string;
  siteUrl: string;
  applicationName: string;
  applicationLink: string;
  member: { name: string; profileUrl: string } | null;
  logoutUrl: string;
  helpLinks: Array<{ title: string; url: string }>;
}

const emptyTopBar: TopBarData = {
  siteName: '',
  siteUrl: '/',
  applicationName: 'Silverstripe',
  applicationLink: 'https://www.silverstripe.org/',
  member: null,
  logoutUrl: '',
  helpLinks: [],
};

export function readTopBar(root: HTMLElement | null): TopBarData {
  try {
    return { ...emptyTopBar, ...JSON.parse(root?.dataset.topBar ?? '{}') };
  } catch {
    return emptyTopBar;
  }
}

/** Figma "CMS logo" Glyph 2:36 */
const Logo = () => (
  <Icon viewBox="0 0 34.529 20" className="shell-top-bar__logo-mark">
    <path d="M17.083 2.001L9.814 7.089C8.808 7.791 8.564 9.174 9.266 10.18C9.969 11.186 11.351 11.43 12.358 10.728L19.627 5.64C22.636 3.532 26.793 4.264 28.893 7.274C31.001 10.283 30.268 14.44 27.259 16.54L24.974 18.137C26.867 21.354 31.148 20 33.094 16.547C35.127 12.938 35.053 8.332 32.525 4.723C29.017 -0.284 22.089 -1.504 17.083 2.001Z" />
    <path d="M17.445 17.995L24.714 12.908C25.72 12.205 25.964 10.822 25.261 9.816C24.559 8.811 23.176 8.566 22.17 9.269L14.9 14.357C11.891 16.464 7.735 15.732 5.635 12.723C3.527 9.713 4.259 5.557 7.269 3.457L9.554 1.859C7.662 -1.356 3.38 -0.003 1.435 3.45C-0.599 7.059 -0.525 11.666 2.004 15.275C5.509 20.281 12.438 21.509 17.445 17.996V17.995Z" />
  </Icon>
);

interface TopBarProps {
  data: TopBarData;
  menuId: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  toggleRef: React.Ref<HTMLButtonElement | HTMLAnchorElement>;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onBlur: (event: React.FocusEvent) => void;
}

export const TopBar = ({ data, menuId, menuOpen, onMenuToggle, toggleRef, onKeyDown, onBlur }: TopBarProps) => {
  const navigate = useNavigate();
  const { siteName, siteUrl, applicationName, applicationLink, member, logoutUrl, helpLinks } = data;

  const openProfile = (url: string) => {
    const path = routerPath(url);
    if (path === null) {
      window.location.assign(url);
    } else {
      navigate(path);
    }
  };

  return (
    <header className={menuOpen ? 'shell-top-bar shell-top-bar--menu-open' : 'shell-top-bar'}>
      <div className="shell-top-bar__start">
        <Button
          ref={toggleRef}
          className="shell-top-bar__menu-toggle"
          variant="tertiary"
          iconOnly
          icon={menuOpen ? <CloseIcon /> : <MenuIcon />}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={onMenuToggle}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        >
          Menu
        </Button>
        <a className="shell-top-bar__logo" href={applicationLink} target="_blank" rel="noopener noreferrer" aria-label={applicationName}>
          <Logo />
        </a>
        <span className="shell-top-bar__divider" />
        <a className="shell-top-bar__site-name" href={siteUrl} target="_blank" rel="noopener noreferrer">
          {siteName}
        </a>
        <span className="shell-top-bar__badge">Piral shell</span>
      </div>
      <div className="shell-top-bar__end">
        {helpLinks.length > 0 && (
          <Menu id="shell-top-bar-help" label="Help" title="Help" variant="tertiary" icon={<HelpIcon className="shell-top-bar__icon" />}>
            {helpLinks.map(({ title, url }) => (
              <Button key={url} variant="tertiary" href={url} target="_blank" rel="noopener noreferrer" role="menuitem" tabIndex={-1}>
                {title}
              </Button>
            ))}
          </Menu>
        )}
        {member && (
          <Menu id="shell-top-bar-member" label={member.name} title={member.name} variant="tertiary" icon={<UserIcon className="shell-top-bar__icon" />}>
            <Button variant="tertiary" onClick={() => openProfile(member.profileUrl)}>
              Profile
            </Button>
            <Button variant="tertiary" onClick={() => window.location.assign(logoutUrl)}>
              Log out
            </Button>
          </Menu>
        )}
      </div>
    </header>
  );
};
