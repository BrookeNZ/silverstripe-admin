/**
 * The shell's component for versioned-admin's HistoryViewerField (schema component `HistoryViewer`): a
 * record's versions as a table, newest first and a page at a time, and one version's read-only form
 * (`schema/versionForm`) through the shell's FormSchemaForm, headless because there is nothing to post.
 * "Revert to this version" shows when the field says the member can edit (`isRevertable`), for any version
 * but the newest, as legacy does; the controller repeats the CSRF and `canEdit` checks.
 *
 * Which version is open is component state, not a route, so the field works wherever versioned-admin puts
 * it. Opening a version focuses its heading; going back focuses the version's row button.
 *
 * Version pages are read through the shell's server cache under `[recordClass, id, 'versions', page]`, so a
 * records-changed event for the record, from a revert here or a save elsewhere, refetches them.
 *
 * After a successful revert the viewer runs the `onAfterRevert` hook with the record and the version.
 *
 * Gaps against legacy: no compare mode, no preview of a version, no author avatars.
 */
import * as React from 'react';
import type { FieldComponentProps, PiletApi } from '@silverstripe/admin-shell';
import { Button, Stack } from '@silverstripe/admin-patterns';
import type { HistoryApi, Version } from './api';
import { canRevertTo, formatEdited, memberName, pageCount, statusLabels, versionStatus } from './versions';

interface HistoryViewerData {
  recordId?: number | null;
  recordClass?: string | null;
  isRevertable?: boolean;
  limit?: number;
}

export interface RevertHookContext {
  recordClass: string;
  id: number;
  version: number;
}

declare module '@silverstripe/admin-shell' {
  interface HookPoints {
    onAfterRevert: { context: RevertHookContext };
  }

  interface SilverstripeComponents {
    HistoryViewer: FieldComponentProps;
  }
}

export interface HistoryViewerOptions {
  // Optional while the emulator predates the hook runners
  api: Pick<PiletApi, 'getSilverstripeComponent' | 'showNotification' | 'useServerQuery' | 'useServerMutation'> & {
    runAfterHook?: (name: 'onAfterRevert', context: RevertHookContext) => void;
  };
  client: HistoryApi;
  versionSchemaUrl: (recordClass: string, id: number, version: number) => string;
}

const StatusBadge = ({ version }: { version: Version }) => (
  <span className="history-viewer__badge">{statusLabels[versionStatus(version)]}</span>
);

