/**
 * Reports a form's dirty state to the shell's unsaved-changes registry while the form asks for it.
 */
import * as React from 'react';
import { useGlobalStateContext } from 'piral-core';
import { setUnsavedChanges, shellOwner } from '../unsaved';

export function useUnsavedFormRegistration(schemaId: string, notify: boolean, dirty: boolean): void {
  const globalState = useGlobalStateContext();
  React.useEffect(() => {
    if (!notify) {
      return undefined;
    }
    return setUnsavedChanges(globalState, shellOwner, `form:${schemaId}`, dirty);
  }, [globalState, notify, schemaId, dirty]);
}
