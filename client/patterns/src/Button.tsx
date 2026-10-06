/**
 * The admin button, after the CMS Refresh design's three button styles: primary (solid green),
 * secondary (green outline on white, the default) and tertiary (white with a grey label, the design's
 * "white buttons").
 * The design has no destructive style, so there is no danger variant yet.
 *
 * Renders a `<button type="button">`, or an `<a>` when given `href`. An icon-only button needs a name:
 * `aria-label`, or children kept as visually hidden text; the type requires one and dev builds warn
 * when it is empty. `loading` marks the button busy and `aria-disabled` without the disabled attribute,
 * so it keeps focus, and swallows clicks. An anchor cannot be disabled, so a disabled or loading link
 * drops its `href`, leaves the tab order, says so with `aria-disabled` and swallows clicks.
 */
import * as React from 'react';
import { IconLabel } from './IconLabel';
import type { IconPosition } from './IconLabel';

// The bundler replaces this, as it does for React's own development checks
declare const process: { env: { NODE_ENV?: string } };

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  loading?: boolean;
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

function buttonClassName(variant: ButtonVariant, iconOnly: boolean, className?: string): string {
  return ['admin-button', variant !== 'secondary' && `admin-button--${variant}`, iconOnly && 'admin-button--icon-only', className]
    .filter(Boolean)
    .join(' ');
}

function hasText(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => typeof child !== 'string' || child.trim() !== '');
}

function swallow(event: React.MouseEvent) {
  event.preventDefault();
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (
    { variant = 'secondary', icon, iconPosition = 'start', iconOnly = false, loading = false, className, children, 'aria-label': label, ...rest },
    ref,
  ) => {
    const classes = buttonClassName(variant, iconOnly, className);
    if (process.env.NODE_ENV !== 'production' && iconOnly && !label?.trim() && !hasText(children)) {
      console.warn('An icon-only Button needs an aria-label or text children to name it');
    }
    const content = (
      <IconLabel icon={icon} iconPosition={iconPosition}>
        {hasText(children) && <span className={iconOnly ? 'admin-button__label--hidden' : undefined}>{children}</span>}
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
    return (
      <button
        type={type}
        {...button}
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        aria-label={label}
        disabled={disabled}
        onClick={loading ? swallow : onClick}
        aria-disabled={loading || button['aria-disabled'] || undefined}
        aria-busy={loading || undefined}
      >
        {content}
      </button>
    );
  },
);

Button.displayName = 'Button';
