/**
 * Posts the form the way the legacy FormBuilder does (urlencoded values plus the pressed action) and
 * runs the shell's hooks around it: `onBeforeFormAction` when an action button is pressed,
 * `updateFormValues` and `updateFormValidation` (the shell's own required check first) before every
 * post, then `onBeforeFormSubmit`, which can cancel it, and `onAfterFormSubmit` once the server answers.
 *
 * A successful save announces the response's record as records-changed, which refetches every schema
 * on screen, because actions change with the record (publish adds unpublish); the save waits for this
 * form's refetch. Focus then goes back to the pressed action, which was disabled while saving. A server
 * error on a field in a hidden tab asks the tabs to reveal it before the field is focused. Errors no
 * field claims, and every other form-level message, are the `messages` this returns.
 */
import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useGlobalStateContext } from 'piral-core';
import { revealField } from '@silverstripe/admin-patterns';
import { announceRecords } from '../state/serverCache';
import { runAfterHook, runBeforeHook, runUpdateHook } from '../hooks/registry';
import type { FormValidationErrors } from '../hooks/types';
import { collectValueFields, defaultValues, encodeSubmission, errorField, mergeFields, submitFormSchema, uniqueMessages } from './schema';
import type { FormValues } from './schema';
import { fieldFocusTarget, focusById } from './formFocus';
import { refetchSchema } from './useSchemaLoad';
import type { FormField, FormSchemaResponse, FormSchemaState, FormSchemaSubmitResult, FormSchemaTree, SchemaMessage } from './types';

export interface FormSubmissionOptions {
  form: UseFormReturn<FormValues>;
  schemaUrl: string;
  formId: string;
  /** After `updateFormSchema` */
  schema: FormSchemaTree;
  valueFields: Array<FormField>;
  actions: Array<FormField>;
  initialMessages: Array<SchemaMessage>;
  /** Receives the state a successful save sends back */
  onSavedState(state: FormSchemaState): void;
  onSubmitted?(response: FormSchemaResponse, action: FormField): void;
  onSubmittingChange?(action: string | null): void;
  confirmAction?(action: FormField): boolean | Promise<boolean>;
}

export interface FormSubmission {
  messages: Array<SchemaMessage>;
  /** Posts with the named action, judging the values afresh */
  submitWith(actionName: string, focusedId?: string): Promise<FormSchemaSubmitResult>;
  /** The form element's submit handler, which posts the submitter's action once it is confirmed */
  onSubmit(event: React.FormEvent<HTMLElement>): Promise<unknown>;
}

function findAction(actions: Array<FormField>, name: string | undefined): FormField | undefined {
  for (const action of actions) {
    const found = action.name === name ? action : findAction(action.children, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** The messages an `updateFormValidation` run left, as the server's errors are shaped */
function validationMessages(errors: FormValidationErrors): Array<SchemaMessage> {
  return Object.entries(errors).flatMap(([field, messages]) => messages.map((value) => ({ type: 'error', value, field })));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useFormSubmission({
  form,
  schemaUrl,
  formId,
  schema,
  valueFields,
  actions,
  initialMessages,
  onSavedState,
  onSubmitted,
  onSubmittingChange,
  confirmAction,
}: FormSubmissionOptions): FormSubmission {
  const { clearErrors, getValues, handleSubmit, reset, setError, setValue } = form;
  const globalState = useGlobalStateContext();
  const [messages, setMessages] = React.useState<Array<SchemaMessage>>(initialMessages);

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

  /** Marks the fields the errors name, shows the rest with `formMessages` above the form, and focuses the first invalid field */
  const showErrors = (errors: Array<SchemaMessage>, formMessages: Array<SchemaMessage>) => {
    const fieldErrors = errors.flatMap((error) => {
      const field = errorField(valueFields, error.field);
      return field ? [{ error, field }] : [];
    });
    for (const { error, field } of fieldErrors) {
      setError(field.key, { type: 'server', message: error.value });
    }
    const inlineErrors = fieldErrors.map(({ error }) => error);
    setMessages(uniqueMessages([...errors.filter((error) => !inlineErrors.includes(error)), ...formMessages], inlineErrors));
    const firstInvalid = fieldErrors[0]?.field;
    const invalidElement = firstInvalid ? fieldFocusTarget(firstInvalid) : null;
    if (invalidElement) {
      revealField(invalidElement);
      invalidElement.focus();
    }
  };

  const post = async (actionName: string, focusedId: string | undefined): Promise<FormSchemaSubmitResult> => {
    setMessages([]);
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
      setMessages([{ type: 'error', value: message }]);
      requestAnimationFrame(() => focusById(focusedId));
      return { ok: false, message };
    }

    const errors = response.errors ?? [];
    if (errors.length === 0 && response.state) {
      onSavedState(response.state);
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
    const refetched = errors.length === 0 && !response.deleted ? refetchSchema(schemaUrl) : Promise.resolve();

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
      (error) => setMessages([{ type: 'error', value: errorMessage(error) }]),
    );
  };

  return { messages, submitWith, onSubmit };
}
