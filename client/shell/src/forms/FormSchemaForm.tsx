/**
 * Renders a FormSchema form in the shell: loads schema and state, binds every value field to
 * react-hook-form, renders the field tree through the component registry, and posts back the way the
 * legacy FormBuilder does (urlencoded values plus the pressed action). The form library stays inside
 * this file and FormFieldSlot; field components only see FieldComponentProps.
 *
 * A form whose state asks for notifyUnsavedChanges reports its dirty state to the shell's unsaved-changes
 * registry. The schema is a server cache read keyed `['schema', schemaUrl]`. A successful save announces
 * the response's record as records-changed, which refetches every schema on screen, because actions
 * change with the record (publish adds unpublish); the save waits for this form's refetch, and a refetch
 * resets the values only while the form is clean. Focus then goes back to the pressed action, which was
 * disabled while saving.
 * A server error on a field in a hidden tab asks the tabs to reveal it before the field is focused.
 *
 * The form runs the shell's hooks: `updateFormSchema` over the schema as loaded and refetched,
 * `updateFieldProps` for each field it renders, `onBeforeFormAction` when an action button is pressed,
 * `updateFormValidation` (the shell's own required check first) before every post, then
 * `onBeforeFormSubmit`, which can cancel it, and `onAfterFormSubmit` once the server answers. A headless form (a block's form inside the page form) renders no form element and no
 * action bar, so it never nests a form; its host posts it through `handleRef`, and Enter in one of its
 * inputs posts it (when dirty) instead of submitting the outer form.
 *
 * Each top-level field and message sits in a `shell-form__field` wrapper that carries the content inset,
 * so a field whose registered component declares `fullWidth` (the GridField) and the action bar reach
 * the edges of the content column. A headless form is already inside an inset field, so it adds none.
 *
 * When the section header carries a preview URL and the viewport has room for it, the bar ends with
 * Share and the preview mode menu. In split and preview modes the host's preview controls (the pages
 * section's draft and published toggle) come first; edit mode leaves them out, as the design does. In
 * preview mode the content is hidden, so the bar's right-hand group alone draws at the foot of the
 * preview pane, through a portal.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useController, useForm } from 'react-hook-form';
import { useGlobalStateContext } from 'piral-core';
import { useSectionHeader } from '../header/state';
import { useMeasuredHeight } from '../measure';
import { usePreviewBarSlot } from '../preview/barSlot';
import { usePreviewMode } from '../preview/mode';
import { PreviewModeMenu } from '../preview/PreviewModeMenu';
import { setUnsavedChanges, shellOwner } from '../unsaved';
import { announceRecords, refetchShellServerQuery, useShellServerQuery } from '../state/serverCache';
import type { ServerQueryResult } from '../state/serverCache';
import { revealField, Stack } from '@silverstripe/admin-patterns';
import { runAfterHook, runBeforeHook, runUpdateHook, useUpdateHook } from '../hooks/registry';
import type { FormValidationErrors } from '../hooks/types';
import { FormRenderContext, useFormRenderContext } from './context';
import { useFieldComponent, useFullWidthField } from './useFieldComponent';
import {
  barActions,
  collectValueFields,
  dialogActions,
  defaultValues,
  encodeSubmission,
  errorField,
  fetchFormSchema,
  fieldKey,
  mergeFields,
  withoutFields,
  submitFormSchema,
  uniqueMessages,
} from './schema';
import type { FormValues } from './schema';
import type {
  FieldComponentProps,
  FormField,
  FormSchemaFormHandle,
  FormSchemaResponse,
  FormSchemaState,
  FormSchemaSubmitResult,
  FormSchemaTree,
  SchemaMessage,
} from './types';
import './form.css';

export interface FormSchemaFormProps {
  schemaUrl: string;
  onSubmitted?(response: FormSchemaResponse, action: FormField): void;
  /** Called with the loaded state and again whenever a save replaces it, so a host can show record values such as the title */
  onStateChange?(state: FormSchemaState): void;
  /** Field names left out of the form, for a host that shows them itself; an omitted field posts nothing */
  omitFields?: ReadonlyArray<string>;
  /** Replaces the default notice when the schema cannot be loaded; the error is a FormSchemaRequestError for an HTTP failure */
  renderLoadError?(error: unknown): React.ReactNode;
  /** Reports unsaved changes even when the form state does not ask to, as legacy change tracking did for every CMS edit form */
  trackUnsavedChanges?: boolean;
  /** Controls for what the preview shows, such as the draft and published toggle; drawn before Share in split and preview modes only */
  previewControls?: React.ReactNode;
  /** Called with each loaded response, the first and every refetch, for a host that shows what the endpoint sends beside the form */
  onLoad?(response: FormSchemaResponse): void;
  /** Asked before an action is submitted; false cancels it, as the legacy delete confirmation did */
  confirmAction?(action: FormField): boolean | Promise<boolean>;
  /** Renders the fields with no form element or action bar, for a form inside another form; post it through `handleRef` */
  headless?: boolean;
  /** Receives the handle that posts the form */
  handleRef?: React.Ref<FormSchemaFormHandle>;
  onDirtyChange?(dirty: boolean): void;
  /** Receives the actions as one row of buttons whenever they change, for a headless form whose host draws them */
  onActionsChange?(actions: Array<FormField>): void;
  /** The action being posted, then null once it settles, whether a button or Enter posted it */
  onSubmittingChange?(action: string | null): void;
}

