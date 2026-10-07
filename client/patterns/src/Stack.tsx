/**
 * Lays its children out in a flex row or column and sets the space between them, so siblings never
 * space themselves with margins. Spacing reads the --admin-gap-* scale. `as` renders the stack as the
 * element that already groups the children (a list, fieldset or section) instead of adding a wrapper div.
 *
 * Unlike the dashboard pattern library's Stack it does not force full width: a column already fills its
 * container in normal flow, and a stack that is itself a flex item has to keep its content width.
 */
import * as React from 'react';

export type StackSpacing = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export interface StackProps extends Omit<React.AllHTMLAttributes<HTMLElement>, 'as' | 'wrap'> {
  as?: React.ElementType;
  direction?: 'column' | 'row';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  spacing?: StackSpacing;
  wrap?: boolean;
  children?: React.ReactNode;
}

export const Stack = React.forwardRef<HTMLElement, StackProps>(
  ({ as: Element = 'div', direction = 'column', align = 'stretch', justify = 'start', spacing, wrap = true, className, children, ...rest }, ref) => {
    const classes = [
      'admin-stack',
      direction !== 'column' && `admin-stack--${direction}`,
      align !== 'stretch' && `admin-stack--align-${align}`,
      justify !== 'start' && `admin-stack--justify-${justify}`,
      spacing && `admin-stack--gap-${spacing}`,
      !wrap && 'admin-stack--nowrap',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Element {...rest} ref={ref} className={classes}>
        {children}
      </Element>
    );
  },
);

Stack.displayName = 'Stack';
