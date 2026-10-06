/**
 * A GridField record's edit form (the ModelAdmin detail form) at its legacy URL, under the section
 * header with the record's title and a back button to its grid. The actions render in the bottom bar
 * by the usual role rules; delete and archive ask first in the shared Dialog.
 *
 * A save reports through `notify` and the records-changed event (the grid re-reads its rows on it). A
 * new record's save replaces the URL with the record's edit URL; a delete, archive or save that takes the
 * record out of the grid's list goes back to the grid. Navigation waits until the form's unsaved state
 * has cleared and rendered, or the unsaved changes guard would stop it.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalStateContext } from 'piral-core';
import { Button, Dialog, fieldTitle } from '@silverstripe/admin-patterns';
import { recordsChangedEvent } from '../events';
import type { RecordsChangedEvent } from '../events';
import { FormSchemaForm } from '../forms/FormSchemaForm';
import type { FormField, FormSchemaRecord, FormSchemaResponse } from '../forms/types';
import { useSectionHeaderEffect } from '../header/state';
import { routerPath } from '../routing';
import { shellOwner, useHasUnsavedChanges } from '../unsaved';
import { RecordLoadError } from './LoadError';
import { recordBackPath, recordHeader, recordSchemaUrl, recordTitle } from './record';
import type { RecordRoute } from './record';

export type Notify = (message: string, type: 'success' | 'error') => void;

const confirmedActions = ['action_doDelete', 'action_doArchive'];

interface Confirming {
  action: FormField;
  resolve(confirmed: boolean): void;
}

interface Leaving {
  to: string;
  replace: boolean;
}

export interface RecordEditPageProps {
  route: RecordRoute;
  notify: Notify;
}

export const RecordEditPage = ({ route, notify }: RecordEditPageProps) => {
  const navigate = useNavigate();
  const context = useGlobalStateContext();
  const [record, setRecord] = React.useState<FormSchemaRecord | null>(null);
  const [confirming, setConfirming] = React.useState<Confirming | null>(null);
  const [leaving, setLeaving] = React.useState<Leaving | null>(null);
  const title = recordTitle(route, record);
  useSectionHeaderEffect(recordHeader(route, record), shellOwner);

  // The unsaved changes guard reads its state when it renders, so leave once the clean form has rendered
  const dirty = useHasUnsavedChanges();
  React.useEffect(() => {
    if (!leaving || dirty) {
      return undefined;
    }
    const timer = window.setTimeout(() => navigate(leaving.to, { replace: leaving.replace }));
    return () => window.clearTimeout(timer);
  }, [leaving, dirty, navigate]);

  const confirmAction = (action: FormField) =>
    confirmedActions.includes(action.name) ? new Promise<boolean>((resolve) => setConfirming({ action, resolve })) : true;

  const settle = (confirmed: boolean) => {
    confirming?.resolve(confirmed);
    setConfirming(null);
  };

  const onSubmitted = (response: FormSchemaResponse, action: FormField) => {
    const saved = response.record;
    if (!saved) {
      return;
    }
    const changed: RecordsChangedEvent = { recordClass: saved.className, ids: saved.id ? [saved.id] : [] };
    context.emit(recordsChangedEvent, changed);
    const path = saved.link ? routerPath(saved.link) : null;
    if (response.deleted || !path) {
      notify(response.deleted ? `${fieldTitle(action)} succeeded: ${title}` : response.message || `${fieldTitle(action)} succeeded`, 'success');
      setLeaving({ to: recordBackPath(route), replace: false });
      return;
    }
    notify(response.message || `${fieldTitle(action)} succeeded`, 'success');
    setRecord(saved);
    if (route.id === null) {
      setLeaving({ to: path, replace: true });
    }
  };

  const verb = confirming ? fieldTitle(confirming.action) : '';
  return (
    <div className="shell-page">
      <FormSchemaForm
        schemaUrl={recordSchemaUrl(route)}
        trackUnsavedChanges
        onLoad={(response) => setRecord(response.record ?? null)}
        onSubmitted={onSubmitted}
        confirmAction={confirmAction}
        renderLoadError={(error) => <RecordLoadError error={error} title={title} />}
      />
      <Dialog
        open={confirming !== null}
        onClose={() => settle(false)}
        header={confirming ? `${verb} ${title}?` : ''}
        body={confirming ? `Are you sure you want to ${verb.toLowerCase()} this record?` : null}
        footer={
          <>
            <Button autoFocus onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => settle(true)}>
              {verb}
            </Button>
          </>
        }
      />
    </div>
  );
};
