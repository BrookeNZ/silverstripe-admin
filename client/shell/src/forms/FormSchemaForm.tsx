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
 */
import * as React from 'react';
import { useController, useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { useGlobalStateContext } from 'piral-core';
import { setUnsavedChanges, shellOwner } from '../unsaved';
import { revealField } from '@silverstripe/admin-patterns';
import { useFieldComponent } from './useFieldComponent';
import {
  collectValueFields,
  defaultValues,
  encodeSubmission,
  errorField,
  fetchFormSchema,
  mergeFields,
  submitFormSchema,
  uniqueMessages,
} from './schema';
import type { FormValues } from './schema';
import type { FieldComponentProps, FormField, FormSchemaResponse, FormSchemaState, FormSchemaTree, SchemaMessage } from './types';
import './form.css';

export interface FormSchemaFormProps {
  schemaUrl: string;
  onSubmitted?(response: FormSchemaResponse, action: FormField): void;
}

interface FormRenderContextValue {
  control: Control<FormValues>;
  submitting: boolean;
  /** Keys of the posted fields; only these bind to the form library, so nothing else can make it dirty */
  boundKeys: ReadonlySet<string>;
  renderFields(fields: Array<FormField>): React.ReactNode;
}

const FormRenderContext = React.createContext<FormRenderContextValue | null>(null);

function useFormRenderContext(): FormRenderContextValue {
  const context = React.useContext(FormRenderContext);
  if (!context) {
    throw new Error('A form field rendered outside FormSchemaForm');
  }
  return context;
}

const noop = () => undefined;

const BoundField: React.FC<{ field: FormField; Component: React.ComponentType<FieldComponentProps<any>> }> = ({
  field,
  Component,
}) => {
  const { control, submitting, renderFields } = useFormRenderContext();
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
    />
  );
};

export const FormFieldSlot: React.FC<{ field: FormField }> = ({ field }) => {
  const Component = useFieldComponent(field);
  const { submitting, renderFields, boundKeys } = useFormRenderContext();
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

/** The element to focus for a field: its control, or for a group such as radios the checked or first control */
function fieldFocusTarget(field: FormField): HTMLElement | null {
  const element = document.getElementById(field.id) ?? (field.holderId ? document.getElementById(field.holderId) : null);
  if (!element || element.matches(focusable)) {
    return element;
  }
  return element.querySelector<HTMLElement>('input:checked') ?? element.querySelector<HTMLElement>(focusable) ?? element;
}

const LoadedForm: React.FC<LoadedFormProps> = ({ schemaUrl, initialSchema, initialState, onSubmitted }) => {
  const [schema, setSchema] = React.useState(initialSchema);
  const [state, setState] = React.useState(initialState);
  const [formMessages, setFormMessages] = React.useState<Array<SchemaMessage>>(initialState.messages ?? []);
  const fields = React.useMemo(() => mergeFields(schema.fields, state), [schema, state]);
  const actions = React.useMemo(() => mergeFields(schema.actions, state), [schema, state]);
  const valueFields = React.useMemo(() => collectValueFields(fields), [fields]);
  const { control, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    defaultValues: defaultValues(valueFields),
  });
  const isDirty = React.useRef(false);
  isDirty.current = formState.isDirty;

  const globalState = useGlobalStateContext();
  const notifyUnsavedChanges = Boolean(state.notifyUnsavedChanges ?? initialState.notifyUnsavedChanges);
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

  const submit = async (values: FormValues, actionName: string, focusedId: string | undefined) => {
    setFormMessages([]);
    let response: FormSchemaResponse;
    try {
      response = await submitFormSchema(schema, encodeSubmission(valueFields, values, actionName));
    } catch (error) {
      setFormMessages([{ type: 'error', value: error instanceof Error ? error.message : String(error) }]);
      requestAnimationFrame(() => focusById(focusedId));
      return;
    }

    const errors = response.errors ?? [];
    if (errors.length === 0 && response.state) {
      setState(response.state);
      reset(defaultValues(collectValueFields(mergeFields(schema.fields, response.state))));
    }
    const refetched = errors.length === 0 ? refetchSchema() : Promise.resolve();

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
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const actionName = submitter?.name || 'action_save';
    const focusedId = document.activeElement?.id || submitter?.id;
    return handleSubmit((values) => submit(values, actionName, focusedId))(event);
  };

  const context = React.useMemo(
    () => ({
      control,
      submitting: formState.isSubmitting,
      boundKeys: new Set(valueFields.map((field) => field.key)),
      renderFields,
    }),
    [control, formState.isSubmitting, valueFields],
  );

  return (
    <FormRenderContext.Provider value={context}>
      <form
        className="shell-form"
        id={String(schema.attributes.id ?? schema.id)}
        noValidate
        aria-busy={formState.isSubmitting}
        onSubmit={onSubmit}
      >
        {formMessages.map((message, index) => (
          <p className="shell-form__alert" role="alert" key={index}>
            {message.value}
          </p>
        ))}
        {renderFields(fields)}
        <div className="shell-form__actions">{renderFields(actions)}</div>
      </form>
    </FormRenderContext.Provider>
  );
};

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; schema: FormSchemaTree; state: FormSchemaState };

export const FormSchemaForm: React.FC<FormSchemaFormProps> = ({ schemaUrl, onSubmitted }) => {
  const [load, setLoad] = React.useState<LoadState>({ status: 'loading' });

  React.useEffect(() => {
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    fetchFormSchema(schemaUrl, abort.signal)
      .then((response) => {
        if (!response.schema || !response.state) {
          throw new Error('The form endpoint sent no schema or state');
        }
        setLoad({ status: 'ready', schema: response.schema, state: response.state });
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setLoad({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => abort.abort();
  }, [schemaUrl]);

  if (load.status === 'loading') {
    return <p className="shell-form__status" role="status">Loading form…</p>;
  }
  if (load.status === 'failed') {
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
    />
  );
};
