/**
 * The field props contract: what a field component receives, whoever renders it. A form renderer, a
 * settings panel or a test can all supply these props; nothing here assumes where a field's
 * description came from or how its value is stored and posted.
 */
import type { ReactNode } from 'react';

export interface ChoiceOption {
  value: string | number;
  title: string;
  disabled?: boolean;
}

export interface FieldDescriptor {
  id: string;
  name: string;
  /** The id of the element wrapping label, control and messages */
  holderId?: string;
  title?: string | number | boolean | null;
  description?: string | null;
  readOnly: boolean;
  disabled: boolean;
  /** Choices for select, radio and checkbox-set fields */
  source: ReadonlyArray<ChoiceOption>;
  /** Nested fields of a group, tab set or tab */
  children: ReadonlyArray<FieldDescriptor>;
  maxLength?: number | null;
  /** Label of an empty first choice in a select; absent when the field has none */
  emptyOption?: string | null;
  headingLevel?: number | null;
  /** Marks the main action among several buttons */
  primary?: boolean;
  /** An action's icon by name, such as `tick` or `rocket`; FormAction draws the ones it knows */
  icon?: string | null;
  /** Accessible name for a button that has no visible title, such as a popover's toggle */
  buttonLabel?: string | null;
  panelTitle?: string | null;
  placement?: 'top' | 'bottom' | null;
}

export interface FieldProps<V = unknown, F extends FieldDescriptor = FieldDescriptor> {
  field: F;
  value: V;
  onChange(value: V): void;
  onBlur(): void;
  error?: string;
  /** True while the surrounding form is submitting; actions disable themselves */
  submitting: boolean;
  /** Renders nested fields; groups and tabs call it with their children */
  renderFields(fields: F['children']): ReactNode;
}
