/**
 * The CMS Refresh text link (Figma "Text link" 2:6274): Bright Blue body text that underlines on hover.
 * Links navigate and buttons act, so a tertiary Button is not a substitute for one.
 *
 * Renders through `renderLink`, a plain anchor by default, so the shell can pass react-router's Link
 * without this package depending on the router; the ref travels in the props it is given. An
 * `external` link always renders a plain anchor that opens a new window and says so in visually hidden
 * text. `icon` sits after the label by default, the reverse of Button, since a link's icon usually
 * says where it goes.
 */
import * as React from 'react';
import { IconLabel } from './IconLabel';
import type { IconPosition } from './IconLabel';

export interface LinkRenderProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  className: string;
  href: string;
  ref: React.Ref<HTMLAnchorElement>;
  children: React.ReactNode;
}

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  external?: boolean;
  renderLink?: (props: LinkRenderProps) => React.ReactElement;
}

const renderAnchor = (props: LinkRenderProps) => <a {...props} />;

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ icon, iconPosition = 'end', external = false, renderLink = renderAnchor, className, children, ...anchor }, ref) => {
    const classes = ['admin-link', icon && 'admin-link--icon', className].filter(Boolean).join(' ');
    const content = (
      <IconLabel icon={icon} iconPosition={iconPosition}>
        {children}
        {external && <span className="admin-link__hidden"> (opens in new window)</span>}
      </IconLabel>
    );
    if (external) {
      return (
        <a {...anchor} ref={ref} className={classes} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }
    return renderLink({ ...anchor, ref, className: classes, children: content });
  },
);

Link.displayName = 'Link';
