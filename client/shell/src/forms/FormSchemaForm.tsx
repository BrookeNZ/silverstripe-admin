/**
 * Renders a FormSchema form in the shell: loads schema and state, binds every value field to
 * react-hook-form, renders the field tree through the component registry, and posts it back. The form
 * library stays inside this folder's form modules; field components only see FieldComponentProps.
 *
 * This file composes the pieces: the schema read and refetch (useSchemaLoad), the post and its hooks
 * (useFormSubmission), the headless handle (useFormHandle), unsaved-changes registration, the field
 * slots, the messages and the action bar. A refetch resets the values only while the form is clean.
 * `updateFormSchema` runs over the schema as loaded and refetched.
 *
 * A form whose state asks for notifyUnsavedChanges reports its dirty state to the shell's unsaved-changes
 * registry. A headless form (a block's form inside the page form) renders no form element and no
 * action bar, so it never nests a form; its host posts it through `handleRef`. A headless form is
 * already inside an inset field, so it adds no inset of its own.
 */
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Stack } from '@silverstripe/admin-patterns';
import { runUpdateHook, useUpdateHook } from '../hooks/registry';
import { FormDirtyContext, FormRenderContext, FormSubmittingContext } from './context';
import { barActions, collectValueFields, dialogActions, defaultValues, fieldKey, mergeFields, withoutFields } from './schema';
import type { FormValues } from './schema';
import { renderFields, renderTopLevelFields } from './FormFieldSlot';
import { FormMessages } from './FormMessages';
import { ActionBar } from './ActionBar';
import { useRefetchedResponse, useSchemaLoad } from './useSchemaLoad';
import { useFormSubmission } from './useFormSubmission';
import { useFormHandle } from './useFormHandle';
import { useUnsavedFormRegistration } from './useUnsavedFormRegistration';
import type { FormField, FormSchemaFormHandle, FormSchemaResponse, FormSchemaState, FormSchemaTree, SchemaMessage } from './types';
import './form.css';

export { FormFieldSlot } from './FormFieldSlot';

export interface FormSchemaFormProps {
  schemaUrl: string;
  onSubmitted?: (response: FormSchemaResponse, action: FormField) => void;
  /** Called with the loaded state and again whenever a save replaces it, so a host can show record values such as the title */
  onStateChange?: (state: FormSchemaState) => void;
  /** Field names left out of the form, for a host that shows them itself; an omitted field posts nothing */
  omitFields?: ReadonlyArray<string>;
  /** Replaces the default notice when the schema cannot be loaded; the error is a FormSchemaRequestError for an HTTP failure */
  renderLoadError?: (error: unknown) => React.ReactNode;
  /** Reports unsaved changes even when the form state does not ask to, as legacy change tracking did for every CMS edit form */
  trackUnsavedChanges?: boolean;
  /** Controls for what the preview shows, such as the draft and published toggle; drawn before Share in split and preview modes only */
  previewControls?: React.ReactNode;
  /** Called with each loaded response, the first and every refetch, for a host that shows what the endpoint sends beside the form */
  onLoad?: (response: FormSchemaResponse) => void;
  /** Asked before an action is submitted; false cancels it, as the legacy delete confirmation did */
  confirmAction?: (action: FormField) => boolean | Promise<boolean>;
  /** Renders the fields with no form element or action bar, for a form inside another form; post it through `handleRef` */
  headless?: boolean;
  /** Receives the handle that posts the form */
  handleRef?: React.Ref<FormSchemaFormHandle>;
  onDirtyChange?: (dirty: boolean) => void;
  /** Receives the actions as one row of buttons whenever they change, for a headless form whose host draws them */
  onActionsChange?: (actions: Array<FormField>) => void;
  /** The action being posted, then null once it settles, whether a button or Enter posted it */
  onSubmittingChange?: (action: string | null) => void;
  /**
   * Takes each good message a post returns instead of the form drawing it, for a host that shows it as
   * a toast; messages that arrive with the schema stay in the form
   */
  onMessage?: (message: SchemaMessage) => void;
}

const noFields: ReadonlyArray<string> = [];

interface LoadedFormProps extends FormSchemaFormProps {
  initialSchema: FormSchemaTree;
  initialState: FormSchemaState;
  /** The cached schema response, which changes when the cache refetches it */
  latest: FormSchemaResponse;
}

