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
  submitWith(actionName: string, focusedId?: string): Promise<FormSchemaSubmitResult>;
  /** Posted by Enter, and by the handle when it is given no action */
  defaultAction: string;
  isDirty: { readonly current: boolean };
}

/** Publishes the handle and returns the headless form's keydown handler */
export function useFormHandle({ handleRef, submitWith, defaultAction, isDirty }: FormHandleOptions): (event: React.KeyboardEvent<HTMLElement>) => void {
  const latestSubmit = React.useRef(submitWith);
  latestSubmit.current = submitWith;
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
    if (isDirty.current) {
      submitWith(defaultAction, target.id);
    }
  };
}
