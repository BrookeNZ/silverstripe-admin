/**
 * Renders a FormSchema form in the shell: loads schema and state, binds every value field to
 * react-hook-form, renders the field tree through the component registry, and posts back the way the
 * legacy FormBuilder does (urlencoded values plus the pressed action). The form library stays inside
 * this file and FormFieldSlot; field components only see FieldComponentProps.
 *
 * A form whose state asks for notifyUnsavedChanges reports its dirty state to the shell's unsaved-changes
 * registry. After a successful save the schema is fetched again, because actions change with the record
 * (publish adds unpublish), and focus goes back to the pressed action, which was disabled while saving.
 * A server error on a field in a hidden tab asks the tabs to reveal it before the field is focused.
 *
 * Handlers registered with `registerBeforeSubmit` for the form's element id run before every post and
 * can cancel it. A headless form (a block's form inside the page form) renders no form element and no
 * action bar, so it never nests a form; its host posts it through `handleRef`, and Enter in one of its
 * inputs posts it (when dirty) instead of submitting the outer form.
 */
import * as React from 'react';
import { useController, useForm } from 'react-hook-form';
import { useGlobalStateContext } from 'piral-core';
import { useMeasuredHeight } from '../measure';
import { setUnsavedChanges, shellOwner } from '../unsaved';
import { revealField } from '@silverstripe/admin-patterns';
import { runBeforeSubmit } from './beforeSubmit';
import { FormRenderContext, useFormRenderContext } from './context';
import { useFieldComponent } from './useFieldComponent';
import {
  barActions,
  collectValueFields,
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
  /** Controls the host adds to the right-hand end of the action bar, such as the draft and published toggle */
  actionsEnd?: React.ReactNode;
  /** Called with the loaded response, for a host that shows what the endpoint sends beside the form */
  onLoad?(response: FormSchemaResponse): void;
  /** Asked before an action is submitted; false cancels it, as the legacy delete confirmation did */
  confirmAction?(action: FormField): boolean | Promise<boolean>;
  /** Renders the fields with no form element or action bar, for a form inside another form; post it through `handleRef` */
  headless?: boolean;
  /** Receives the handle that posts the form */
  handleRef?: React.Ref<FormSchemaFormHandle>;
  onDirtyChange?(dirty: boolean): void;
}

const noop = () => undefined;

const noFields: ReadonlyArray<string> = [];

const goodMessageTypes = new Set(['good', 'success']);

const BoundField = ({
  field,
  Component,
}: { field: FormField; Component: React.ComponentType<FieldComponentProps<any>> }) => {
  const { control, submitting, renderFields, autofill, formId } = useFormRenderContext();
  const { field: binding, fieldState } = useController({ name: field.key, control });
  return (
    <Component
      field={field}
      value={binding.value}
      onChange={binding.onChange}
      onBlur={binding.onBlur}
      error={fieldState.error?.message ?? field.message?.value}
      submitting={submitting}
      renderFields={renderFields}
      autofill={autofill}
      formId={formId}
    />
  );
};

export const FormFieldSlot = ({ field }: { field: FormField }) => {
  const Component = useFieldComponent(field);
  const { submitting, renderFields, boundKeys, autofill, formId } = useFormRenderContext();
  if (boundKeys.has(field.key)) {
    return <BoundField field={field} Component={Component} />;
  }
  return (
    <Component
      field={field}
      value={field.value}
      onChange={noop}
      onBlur={noop}
      error={field.message?.value}
      submitting={submitting}
      renderFields={renderFields}
      autofill={autofill}
      formId={formId}
    />
  );
};

const renderFields = (fields: Array<FormField>) => fields.map((field) => <FormFieldSlot key={field.id} field={field} />);

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
}

function focusById(id: string | undefined): void {
  const element = id ? document.getElementById(id) : null;
  if (element && (document.activeElement === null || document.activeElement === document.body)) {
    element.focus();
  }
}

const focusable = 'input:not([type="hidden"]), select, textarea, button, [tabindex]';

