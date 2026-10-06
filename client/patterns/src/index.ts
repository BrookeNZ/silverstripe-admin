/**
 * Presentational components for the Silverstripe CMS admin shell and its pilets. They know about
 * values, labels, errors and focus, and nothing about FormSchema, component registries or how a form
 * posts. The shell shares this package with pilets through its import map, so a pilet imports it by name
 * and gets the shell's copy at runtime; its major version is part of the Pilet API major.
 *
 * Styles ship as a separate stylesheet (`@silverstripe/admin-patterns/styles.css`) that the shell
 * loads once, so pilets never bundle a second copy.
 */
export type { ChoiceOption, FieldDescriptor, FieldProps } from './types';
export { describedBy, FieldHolder, fieldTitle } from './FieldHolder';
export type { FieldHolderProps } from './FieldHolder';
export { CheckboxField, DatetimeField, HiddenField, OptionsetField, ReadonlyField, SingleSelectField, TextField } from './inputs';
export { CompositeField, FieldGroup, HeaderField, LiteralField, TabItem, Tabs } from './structure';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';
export * from './icons';
export { FormAction } from './FormAction';
export { PopoverField } from './PopoverField';
export { UnsavedChangesIndicator, unsavedChangesLevel } from './UnsavedChangesIndicator';
export type { UnsavedChangesIndicatorProps, UnsavedChangesLevel, UnsavedChangesMinutes } from './UnsavedChangesIndicator';
export { UnsavedChangesDialog } from './UnsavedChangesDialog';
export type { UnsavedChangesDialogProps } from './UnsavedChangesDialog';
export { revealField, revealFieldEvent } from './reveal';
