/**
 * The admin button, after the CMS Refresh design's three button styles: primary (filled green),
 * secondary (outlined green, the default) and tertiary (borderless grey, the design's "white buttons").
 * The design has no destructive style, so there is no danger variant yet.
 *
 * Renders a `<button type="button">`, or an `<a>` when given `href`. An icon-only button keeps its
 * text as the accessible name in visually hidden text, so `children` is always required. `loading`
 * disables the button and marks it busy; an anchor cannot be disabled, so a disabled link drops its
 * `href` and says so with `aria-disabled`.
 */
import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  iconOnly?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

type NativeButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { href?: undefined };
type NativeAnchorProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & { href: string; disabled?: boolean };

export type ButtonProps = ButtonOwnProps & (NativeButtonProps | NativeAnchorProps);

function buttonClassName(variant: ButtonVariant, iconOnly: boolean, className?: string): string {
  return ['admin-button', variant !== 'secondary' && `admin-button--${variant}`, iconOnly && 'admin-button--icon-only', className]
    .filter(Boolean)
    .join(' ');
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({ variant = 'secondary', icon, iconPosition = 'start', iconOnly = false, loading = false, className, children, ...rest }, ref) => {
    const classes = buttonClassName(variant, iconOnly, className);
    const content = (
      <>
        {iconPosition === 'start' && icon}
        <span className={iconOnly ? 'admin-button__label--hidden' : undefined}>{children}</span>
        {iconPosition === 'end' && icon}
      </>
    );

    if (rest.href !== undefined) {
      const { href, disabled, ...anchor } = rest as NativeAnchorProps;
      const inert = disabled || loading;
      return (
        <a
          {...anchor}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          href={inert ? undefined : href}
          aria-disabled={inert || undefined}
          aria-busy={loading || undefined}
        >
          {content}
        </a>
      );
    }

    const { type = 'button', disabled, ...button } = rest as NativeButtonProps;
    return (
      <button
        type={type}
        {...button}
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {content}
      </button>
    );
  },
);

Button.displayName = 'Button';
