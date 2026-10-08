/**
 * The linkfield module's LinkField and MultiLinkField (silverstripe/linkfield 5), written fresh: the
 * field's links with their type and description, an "Add link" menu of the allowed link types, editing
 * in the shared Dialog through the module's own FormSchema form, delete (or archive) after a confirm,
 * and move up and down for a multi-link field.
 *
 * Data contract, from AbstractLinkField: the schema carries `types` (key, title, allowed), `ownerID`,
 * `ownerClass`, `ownerRelation`, `excludeLinkTextField`, and for MultiLinkField `isMulti` and
 * `maximumLinks`. The value is the link id (0 for none) or, for a multi field, the ids in order.
 * Links are written by the module's endpoints as soon as their dialog saves (see linkApi.ts); the
 * owner form only posts the ids. The links' data is a server cache read keyed `[Link, 'data', ids]`, so
 * a save, delete or sort announces the links it changed and the read follows.
 *
 * The edit dialog is the shell's `SchemaFormDialog` (the link form with its actions in the dialog footer),
 * passed in by the pilet's setup. The dialogs are portalled out of the page form and stop submit events
 * there, so saving a link never submits the page.
 *
 * No CMS Refresh design exists for this field in the file; this is the minimum markup.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { AddIcon, Button, describedBy, Dialog, FieldHolder, RemoveIcon } from '@silverstripe/admin-patterns';
import type { FieldComponentProps, FormSchemaResponse } from '@silverstripe/admin-shell';
import type { SchemaFormDialogProps } from '@silverstripe/admin-shell';
import { serverCache } from '../legacy/Backend';
import { deleteLink, fetchLinkData, linkDataError, linkRecordClass, linkSchemaUrl, savedLinkId, sortLinks } from './linkApi';
import type { LinkData, LinkOwner } from './linkApi';
import './LinkField.css';

export interface LinkType {
  key: string;
  title: string;
  allowed: boolean;
  priority?: number;
}

export interface LinkFieldSchema {
  types: Record<string, LinkType>;
  ownerID: number;
  ownerClass: string;
  ownerRelation: string;
  excludeLinkTextField: boolean;
  isMulti: boolean;
  maximumLinks: number | null;
}

export type LinkFieldValue = number | string | Array<number | string> | null;

interface Editing {
  linkId: number;
  typeKey: string;
  title: string;
}

const archivedStates = ['draft', 'modified', 'published'];

export function linkIds(value: LinkFieldValue | undefined): Array<number> {
  const list = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return list.map(Number).filter((id) => id > 0);
}

const noLinks: Record<number, LinkData> = {};

export function createLinkField(SchemaFormDialog: React.ComponentType<SchemaFormDialogProps>) {
  const LinkField = ({ field, value, onChange, error }: FieldComponentProps<LinkFieldValue, LinkFieldSchema>) => {
    const ids = linkIds(value);
    const idsKey = ids.join(',');
    const isMulti = Boolean(field.isMulti);
    const types = field.types ?? {};
    const owner: LinkOwner = {
      ownerID: Number(field.ownerID ?? 0),
      ownerClass: String(field.ownerClass ?? ''),
      ownerRelation: String(field.ownerRelation ?? field.name),
      excludeLinkTextField: Boolean(field.excludeLinkTextField),
    };
    const editable = !field.readOnly && !field.disabled;
    const labelId = `${field.id}_label`;
    const menuId = `${field.id}_types`;

    const { useServerQuery, useServerMutation, invalidateRecords } = serverCache();
    const linkData = useServerQuery(
      [linkRecordClass, 'data', idsKey],
      ({ signal }) => fetchLinkData(linkIds(idsKey.split(',')), signal),
      { enabled: ids.length > 0, keepPrevious: true },
    );
    const links: Record<number, LinkData> = linkData.data ?? noLinks;
    const loading = linkData.isFetching;
    const removing = useServerMutation((id: number) => deleteLink(id, owner), {
      changes: (id) => ({ recordClass: linkRecordClass, ids: [id] }),
    });
    const sorting = useServerMutation((next: Array<number>) => sortLinks(next), {
      changes: (next) => ({ recordClass: linkRecordClass, ids: next }),
    });
    const [fieldError, setFieldError] = React.useState<string | null>(null);
    const [status, setStatus] = React.useState('');
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<Editing | null>(null);
    const [confirming, setConfirming] = React.useState<number | null>(null);
    const [focusId, setFocusId] = React.useState<string | null>(null);
    const menuToggle = React.useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
      const target = focusId ? document.getElementById(focusId) : null;
      // A new link's button stays disabled until its data has loaded
      if (target && !target.hasAttribute('disabled')) {
        target.focus();
        setFocusId(null);
      }
    }, [focusId, links]);

    const commit = (next: Array<number>) => onChange(isMulti ? next : next[0] ?? 0);
    const editButtonId = (id: number) => `${field.id}_link_${id}`;
    const allowedTypes = Object.values(types)
      .filter((type) => type.allowed)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const atMaximum = isMulti ? field.maximumLinks != null && ids.length >= field.maximumLinks : ids.length > 0;
    const canAdd = editable && !atMaximum && allowedTypes.length > 0;
    const shownError = fieldError ?? (linkData.status === 'error' && linkData.error ? linkDataError(linkData.error) : null) ?? error;

    const startAdding = (type: LinkType) => {
      setMenuOpen(false);
      setEditing({ linkId: 0, typeKey: type.key, title: type.title });
    };

    const closeEditor = (focus: string | null) => {
      setEditing(null);
      setFocusId(focus ?? (canAdd ? `${field.id}_add` : null));
    };

    const onSaved = (response: FormSchemaResponse) => {
      const savedId = savedLinkId(response.id) ?? editing?.linkId ?? 0;
      if (savedId > 0 && !ids.includes(savedId)) {
        commit([...ids, savedId]);
      }
      invalidateRecords(linkRecordClass, savedId > 0 ? [savedId] : []);
      setStatus('Saved link');
      closeEditor(savedId > 0 ? editButtonId(savedId) : null);
    };

    const confirmDelete = async () => {
      const id = confirming;
      setConfirming(null);
      if (id === null) {
        return;
      }
      const archive = archivedStates.includes(links[id]?.versionState ?? '');
      try {
        await removing.mutate(id);
      } catch {
        setFieldError(archive ? 'Failed to archive link' : 'Failed to delete link');
        return;
      }
      setFieldError(null);
      const next = ids.filter((existing) => existing !== id);
      commit(next);
      setStatus(archive ? 'Archived link' : 'Deleted link');
      const index = ids.indexOf(id);
      const neighbour = next[Math.min(index, next.length - 1)];
      setFocusId(neighbour ? editButtonId(neighbour) : `${field.id}_add`);
    };

    const move = async (id: number, offset: number) => {
      const index = ids.indexOf(id);
      const target = index + offset;
      if (target < 0 || target >= ids.length) {
        return;
      }
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      try {
        await sorting.mutate(next);
      } catch {
        setFieldError('Unable to sort links');
        return;
      }
      setFieldError(null);
      commit(next);
      setStatus('Updated link sort order');
    };

    const confirmingLink = confirming === null ? undefined : links[confirming];
    const confirmingArchive = archivedStates.includes(confirmingLink?.versionState ?? '');

    return (
      <FieldHolder field={field} error={shownError} labelId={labelId}>
        <div
          className="link-field"
          id={field.id}
          role="group"
          aria-labelledby={labelId}
          aria-describedby={describedBy(field, shownError)}
          aria-busy={loading || undefined}
        >
          {ids.length > 0 && (
            <ul className="link-field__links">
              {ids.map((id, index) => {
                const link = links[id];
                const title = link?.title || (loading ? 'Loading link…' : `Link ${id}`);
                const type = link ? types[link.typeKey]?.title : undefined;
                const draftState = link?.versionState === 'draft' || link?.versionState === 'modified' ? link.versionState : null;
                return (
                  <li className="link-field__link" key={id}>
                    <button
                      className="link-field__edit"
                      id={editButtonId(id)}
                      type="button"
                      disabled={!link}
                      onClick={() => link && setEditing({ linkId: id, typeKey: link.typeKey, title: 'Edit link' })}
                    >
                      <span className="link-field__title">{title}</span>
                      {link && <span className="link-field__description">{[type, link.description].filter(Boolean).join(': ')}</span>}
                    </button>
                    {draftState && (
                      <span className="link-field__badge">{draftState === 'draft' ? 'Draft' : 'Modified'}</span>
                    )}
                    {editable && isMulti && ids.length > 1 && (
                      <>
                        <Button variant="tertiary" disabled={index === 0} onClick={() => move(id, -1)}>
                          Move up
                        </Button>
                        <Button variant="tertiary" disabled={index === ids.length - 1} onClick={() => move(id, 1)}>
                          Move down
                        </Button>
                      </>
                    )}
                    {editable && link?.canDelete !== false && (
                      <button className="link-field__delete" type="button" onClick={() => setConfirming(id)}>
                        <RemoveIcon label={`${archivedStates.includes(link?.versionState ?? '') ? 'Archive' : 'Delete'} ${title}`} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canAdd && (
            // Catches Escape bubbling from the menu toggle and the menu's items, which are the controls
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              className="link-field__add"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && menuOpen) {
                  event.stopPropagation();
                  setMenuOpen(false);
                  menuToggle.current?.focus();
                }
              }}
            >
              <Button
                id={`${field.id}_add`}
                ref={menuToggle}
                icon={<AddIcon size="sm" />}
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
              >
                Add link
              </Button>
              {menuOpen && (
                <ul className="link-field__types" id={menuId}>
                  {allowedTypes.map((type) => (
                    <li key={type.key}>
                      <button className="link-field__type" type="button" onClick={() => startAdding(type)}>
                        {type.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="link-field__status" role="status">
            {status}
          </p>
        </div>
        {createPortal(
          <div className="link-field__dialogs" onSubmit={(event) => event.stopPropagation()}>
            <SchemaFormDialog
              open={editing !== null}
              onClose={() => closeEditor(editing && editing.linkId > 0 ? editButtonId(editing.linkId) : null)}
              header={editing?.title ?? ''}
              schemaUrl={editing ? linkSchemaUrl(editing.linkId, editing.typeKey, owner) : ''}
              onSubmitted={onSaved}
            />
            <Dialog
              open={confirming !== null}
              onClose={() => setConfirming(null)}
              header={confirmingArchive ? 'Archive link?' : 'Delete link?'}
              body={confirmingArchive ? 'Are you sure you want to archive this link?' : 'Are you sure you want to delete this link?'}
              footer={
                <>
                  <Button autoFocus onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={confirmDelete}>
                    {confirmingArchive ? 'Archive' : 'Delete'}
                  </Button>
                </>
              }
            />
          </div>,
          document.body,
        )}
      </FieldHolder>
    );
  };
  return LinkField;
}
