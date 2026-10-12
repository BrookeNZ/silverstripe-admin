/**
 * The admin top bar, after the CMS Refresh "Top bar" (Figma 2:53077, variants 2:1894): the Silverstripe
 * logo, the site name and the Piral shell badge at the start, the help and person menus at the end. The
 * server hands its data over as `data-top-bar` on the shell root (PiralTopBar in LeftAndMain.php), so
 * it draws before any pilet loads.
 *
 * Below 1024px the bar is the design's "Mobile v2" (2:1909): the menu toggle takes the site name's place
 * and the help and person menus drop their titles, leaving icon-only triggers. The layout owns the open
 * state, because the menu it discloses lives in the sidebar. While the menu is open the bar is the
 * design's "Mobile menu" (2:1916): Royal Blue, the close cross and the site name in white. Help links
 * open in a new tab, as the legacy menu's did.
 */
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CloseIcon, HelpIcon, Icon, Menu, MenuIcon, UserIcon } from '@silverstripe/admin-patterns';
import { routerPath } from '../routing';
import { useMediaQuery } from '../useMediaQuery';
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
    <path d="M17.083 2.001 9.814 7.089a2.22 2.22 0 1 0 2.544 3.639l7.269-5.088c3.009-2.108 7.166-1.376 9.266 1.634 2.108 3.009 1.375 7.166-1.634 9.266l-2.285 1.597c1.893 3.217 6.174 1.863 8.12-1.59 2.033-3.609 1.959-8.215-.569-11.824-3.508-5.007-10.436-6.227-15.442-2.722" />
    <path d="m17.445 17.995 7.269-5.087a2.219 2.219 0 1 0-2.544-3.639l-7.27 5.088c-3.009 2.107-7.165 1.375-9.265-1.634-2.108-3.01-1.376-7.166 1.634-9.266l2.285-1.598C7.662-1.356 3.38-.003 1.435 3.45c-2.034 3.609-1.96 8.216.569 11.825 3.505 5.006 10.434 6.234 15.441 2.721z" />
  </Icon>
);

// Same breakpoint as topbar.css, which hides the site name and shows the toggle below it
const wideQuery = '(width >= 1024px)';

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
  const wide = useMediaQuery(wideQuery);
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
        {/* The title carries the whole name when the ellipsis cuts it */}
        <a className="shell-top-bar__site-name" href={siteUrl} target="_blank" rel="noopener noreferrer" title={siteName}>
          {siteName}
        </a>
        <span className="shell-top-bar__badge">Piral shell</span>
      </div>
      <div className="shell-top-bar__end">
        {helpLinks.length > 0 && (
          <Menu id="shell-top-bar-help" label="Help" title={wide ? 'Help' : undefined} variant="tertiary" icon={<HelpIcon className="shell-top-bar__icon" />}>
            {helpLinks.map(({ title, url }) => (
              <Button key={url} variant="tertiary" href={url} target="_blank" rel="noopener noreferrer" role="menuitem" tabIndex={-1}>
                {title}
              </Button>
            ))}
          </Menu>
        )}
        {member && (
          <Menu id="shell-top-bar-member" label={member.name} title={wide ? member.name : undefined} variant="tertiary" icon={<UserIcon className="shell-top-bar__icon" />}>
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
