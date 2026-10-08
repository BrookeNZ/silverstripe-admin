/**
 * The frame every icon in the package draws into: an inline SVG in the current text colour, hidden
 * from assistive technology unless it is given a label. Its height is `--admin-icon-size` (the design's
 * 18px global icon), and its width follows the viewBox, so a host resizes it by reassigning the token.
 * `size="sm"` is the 15px icon the design puts in filled and outlined buttons.
 */
import type * as React from 'react';

export type IconSize = 'sm' | 'md';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: IconSize;
  /** Names the icon for a screen reader when it stands alone; omit when visible text says the same */
  label?: string;
}

interface IconFrameProps extends IconProps {
  viewBox: string;
}

export const Icon = ({ size = 'md', label, viewBox, className, children, ...rest }: IconFrameProps) => {
  const [, , width, height] = viewBox.split(' ').map(Number);
  const classes = ['admin-icon', size === 'sm' && 'admin-icon--sm', className].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={(width / height) * 18}
      height={18}
      fill="currentColor"
      focusable="false"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      {...rest}
    >
      {children}
    </svg>
  );
};
