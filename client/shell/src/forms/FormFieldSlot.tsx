/**
 * Renders schema fields through the component registry. A field the form posts binds to the form
 * library; any other field gets its schema value and no-op handlers. Either way the component sees
 * only FieldComponentProps, after the `updateFieldProps` hook.
 *
 * Each top-level field sits in a `shell-form__field` wrapper; the field holder inside carries the content
 * inset, so a field whose registered component declares `fullWidth` (the GridField) reaches the edges.
 * A top-level tab set (every CMS edit form's Root) spans the column too, insets its tab strip, and lays
 * out each panel's fields by these same top-level rules, so a GridField inside a tab reaches the edges
 * while a text field keeps its inset. A tab set inside a panel is top-level by that rule, so it nests.
 */
import * as React from 'react';
import { useController } from 'react-hook-form';
import { useUpdateHook } from '../hooks/registry';
import { FormSubmittingContext, useFormRenderContext } from './context';
import { useFieldComponent, useFullWidthField } from './useFieldComponent';
import type { FieldComponentProps, FormField } from './types';

const noop = () => undefined;

type RenderFields = FieldComponentProps['renderFields'];

const BoundField = ({
  field,
  Component,
  renderFields,
}: { field: FormField; Component: React.ComponentType<FieldComponentProps>; renderFields: RenderFields }) => {
  const { control, autofill, formId, schema } = useFormRenderContext();
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

/** `renderChildren` replaces the form's `renderFields` for this field's children only */
export const FormFieldSlot = ({ field, renderChildren }: { field: FormField; renderChildren?: RenderFields }) => {
  const Component = useFieldComponent(field);
  const context = useFormRenderContext();
  const { boundKeys, autofill, formId, schema } = context;
  const renderFields = renderChildren ?? context.renderFields;
  const submitting = React.useContext(FormSubmittingContext);
  const updateFieldProps = useUpdateHook('updateFieldProps');
  if (boundKeys.has(field.key)) {
    return <BoundField field={field} Component={Component} renderFields={renderFields} />;
  }
  const props = updateFieldProps(
    { field, value: field.value, onChange: noop, onBlur: noop, error: field.message?.value, submitting, renderFields, autofill, formId },
    { field, schema },
  );
  return <Component {...props} />;
};

export const renderFields = (fields: ReadonlyArray<FormField>) => fields.map((field) => <FormFieldSlot key={field.id} field={field} />);

// Tabs renders each panel by passing its TabItem to renderFields, so the TabItem's children are the panel's fields
const renderTabPanels = (tabs: ReadonlyArray<FormField>) =>
  tabs.map((tab) => <FormFieldSlot key={tab.id} field={tab} renderChildren={renderTopLevelFields} />);

const isTabSet = (field: FormField) => field.component === 'Tabs';

const TopLevelField = ({ field }: { field: FormField }) => {
  const fullWidth = useFullWidthField(field);
  if (isTabSet(field)) {
    return (
      <div className="shell-form__field shell-form__field--tabs">
        <FormFieldSlot field={field} renderChildren={renderTabPanels} />
      </div>
    );
  }
  return (
    <div className={fullWidth ? 'shell-form__field shell-form__field--full' : 'shell-form__field'}>
      <FormFieldSlot field={field} />
    </div>
  );
};

// A hidden input draws no box, so a wrapper round it would be an empty flex item taking a gap
const isHidden = (field: FormField) => field.schemaType === 'Hidden' || field.type === 'hidden';

export const renderTopLevelFields = (fields: ReadonlyArray<FormField>) =>
  fields.map((field) => (isHidden(field) ? <FormFieldSlot key={field.id} field={field} /> : <TopLevelField key={field.id} field={field} />));
