/**
 * Renders schema fields through the component registry. A field the form posts binds to the form
 * library; any other field gets its schema value and no-op handlers. Either way the component sees
 * only FieldComponentProps, after the `updateFieldProps` hook.
 *
 * Each top-level field sits in a `shell-form__field` wrapper that carries the content inset, so a field
 * whose registered component declares `fullWidth` (the GridField) reaches the edges of the content column.
 */
import * as React from 'react';
import { useController } from 'react-hook-form';
import { useUpdateHook } from '../hooks/registry';
import { FormSubmittingContext, useFormRenderContext } from './context';
import { useFieldComponent, useFullWidthField } from './useFieldComponent';
import type { FieldComponentProps, FormField } from './types';

const noop = () => undefined;

const BoundField = ({
  field,
  Component,
}: { field: FormField; Component: React.ComponentType<FieldComponentProps<any>> }) => {
  const { control, renderFields, autofill, formId, schema } = useFormRenderContext();
  const submitting = React.useContext(FormSubmittingContext);
  const { field: binding, fieldState } = useController({ name: field.key, control });
  const updateFieldProps = useUpdateHook('updateFieldProps');
  const props = updateFieldProps(
    {
      field,
      value: binding.value,
      onChange: binding.onChange,
      onBlur: binding.onBlur,
      error: fieldState.error?.message ?? field.message?.value,
      submitting,
      renderFields,
      autofill,
      formId,
    },
    { field, schema },
  );
  return <Component {...props} />;
};

export const FormFieldSlot = ({ field }: { field: FormField }) => {
  const Component = useFieldComponent(field);
  const { renderFields, boundKeys, autofill, formId, schema } = useFormRenderContext();
  const submitting = React.useContext(FormSubmittingContext);
  const updateFieldProps = useUpdateHook('updateFieldProps');
  if (boundKeys.has(field.key)) {
    return <BoundField field={field} Component={Component} />;
  }
  const props = updateFieldProps(
    { field, value: field.value, onChange: noop, onBlur: noop, error: field.message?.value, submitting, renderFields, autofill, formId },
    { field, schema },
  );
  return <Component {...props} />;
};

export const renderFields = (fields: Array<FormField>) => fields.map((field) => <FormFieldSlot key={field.id} field={field} />);

const TopLevelField = ({ field }: { field: FormField }) => {
  const fullWidth = useFullWidthField(field);
  return (
    <div className={fullWidth ? 'shell-form__field shell-form__field--full' : 'shell-form__field'}>
      <FormFieldSlot field={field} />
    </div>
  );
};

// A hidden input draws no box, so a wrapper round it would be an empty flex item taking a gap
const isHidden = (field: FormField) => field.schemaType === 'Hidden' || field.type === 'hidden';

export const renderTopLevelFields = (fields: Array<FormField>) =>
  fields.map((field) => (isHidden(field) ? <FormFieldSlot key={field.id} field={field} /> : <TopLevelField key={field.id} field={field} />));
