/**
 * The icon slot Button and Link share: the icon before or after the label. The icon draws itself
 * (Icon gives it currentColor, its size token and aria-hidden), and each host spaces it with its own
 * gap token, so a button and a link with the same icon line up alike. Internal to the package.
 */
import * as React from 'react';

export type IconPosition = 'start' | 'end';

export interface IconLabelProps {
  icon?: React.ReactNode;
  iconPosition: IconPosition;
  children?: React.ReactNode;
}

export const IconLabel = ({ icon, iconPosition, children }: IconLabelProps) => (
  <>
    {iconPosition === 'start' && icon}
    {children}
    {iconPosition === 'end' && icon}
  </>
);
