/**
 * The icon and its spoken name for each message type, shared by Toast and Alert so the two draw a type
 * the same way
 */
import type * as React from 'react';
import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from './icons';
import type { IconProps } from './icons';

export type StatusType = 'info' | 'success' | 'warning' | 'error';

export const statusIcons: Record<StatusType, { Icon: React.ComponentType<IconProps>; label: string }> = {
  info: { Icon: InfoIcon, label: 'Information' },
  success: { Icon: SuccessIcon, label: 'Success' },
  warning: { Icon: WarningIcon, label: 'Warning' },
  error: { Icon: ErrorIcon, label: 'Error' },
};
