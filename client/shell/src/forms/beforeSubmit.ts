/**
 * Work that must finish before a form posts, keyed by the form's element id (`Form_EditForm`), the id
 * FormSchemaForm renders and passes to its fields as `formId`. Elemental saves its dirty blocks this way
 * before the page form posts, as the legacy Entwine `onbeforesubmitform` hook did.
 *
 * Handlers run one after another in registration order. One that resolves `false` or throws stops the
 * rest and cancels the submission; a handler that cancels says why itself (a toast), while a thrown
 * error's message is shown on the form.
 */

export interface BeforeSubmitContext {
  /** The pressed action's name, such as `action_save` or `action_publish` */
  action: string;
}

export type BeforeSubmitHandler = (context: BeforeSubmitContext) => boolean | void | Promise<boolean | void>;

interface Registration {
  owner: string;
  handler: BeforeSubmitHandler;
}

const registrations = new Map<string, Array<Registration>>();

export function registerBeforeSubmit(formId: string, owner: string, handler: BeforeSubmitHandler): () => void {
  const registration = { owner, handler };
  registrations.set(formId, [...(registrations.get(formId) ?? []), registration]);
  return () => {
    const remaining = (registrations.get(formId) ?? []).filter((candidate) => candidate !== registration);
    if (remaining.length > 0) {
      registrations.set(formId, remaining);
    } else {
      registrations.delete(formId);
    }
  };
}

export function clearBeforeSubmitOf(owner: string): void {
  for (const [formId, list] of registrations) {
    const remaining = list.filter((registration) => registration.owner !== owner);
    if (remaining.length > 0) {
      registrations.set(formId, remaining);
    } else {
      registrations.delete(formId);
    }
  }
}

/** Whether the submission may go ahead; a thrown error propagates to the form */
export async function runBeforeSubmit(formId: string, context: BeforeSubmitContext): Promise<boolean> {
  for (const { handler } of [...(registrations.get(formId) ?? [])]) {
    if ((await handler(context)) === false) {
      return false;
    }
  }
  return true;
}