const noop = () => undefined;

const noFields: ReadonlyArray<string> = [];

const goodMessageTypes = new Set(['good', 'success']);

const BoundField = ({
  field,
  Component,
}: { field: FormField; Component: React.ComponentType<FieldComponentProps<any>> }) => {
  const { control, submitting, renderFields, autofill, formId, schema } = useFormRenderContext();
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
  const { submitting, renderFields, boundKeys, autofill, formId, schema } = useFormRenderContext();
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

const renderFields = (fields: Array<FormField>) => fields.map((field) => <FormFieldSlot key={field.id} field={field} />);

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

const renderTopLevelFields = (fields: Array<FormField>) =>
  fields.map((field) => (isHidden(field) ? <FormFieldSlot key={field.id} field={field} /> : <TopLevelField key={field.id} field={field} />));

function findAction(actions: Array<FormField>, name: string | undefined): FormField | undefined {
  for (const action of actions) {
    const found = action.name === name ? action : findAction(action.children, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

interface LoadedFormProps extends FormSchemaFormProps {
  initialSchema: FormSchemaTree;
  initialState: FormSchemaState;
  /** The cached schema response, which changes when the cache refetches it */
  latest: FormSchemaResponse;
}

const schemaKey = (schemaUrl: string) => ['schema', schemaUrl] as const;

function focusById(id: string | undefined): void {
  const element = id ? document.getElementById(id) : null;
  if (element && (document.activeElement === null || document.activeElement === document.body)) {
    element.focus();
  }
}

const focusable = 'input:not([type="hidden"]), select, textarea, button, [tabindex]';

// Enter in these does not submit a form
const buttonInputTypes = new Set(['button', 'submit', 'reset', 'image']);

/** The messages an `updateFormValidation` run left, as the server's errors are shaped */
function validationMessages(errors: FormValidationErrors): Array<SchemaMessage> {
  return Object.entries(errors).flatMap(([field, messages]) => messages.map((value) => ({ type: 'error', value, field })));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The element to focus for a field: its control, or for a group such as radios the checked or first control */
function fieldFocusTarget(field: FormField): HTMLElement | null {
  const element = document.getElementById(field.id) ?? (field.holderId ? document.getElementById(field.holderId) : null);
  if (!element || element.matches(focusable)) {
    return element;
  }
  return element.querySelector<HTMLElement>('input:checked') ?? element.querySelector<HTMLElement>(focusable) ?? element;
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
}: LoadedFormProps) => {
  const [loadedSchema, setSchema] = React.useState(initialSchema);
  // From the schema as loaded, so a hook changing attributes cannot rename the form under its fields
  const formId = String(loadedSchema.attributes.id ?? loadedSchema.id);
  const updateFormSchema = useUpdateHook('updateFormSchema');
  const schema = React.useMemo(() => updateFormSchema(loadedSchema, { formId }), [updateFormSchema, loadedSchema, formId]);
  const [state, setState] = React.useState(initialState);
  const stateListener = React.useRef(onStateChange);
  stateListener.current = onStateChange;
  React.useEffect(() => stateListener.current?.(state), [state]);
  const [formMessages, setFormMessages] = React.useState<Array<SchemaMessage>>(initialState.messages ?? []);
  const fields = React.useMemo(() => withoutFields(mergeFields(schema.fields, state), omitFields), [schema, state, omitFields]);
  const actions = React.useMemo(() => mergeFields(schema.actions, state), [schema, state]);
  const valueFields = React.useMemo(() => collectValueFields(fields), [fields]);
  const { clearErrors, control, getValues, handleSubmit, reset, setError, setValue, formState } = useForm<FormValues>({
    defaultValues: defaultValues(valueFields),
  });
  const isDirty = React.useRef(false);
  isDirty.current = formState.isDirty;
  const barRef = useMeasuredHeight<HTMLDivElement>('--shell-form-actions-offset');
  const preview = useSectionHeader()?.header.preview;
  const { mode, available } = usePreviewMode();
  const offersPreview = Boolean(preview) && available;
  const previewBarSlot = usePreviewBarSlot();
  const dirtyListener = React.useRef(onDirtyChange);
  dirtyListener.current = onDirtyChange;
  React.useEffect(() => dirtyListener.current?.(formState.isDirty), [formState.isDirty]);

  const globalState = useGlobalStateContext();
  const notifyUnsavedChanges = Boolean(trackUnsavedChanges || (state.notifyUnsavedChanges ?? initialState.notifyUnsavedChanges));
  React.useEffect(() => {
    if (!notifyUnsavedChanges) {
      return undefined;
    }
    return setUnsavedChanges(globalState, shellOwner, `form:${schema.id}`, formState.isDirty);
  }, [globalState, notifyUnsavedChanges, schema.id, formState.isDirty]);

  const applied = React.useRef(latest);
  React.useEffect(() => {
    if (latest === applied.current || !latest.schema) {
      return;
    }
    applied.current = latest;
    setSchema(latest.schema);
    if (latest.state && !isDirty.current) {
      setState(latest.state);
      const freshFields = runUpdateHook('updateFormSchema', latest.schema, { formId }).fields;
      reset(defaultValues(collectValueFields(mergeFields(freshFields, latest.state))));
    }
  }, [latest, formId, reset]);
  const refetchSchema = () => refetchShellServerQuery(schemaKey(schemaUrl));

  const submittingListener = React.useRef(onSubmittingChange);
  submittingListener.current = onSubmittingChange;
  const submit = async (actionName: string, focusedId: string | undefined): Promise<FormSchemaSubmitResult> => {
    submittingListener.current?.(actionName);
    try {
      return await post(actionName, focusedId);
    } finally {
      submittingListener.current?.(null);
    }
  };

  /** Writes into the form whatever `updateFormValues` handlers change, so validation and the post see it */
  const flushPendingValues = (actionName: string) => {
    const current = getValues();
    const byName = Object.fromEntries(valueFields.map((field) => [field.name, current[field.key]]));
    const updated = runUpdateHook('updateFormValues', byName, { formId, action: actionName });
    for (const field of valueFields) {
      if (field.name in updated && updated[field.name] !== current[field.key]) {
        setValue(field.key, updated[field.name], { shouldDirty: true });
      }
    }
  };

  /** Marks the fields the errors name, shows the rest with `messages` above the form, and focuses the first invalid field */
  const showErrors = (errors: Array<SchemaMessage>, messages: Array<SchemaMessage>) => {
    const fieldErrors = errors.flatMap((error) => {
      const field = errorField(valueFields, error.field);
      return field ? [{ error, field }] : [];
    });
    for (const { error, field } of fieldErrors) {
      setError(field.key, { type: 'server', message: error.value });
    }
    const inlineErrors = fieldErrors.map(({ error }) => error);
    setFormMessages(uniqueMessages([...errors.filter((error) => !inlineErrors.includes(error)), ...messages], inlineErrors));
    const firstInvalid = fieldErrors[0]?.field;
    const invalidElement = firstInvalid ? fieldFocusTarget(firstInvalid) : null;
    if (invalidElement) {
      revealField(invalidElement);
      invalidElement.focus();
    }
  };

  const post = async (actionName: string, focusedId: string | undefined): Promise<FormSchemaSubmitResult> => {
    setFormMessages([]);
    let response: FormSchemaResponse;
    let values: FormValues;
    try {
      flushPendingValues(actionName);
      const invalid = validationMessages(runUpdateHook('updateFormValidation', {}, { values: getValues(), schema }));
      if (invalid.length > 0) {
        showErrors(invalid, []);
        requestAnimationFrame(() => focusById(focusedId));
        return { ok: false };
      }
      if (!(await runBeforeHook('onBeforeFormSubmit', { formId, action: actionName, values: getValues() }))) {
        requestAnimationFrame(() => focusById(focusedId));
        return { ok: false };
      }
      // A handler may write a field (an editor flushing its content), so post the values as they are now
      values = getValues();
      response = await submitFormSchema(schema, encodeSubmission(valueFields, values, actionName));
    } catch (error) {
      const message = errorMessage(error);
      setFormMessages([{ type: 'error', value: message }]);
      requestAnimationFrame(() => focusById(focusedId));
      return { ok: false, message };
    }

    const errors = response.errors ?? [];
    if (errors.length === 0 && response.state) {
      setState(response.state);
      reset(defaultValues(collectValueFields(mergeFields(schema.fields, response.state))));
    }
    if (errors.length === 0 && !response.state) {
      // A success with no state to load (a deleted record): what was sent is saved, so the form is clean
      reset(values);
    }
    const saved = response.record;
    if (errors.length === 0 && saved) {
      announceRecords(globalState, { recordClass: saved.className, ids: saved.id ? [saved.id] : [] });
    }
    const refetched = errors.length === 0 && !response.deleted ? refetchSchema() : Promise.resolve();

    showErrors(errors, response.state?.messages ?? []);

    const action = findAction(actions, actionName);
    if (errors.length === 0 && action) {
      onSubmitted?.(response, action);
    }
    runAfterHook('onAfterFormSubmit', { formId, action: actionName, response });

    await refetched;
    // The pressed action was disabled while saving, which drops focus to the body
    requestAnimationFrame(() => focusById(focusedId));
    return { ok: errors.length === 0, response };
  };

  // Errors from the last post or client check are set by hand, and handleSubmit would otherwise refuse
  // the next post over them without a word; this post judges the values afresh
  const submitWith = (actionName: string, focusedId?: string) =>
    new Promise<FormSchemaSubmitResult>((resolve) => {
      clearErrors();
      handleSubmit(
        () => submit(actionName, focusedId).then(resolve, (error) => resolve({ ok: false, message: errorMessage(error) })),
        () => resolve({ ok: false }),
      )();
    });
  const latestSubmit = React.useRef(submitWith);
  latestSubmit.current = submitWith;
  const defaultAction = actions[0]?.name || 'action_save';
  const latestDefaultAction = React.useRef(defaultAction);
  latestDefaultAction.current = defaultAction;
  React.useImperativeHandle(
    handleRef,
    () => ({
      submit: (action) => latestSubmit.current(action ?? latestDefaultAction.current),
      isDirty: () => isDirty.current,
    }),
    [],
  );

  // A headless form sits inside another form, whose implicit submission Enter would trigger
  const onHeadlessKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      !(target instanceof HTMLInputElement) ||
      buttonInputTypes.has(target.type)
    ) {
      return;
    }
    event.preventDefault();
    if (isDirty.current) {
      submitWith(defaultAction, target.id);
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const actionName = submitter?.name || 'action_save';
    const focusedId = document.activeElement?.id || submitter?.id;
    const submitValues = () => {
      clearErrors();
      return handleSubmit(() => submit(actionName, focusedId))();
    };
    const action = confirmAction && findAction(actions, actionName);
    event.preventDefault();
    const confirmed = async () =>
      (await runBeforeHook('onBeforeFormAction', { formId, action: actionName })) && (!action || (await confirmAction(action)));
    return confirmed().then(
      (go) => (go ? submitValues() : undefined),
      (error) => setFormMessages([{ type: 'error', value: errorMessage(error) }]),
    );
  };

  const shownActions = React.useMemo(() => barActions(actions, formState.isDirty), [actions, formState.isDirty]);
  const actionsListener = React.useRef(onActionsChange);
  actionsListener.current = onActionsChange;
  React.useEffect(() => actionsListener.current?.(dialogActions(actions, formState.isDirty)), [actions, formState.isDirty]);

  const context = React.useMemo(() => {
    const boundKeys = new Set(valueFields.map((field) => field.key));
    return {
      formId,
      schema,
      control,
      submitting: formState.isSubmitting,
      dirty: formState.isDirty,
      boundKeys,
      renderFields,
      autofill(name: string, value: unknown) {
        const key = fieldKey(name);
        if (boundKeys.has(key)) {
          setValue(key, value, { shouldDirty: true });
        }
      },
    };
  }, [formId, schema, control, formState.isSubmitting, formState.isDirty, valueFields, setValue]);

  const messages = formMessages.map((message, index) => (
    <div className="shell-form__field" key={index}>
      {goodMessageTypes.has(message.type) ? (
        <p className="shell-form__alert shell-form__alert--good" role="status">
          {message.value}
        </p>
      ) : (
        <p className="shell-form__alert" role="alert">
          {message.value}
        </p>
      )}
    </div>
  ));

  const actionsEndGroup = offersPreview && (
    <div className="shell-form__actions-end">
      {mode !== 'edit' && previewControls}
      <PreviewModeMenu mode={mode} />
    </div>
  );

  if (headless) {
    return (
      <FormRenderContext.Provider value={context}>
        <Stack className="shell-form shell-form--nested" spacing="md" wrap={false} id={formId} aria-busy={formState.isSubmitting} onKeyDown={onHeadlessKeyDown}>
          {messages}
          {renderTopLevelFields(fields)}
        </Stack>
      </FormRenderContext.Provider>
    );
  }

  return (
    <FormRenderContext.Provider value={context}>
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
        {messages}
        {renderTopLevelFields(fields)}
        {offersPreview && mode === 'preview' ? (
          previewBarSlot && createPortal(<div className="shell-form__actions">{actionsEndGroup}</div>, previewBarSlot)
        ) : (
          <div className="shell-form__actions" ref={barRef}>
            {renderFields(shownActions)}
            {actionsEndGroup}
          </div>
        )}
      </Stack>
    </FormRenderContext.Provider>
  );
};

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown; message: string }
  | { status: 'ready'; response: FormSchemaResponse; schema: FormSchemaTree; state: FormSchemaState };

/** Cached data wins over a failed refetch, so a form on screen stays there */
function loadState(query: ServerQueryResult<FormSchemaResponse>): LoadState {
  const response = query.data;
  if (response?.schema && response.state) {
    return { status: 'ready', response, schema: response.schema, state: response.state };
  }
  if (response) {
    return { status: 'failed', error: new Error('The form endpoint sent no schema or state'), message: 'The form endpoint sent no schema or state' };
  }
  if (query.error) {
    return { status: 'failed', error: query.error, message: query.error.message };
  }
  return { status: 'loading' };
}

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
}: FormSchemaFormProps) => {
  const query = useShellServerQuery(schemaKey(schemaUrl), ({ signal }) => fetchFormSchema(schemaUrl, signal));
  const load = loadState(query);
  const loadListener = React.useRef(onLoad);
  loadListener.current = onLoad;
  const loaded = load.status === 'ready' ? load.response : null;

  React.useEffect(() => {
    if (loaded) {
      loadListener.current?.(loaded);
    }
  }, [loaded]);

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
    />
  );
};
