/**
 * An inline message box that stays where it is drawn: a form's errors, warnings and notes, a dialog's
 * failure. It has no close button, as legacy's form alerts had none. The icon carries the type in its
 * shape and its spoken name.
 *
 * Errors and warnings are `role="alert"`, success and information `role="status"`. Something that just
 * happened and then goes away is a Toast instead. The design has no alert
 */
import type * as React from 'react';
import { statusIcons } from './statusIcons';
import type { StatusType } from './statusIcons';

export type AlertType = StatusType;

export interface AlertProps {
  children: React.ReactNode;
  type?: AlertType;
  className?: string;
  id?: string;
}

const statusTypes: ReadonlySet<AlertType> = new Set(['info', 'success']);

export const Alert = ({ children, type = 'info', className, id }: AlertProps) => {
  const { Icon, label } = statusIcons[type];
  const classes = ['admin-alert', `admin-alert--${type}`, className].filter(Boolean).join(' ');
  return (
    <div id={id} className={classes} role={statusTypes.has(type) ? 'status' : 'alert'}>
      <Icon className="admin-alert__icon" label={label} />
      <div className="admin-alert__message">{children}</div>
    </div>
  );
};