// Enter in these does not submit a form
const buttonInputTypes = new Set(['button', 'submit', 'reset', 'image']);

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
  onSubmitted,
  onStateChange,
  omitFields = noFields,
  trackUnsavedChanges,
  actionsEnd,
  confirmAction,
  headless,
  handleRef,
  onDirtyChange,
}: LoadedFormProps) => {
  const [schema, setSchema] = React.useState(initialSchema);
  const [state, setState] = React.useState(initialState);
  const stateListener = React.useRef(onStateChange);
  stateListener.current = onStateChange;
  React.useEffect(() => stateListener.current?.(state), [state]);
  const [formMessages, setFormMessages] = React.useState<Array<SchemaMessage>>(initialState.messages ?? []);
  const fields = React.useMemo(() => withoutFields(mergeFields(schema.fields, state), omitFields), [schema, state, omitFields]);
  const actions = React.useMemo(() => mergeFields(schema.actions, state), [schema, state]);
  const valueFields = React.useMemo(() => collectValueFields(fields), [fields]);
  const { control, handleSubmit, reset, setError, setValue, formState } = useForm<FormValues>({
    defaultValues: defaultValues(valueFields),
  });
  const isDirty = React.useRef(false);
  isDirty.current = formState.isDirty;
  const barRef = useMeasuredHeight<HTMLDivElement>('--shell-form-actions-offset');
  const formId = String(schema.attributes.id ?? schema.id);
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

  const refetchSchema = async () => {
    let fresh: FormSchemaResponse;
    try {
      fresh = await fetchFormSchema(schemaUrl);
    } catch {
      return;
    }
    if (!fresh.schema) {
      return;
    }
    setSchema(fresh.schema);
    if (fresh.state && !isDirty.current) {
      setState(fresh.state);
      reset(defaultValues(collectValueFields(mergeFields(fresh.schema.fields, fresh.state))));
    }
  };

  const submit = async (values: FormValues, actionName: string, focusedId: string | undefined): Promise<FormSchemaSubmitResult> => {
    setFormMessages([]);
    let response: FormSchemaResponse;
    try {
      if (!(await runBeforeSubmit(formId, { action: actionName }))) {
        requestAnimationFrame(() => focusById(focusedId));
        return { ok: false };
      }
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
    const refetched = errors.length === 0 && !response.deleted ? refetchSchema() : Promise.resolve();

    const fieldErrors = errors.flatMap((error) => {
      const field = errorField(valueFields, error.field);
      return field ? [{ error, field }] : [];
    });
    for (const { error, field } of fieldErrors) {
      setError(field.key, { type: 'server', message: error.value });
    }
    const inlineErrors = fieldErrors.map(({ error }) => error);
    setFormMessages(
      uniqueMessages(
        [...errors.filter((error) => !inlineErrors.includes(error)), ...(response.state?.messages ?? [])],
        inlineErrors,
      ),
    );
    const firstInvalid = fieldErrors[0]?.field;
    const invalidElement = firstInvalid ? fieldFocusTarget(firstInvalid) : null;
    if (invalidElement) {
      revealField(invalidElement);
      invalidElement.focus();
    }

    const action = findAction(actions, actionName);
    if (errors.length === 0 && action) {
      onSubmitted?.(response, action);
    }

    await refetched;
    // The pressed action was disabled while saving, which drops focus to the body
    requestAnimationFrame(() => focusById(focusedId));
    return { ok: errors.length === 0, response };
  };

  const submitWith = (actionName: string, focusedId?: string) =>
    new Promise<FormSchemaSubmitResult>((resolve) => {
      handleSubmit(
        (values) => submit(values, actionName, focusedId).then(resolve, (error) => resolve({ ok: false, message: errorMessage(error) })),
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
  const onHeadlessKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const actionName = submitter?.name || 'action_save';
    const focusedId = document.activeElement?.id || submitter?.id;
    const submitValues = handleSubmit((values) => submit(values, actionName, focusedId));
    const action = confirmAction && findAction(actions, actionName);
    if (!action) {
      return submitValues(event);
    }
    event.preventDefault();
    return Promise.resolve(confirmAction(action)).then((confirmed) => (confirmed ? submitValues() : undefined));
  };

  const shownActions = React.useMemo(() => barActions(actions, formState.isDirty), [actions, formState.isDirty]);

  const context = React.useMemo(() => {
    const boundKeys = new Set(valueFields.map((field) => field.key));
    return {
      formId,
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
  }, [formId, control, formState.isSubmitting, formState.isDirty, valueFields, setValue]);

  const messages = formMessages.map((message, index) =>
    goodMessageTypes.has(message.type) ? (
      <p className="shell-form__alert shell-form__alert--good" role="status" key={index}>
        {message.value}
      </p>
    ) : (
      <p className="shell-form__alert" role="alert" key={index}>
        {message.value}
      </p>
    ),
  );

  if (headless) {
    return (
      <FormRenderContext.Provider value={context}>
        <div className="shell-form" id={formId} aria-busy={formState.isSubmitting} onKeyDown={onHeadlessKeyDown}>
          {messages}
          {renderFields(fields)}
        </div>
      </FormRenderContext.Provider>
    );
  }

  return (
    <FormRenderContext.Provider value={context}>
      <form
        className="shell-form"
        id={formId}
        noValidate
        aria-busy={formState.isSubmitting}
        onSubmit={onSubmit}
      >
        {messages}
        {renderFields(fields)}
        <div className="shell-form__actions" ref={barRef}>
          {renderFields(shownActions)}
          {actionsEnd && <div className="shell-form__actions-end">{actionsEnd}</div>}
        </div>
      </form>
    </FormRenderContext.Provider>
  );
};

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown; message: string }
  | { status: 'ready'; schema: FormSchemaTree; state: FormSchemaState };

export const FormSchemaForm = ({
  schemaUrl,
  onSubmitted,
  onStateChange,
  omitFields,
  renderLoadError,
  trackUnsavedChanges,
  actionsEnd,
  onLoad,
  confirmAction,
  headless,
  handleRef,
  onDirtyChange,
}: FormSchemaFormProps) => {
  const [load, setLoad] = React.useState<LoadState>({ status: 'loading' });
  const loadListener = React.useRef(onLoad);
  loadListener.current = onLoad;

  React.useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    fetchFormSchema(schemaUrl, abort.signal)
      .then((response) => {
        if (!response.schema || !response.state) {
          throw new Error('The form endpoint sent no schema or state');
        }
        setLoad({ status: 'ready', schema: response.schema, state: response.state });
        loadListener.current?.(response);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setLoad({ status: 'failed', error, message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => abort.abort();
  }, [schemaUrl]);

  if (load.status === 'loading') {
    return <p className="shell-form__status" role="status">Loading form…</p>;
  }
  if (load.status === 'failed') {
    if (renderLoadError) {
      return <>{renderLoadError(load.error)}</>;
    }
    return (
      <p className="shell-form__alert" role="alert">
        The form could not be loaded: {load.message}
      </p>
    );
  }
  return (
    <LoadedForm
      key={schemaUrl}
      schemaUrl={schemaUrl}
      initialSchema={load.schema}
      initialState={load.state}
      onSubmitted={onSubmitted}
      onStateChange={onStateChange}
      omitFields={omitFields}
      trackUnsavedChanges={trackUnsavedChanges}
      actionsEnd={actionsEnd}
      confirmAction={confirmAction}
      headless={headless}
      handleRef={handleRef}
      onDirtyChange={onDirtyChange}
    />
  );
};