const LoadedForm = ({
  schemaUrl,
  initialSchema,
  initialState,
  latest,
  onSubmitted,
  onStateChange,
  omitFields = noFields,
  trackUnsavedChanges,
  previewControls,
  confirmAction,
  headless,
  handleRef,
  onDirtyChange,
  onActionsChange,
  onSubmittingChange,
  onMessage,
}: LoadedFormProps) => {
  const [loadedSchema, setSchema] = React.useState(initialSchema);
  // From the schema as loaded, so a hook changing attributes cannot rename the form under its fields
  const formId = String(loadedSchema.attributes.id ?? loadedSchema.id);
  const updateFormSchema = useUpdateHook('updateFormSchema');
  const schema = React.useMemo(() => updateFormSchema(loadedSchema, { formId }), [updateFormSchema, loadedSchema, formId]);
  const [state, setState] = React.useState(initialState);
  const reportState = React.useEffectEvent((changed: FormSchemaState) => onStateChange?.(changed));
  React.useEffect(() => reportState(state), [state]);
  const fields = React.useMemo(() => withoutFields(mergeFields(schema.fields, state), omitFields), [schema, state, omitFields]);
  const actions = React.useMemo(() => mergeFields(schema.actions, state), [schema, state]);
  const valueFields = React.useMemo(() => collectValueFields(fields), [fields]);
  const form = useForm<FormValues>({
    defaultValues: defaultValues(valueFields),
  });
  const { control, reset, setValue, formState } = form;
  const reportDirty = React.useEffectEvent((dirty: boolean) => onDirtyChange?.(dirty));
  React.useEffect(() => reportDirty(formState.isDirty), [formState.isDirty]);

  const notifyUnsavedChanges = Boolean(trackUnsavedChanges || (state.notifyUnsavedChanges ?? initialState.notifyUnsavedChanges));
  useUnsavedFormRegistration(schema.id, notifyUnsavedChanges, formState.isDirty);

  useRefetchedResponse(latest, (response) => {
    setSchema(response.schema);
    if (response.state && !formState.isDirty) {
      setState(response.state);
      const freshFields = runUpdateHook('updateFormSchema', response.schema, { formId }).fields;
      reset(defaultValues(collectValueFields(mergeFields(freshFields, response.state))));
    }
  });

  const { messages, submitWith, onSubmit } = useFormSubmission({
    form,
    schemaUrl,
    formId,
    schema,
    valueFields,
    actions,
    initialMessages: initialState.messages ?? [],
    onSavedState: setState,
    onSubmitted,
    onSubmittingChange,
    confirmAction,
    onMessage,
  });

  const onHeadlessKeyDown = useFormHandle({ handleRef, submitWith, defaultAction: actions[0]?.name || 'action_save', isDirty: formState.isDirty });

  const shownActions = React.useMemo(() => barActions(actions, formState.isDirty), [actions, formState.isDirty]);
  const reportActions = React.useEffectEvent((shown: Array<FormField>) => onActionsChange?.(shown));
  React.useEffect(() => reportActions(dialogActions(actions, formState.isDirty)), [actions, formState.isDirty]);

  const context = React.useMemo(() => {
    const boundKeys = new Set(valueFields.map((field) => field.key));
    return {
      formId,
      schema,
      control,
      boundKeys,
      renderFields,
      autofill(name: string, value: unknown) {
        const key = fieldKey(name);
        if (boundKeys.has(key)) {
          setValue(key, value, { shouldDirty: true });
        }
      },
    };
  }, [formId, schema, control, valueFields, setValue]);
  // Reused elements let a dirty change skip every field; fields reach submitting through its own context
  const renderedFields = React.useMemo(() => renderTopLevelFields(fields), [fields]);

  const provide = (children: React.ReactNode) => (
    <FormRenderContext value={context}>
      <FormSubmittingContext value={formState.isSubmitting}>
        <FormDirtyContext value={formState.isDirty}>{children}</FormDirtyContext>
      </FormSubmittingContext>
    </FormRenderContext>
  );

  if (headless) {
    return provide(
      <Stack className="shell-form shell-form--nested" spacing="md" wrap={false} id={formId} aria-busy={formState.isSubmitting} onKeyDown={onHeadlessKeyDown}>
        <FormMessages messages={messages} />
        {renderedFields}
      </Stack>,
    );
  }

  return provide(
    <Stack
      as="form"
      className="shell-form"
      spacing="md"
      wrap={false}
      id={formId}
      noValidate
      aria-busy={formState.isSubmitting}
      onSubmit={onSubmit}
    >
      <FormMessages messages={messages} />
      {renderedFields}
      <ActionBar actions={shownActions} previewControls={previewControls} />
    </Stack>,
  );
};

export const FormSchemaForm = ({
  schemaUrl,
  onSubmitted,
  onStateChange,
  omitFields,
  renderLoadError,
  trackUnsavedChanges,
  previewControls,
  onLoad,
  confirmAction,
  headless,
  handleRef,
  onDirtyChange,
  onActionsChange,
  onSubmittingChange,
  onMessage,
}: FormSchemaFormProps) => {
  const load = useSchemaLoad(schemaUrl, onLoad);

  if (load.status !== 'ready') {
    return (
      <div className={headless ? 'shell-form shell-form--nested' : 'shell-form'}>
        <div className="shell-form__field">
          {load.status === 'loading' ? (
            <p className="shell-form__status" role="status">Loading form…</p>
          ) : renderLoadError ? (
            renderLoadError(load.error)
          ) : (
            <p className="shell-form__alert" role="alert">
              The form could not be loaded: {load.message}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <LoadedForm
      key={schemaUrl}
      schemaUrl={schemaUrl}
      initialSchema={load.schema}
      initialState={load.state}
      latest={load.response}
      onSubmitted={onSubmitted}
      onStateChange={onStateChange}
      omitFields={omitFields}
      trackUnsavedChanges={trackUnsavedChanges}
      previewControls={previewControls}
      confirmAction={confirmAction}
      headless={headless}
      handleRef={handleRef}
      onDirtyChange={onDirtyChange}
      onActionsChange={onActionsChange}
      onSubmittingChange={onSubmittingChange}
      onMessage={onMessage}
    />
  );
};
