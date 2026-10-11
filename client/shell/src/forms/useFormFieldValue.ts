/**
 * The `useFormFieldValue` verb: a field component reads another posted field of the same form by name and
 * re-renders when it changes, as legacy entwine read a sibling input. It reads the form the component is
 * rendered in, so outside a FormSchemaForm, or for a name the form does not post, it is `undefined`.
 */
import * as React from 'react';
import { FormRenderContext } from './context';
import { fieldKey } from './schema';

const unsubscribed = () => undefined;

export function useFormFieldValue(name: string): unknown {
  const context = React.useContext(FormRenderContext);
  const key = fieldKey(name);
  const bound = context?.boundKeys.has(key) ?? false;
  const subscribe = React.useCallback(
    (listener: () => void) => (context && bound ? context.subscribeValues(listener) : unsubscribed),
    [context, bound],
  );
  const read = () => (context && bound ? context.getValue(key) : undefined);
  return React.useSyncExternalStore(subscribe, read, read);
}
