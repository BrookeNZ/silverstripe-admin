/**
 * How a host posts a form it renders headless (a block's form inside the page form): the handle on
 * `handleRef`, and Enter in one of its inputs, which posts it when dirty instead of submitting the outer form.
 */
import * as React from 'react';
import type { FormSchemaFormHandle, FormSchemaSubmitResult } from './types';

// Enter in these does not submit a form
const buttonInputTypes = new Set(['button', 'submit', 'reset', 'image']);

interface FormHandleOptions {
  handleRef?: React.Ref<FormSchemaFormHandle>;
  submitWith: (actionName: string, focusedId?: string) => Promise<FormSchemaSubmitResult>;
  /** Posted by Enter, and by the handle when it is given no action */
  defaultAction: string;
  isDirty: boolean;
}

/** Publishes the handle and returns the headless form's keydown handler */
export function useFormHandle({ handleRef, submitWith, defaultAction, isDirty }: FormHandleOptions): (event: React.KeyboardEvent<HTMLElement>) => void {
  // The host calls the handle from its own events, so it reads the latest render's values without being
  // replaced on every render, which would call a callback ref twice per render
  const latest = React.useRef({ submitWith, defaultAction, isDirty });
  React.useLayoutEffect(() => {
    latest.current = { submitWith, defaultAction, isDirty };
  });
  React.useImperativeHandle(
    handleRef,
    () => ({
      submit: (action) => latest.current.submitWith(action ?? latest.current.defaultAction),
      isDirty: () => latest.current.isDirty,
    }),
    [],
  );

  // A headless form sits inside another form, whose implicit submission Enter would trigger
  return (event: React.KeyboardEvent<HTMLElement>) => {
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
    if (isDirty) {
      void submitWith(defaultAction, target.id);
    }
  };
}
