/**
 * The admin button, after the CMS Refresh design's three button styles: primary (solid green),
 * secondary (green outline on white, the default) and tertiary (white with a grey label, the design's
 * "white buttons"), plus text: a button drawn as a Link (Figma "Text link" 2:6274) for an action that sits
 * in a row of links, so the element stays a button while it reads like its neighbours.
 *
 * `tone` recolours any variant but text: `accent` is the design's blue, `danger` its red "Remove" and
 * `warning` the yellow "Add a block", designed only as a primary. `size="sm"` is the Plain button's
 * tighter padding and medium weight, and brings no colour, so the design's Plain buttons are
 * `size="sm"` with `tone="accent"` ("Edit") or `tone="danger"` ("Remove") on the default secondary.
 * "Select all" is tertiary with accent, the "1 selected" chip primary with accent and its X at the end.
 *
 * Renders a `<button type="button">`, or an `<a>` when given `href`. An icon-only button needs a name:
 * `aria-label`, or children kept as visually hidden text; the type requires one and dev builds warn
 * when it is empty. `loading` marks the button busy and `aria-disabled` without the disabled attribute,
 * so it keeps focus, and swallows clicks. An anchor cannot be disabled, so a disabled or loading link
 * drops its `href`, leaves the tab order, says so with `aria-disabled` and swallows clicks. Inside an
 * open Menu a button is one of its `menuitem`s (see menuContext).
 */
import * as React from 'react';
import { IconLabel } from './IconLabel';
import { MenuItemContext } from './menuContext';
import type { IconPosition } from './IconLabel';

// The bundler replaces this, as it does for React's own development checks
declare const process: { env: { NODE_ENV?: string } };

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'text';
export type ButtonTone = 'accent' | 'danger' | 'warning';
export type ButtonSize = 'sm';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement | HTMLAnchorElement>;
}

type ButtonName =
  | { iconOnly?: boolean; 'aria-label'?: string; children: NonNullable<React.ReactNode> }
  | { iconOnly: true; 'aria-label': string; children?: React.ReactNode };

type NativeButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & { href?: undefined };
type NativeAnchorProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'aria-label'> & {
  href: string;
  disabled?: boolean;
};

export type ButtonProps = ButtonBaseProps & ButtonName & (NativeButtonProps | NativeAnchorProps);

function buttonClassName(variant: ButtonVariant, tone: ButtonTone | undefined, size: ButtonSize | undefined, iconOnly: boolean, className?: string): string {
  return [
    'admin-button',
    variant !== 'secondary' && `admin-button--${variant}`,
    tone && `admin-button--${tone}`,
    size && `admin-button--${size}`,
    iconOnly && 'admin-button--icon-only',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function hasText(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => typeof child !== 'string' || child.trim() !== '');
}

function swallow(event: React.MouseEvent) {
  event.preventDefault();
}

export const Button = ({
  variant = 'secondary',
  tone,
  size,
  icon,
  iconPosition = 'start',
  iconOnly = false,
  loading = false,
  className,
  children,
  'aria-label': label,
  ref,
  ...rest
}: ButtonProps) => {
  const menu = React.useContext(MenuItemContext);
  const classes = buttonClassName(variant, tone, size, iconOnly, className);
  if (process.env.NODE_ENV !== 'production' && iconOnly && !label?.trim() && !hasText(children)) {
    console.warn('An icon-only Button needs an aria-label or text children to name it');
  }
  const content = (
    <IconLabel icon={icon} iconPosition={iconPosition}>
      {hasText(children) && <span className={iconOnly ? 'admin-visually-hidden' : undefined}>{children}</span>}
    </IconLabel>
  );

  if (rest.href !== undefined) {
    const { href, disabled, onClick, tabIndex, ...anchor } = rest as NativeAnchorProps;
    const inert = disabled || loading;
    return (
      <a
        {...anchor}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={classes}
        aria-label={label}
        href={inert ? undefined : href}
        tabIndex={inert ? -1 : tabIndex}
        onClick={inert ? swallow : onClick}
        aria-disabled={inert || undefined}
        aria-busy={loading || undefined}
      >
        {content}
      </a>
    );
  }

  const { type = 'button', disabled, onClick, ...button } = rest as NativeButtonProps;
  const onMenuItemClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    menu?.close();
  };
  return (
    <button
      type={type}
      {...(menu ? { role: 'menuitem', tabIndex: -1 } : {})}
      {...button}
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      aria-label={label}
      disabled={disabled}
      onClick={loading ? swallow : menu ? onMenuItemClick : onClick}
      aria-disabled={loading || button['aria-disabled'] || undefined}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  );
};