export function createHistoryViewer({ api, client, versionSchemaUrl }: HistoryViewerOptions): React.ComponentType<FieldComponentProps> {
  const FormSchemaForm = api.getSilverstripeComponent('FormSchemaForm');

  const HistoryViewer = ({ field }: FieldComponentProps) => {
    const data = (field.data ?? {}) as HistoryViewerData;
    const recordId = Number(data.recordId ?? 0);
    const recordClass = String(data.recordClass ?? '');
    const pageSize = Number(data.limit ?? 30);
    const [page, setPage] = React.useState(1);
    const [newestVersion, setNewestVersion] = React.useState<number | null>(null);
    const [selected, setSelected] = React.useState<Version | null>(null);
    const [revertError, setRevertError] = React.useState<string | null>(null);
    const list = api.useServerQuery(
      [recordClass, recordId, 'versions', page],
      ({ signal }) => client.read(recordClass, recordId, page, signal),
      { enabled: Boolean(recordId && recordClass) },
    );
    const reverting = api.useServerMutation((version: number) => client.revert(recordClass, recordId, version), {
      changes: () => ({ recordClass, ids: [recordId] }),
    });
    const versionHeading = React.useRef<HTMLHeadingElement>(null);
    const listHeading = React.useRef<HTMLHeadingElement>(null);
    const returnFocusTo = React.useRef<number | null>(null);
    const headingId = `${field.id}_versions`;

    // Only page 1 holds the newest version, which stays unrevertable while a later page is shown
    const pageOneNewest = page === 1 && list.data ? (list.data.versions[0]?.version ?? null) : undefined;
    if (pageOneNewest !== undefined && pageOneNewest !== newestVersion) {
      setNewestVersion(pageOneNewest);
    }

    React.useEffect(() => {
      if (selected) {
        versionHeading.current?.focus();
      }
    }, [selected]);

    React.useEffect(() => {
      if (selected || list.status !== 'success' || returnFocusTo.current === null) {
        return;
      }
      const target = returnFocusTo.current === 0
        ? listHeading.current
        : document.getElementById(`${field.id}_version_${returnFocusTo.current}`);
      returnFocusTo.current = null;
      target?.focus();
    }, [selected, list.status, list.data, field.id]);

    if (!recordId || !recordClass) {
      return <p>This record has no history to show yet.</p>;
    }

    const closeVersion = (focusVersion: number) => {
      returnFocusTo.current = focusVersion;
      setRevertError(null);
      setSelected(null);
    };

    const revert = async (version: Version) => {
      setRevertError(null);
      try {
        await reverting.mutate(version.version);
      } catch (error) {
        setRevertError(error instanceof Error ? error.message : String(error));
        return;
      }
      api.runAfterHook?.('onAfterRevert', { recordClass, id: recordId, version: version.version });
      api.showNotification(`Reverted to version ${version.version}`, { type: 'success' });
      returnFocusTo.current = 0;
      setSelected(null);
      setPage(1);
    };

    if (selected) {
      const revertable = canRevertTo(selected, newestVersion, Boolean(data.isRevertable));
      return (
        <Stack spacing="md" className="history-viewer">
          <Stack direction="row" spacing="sm" align="center" justify="between">
            <h2 className="history-viewer__heading" ref={versionHeading} tabIndex={-1}>
              Version {selected.version} <StatusBadge version={selected} />
            </h2>
            <Stack direction="row" spacing="sm" align="center">
              <Button onClick={() => closeVersion(selected.version)}>Back to all versions</Button>
              {revertable && (
                <Button variant="primary" loading={reverting.status === 'pending'} disabled={reverting.status === 'pending'} onClick={() => revert(selected)}>
                  Revert to this version
                </Button>
              )}
            </Stack>
          </Stack>
          <p className="history-viewer__meta">
            Edited by {memberName(selected.author)} on {formatEdited(selected.lastEdited)}
            {data.isRevertable && !revertable && '. Revert is unavailable for the current version'}
          </p>
          {revertError && (
            <p className="admin-error-text" role="alert">
              {revertError}
            </p>
          )}
          <FormSchemaForm schemaUrl={versionSchemaUrl(recordClass, recordId, selected.version)} headless />
        </Stack>
      );
    }

    const pages = list.data ? pageCount(list.data.totalCount, pageSize) : 1;
    return (
      <Stack spacing="md" className="history-viewer">
        <h2 className="history-viewer__heading" id={headingId} ref={listHeading} tabIndex={-1}>
          Versions
        </h2>
        <p className="history-viewer__meta" role="status">
          {list.status === 'pending' && 'Loading versions'}
          {list.data && `${list.data.totalCount} versions, page ${page} of ${pages}`}
        </p>
        {list.status === 'error' && (
          <p className="admin-error-text" role="alert">
            {list.error?.message}
          </p>
        )}
        {list.data && list.data.versions.length > 0 && (
          <table className="history-viewer__table" aria-labelledby={headingId}>
            <thead>
              <tr>
                <th className="history-viewer__cell" scope="col">Version</th>
                <th className="history-viewer__cell" scope="col">Status</th>
                <th className="history-viewer__cell" scope="col">Author</th>
                <th className="history-viewer__cell" scope="col">Last edited</th>
              </tr>
            </thead>
            <tbody>
              {list.data.versions.map((version) => (
                <tr key={version.version}>
                  <th className="history-viewer__cell" scope="row">
                    <Button
                      variant="tertiary"
                      id={`${field.id}_version_${version.version}`}
                      onClick={() => setSelected(version)}
                    >
                      {`Version ${version.version}`}
                    </Button>
                  </th>
                  <td className="history-viewer__cell">
                    <StatusBadge version={version} />
                  </td>
                  <td className="history-viewer__cell">{memberName(version.author)}</td>
                  <td className="history-viewer__cell">{formatEdited(version.lastEdited)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <Stack direction="row" spacing="sm" as="nav" aria-label="Version pages">
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </Stack>
        )}
      </Stack>
    );
  };
  HistoryViewer.displayName = 'HistoryViewer';
  return HistoryViewer;
}
