/**
 * A block that is not inline-editable opens as a page of its own (Figma 2:30205): its GridField item form
 * at the legacy URL `<pages>/edit/EditForm/<page>/field/<area>/item/<id>[/edit]`, which the block list's
 * Edit link and `CMSEditLink()` produce. The route is more specific than the pages section's `<pages>/*`,
 * so the router ranks it first and the pages pilet needs no change.
 *
 * The header names the block, with the page as the last crumb and the back target. A save emits
 * records-changed for the block and for the page (the tree's Modified badge); archive asks first, then
 * goes back to the page.
 */
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dialog, fieldTitle } from '@silverstripe/admin-patterns';
import type { FormField, FormSchemaRecord, FormSchemaResponse, PageComponentProps } from '@silverstripe/admin-shell';
import { blockTitle } from './blocks';
import type { ElementType } from './blocks';
import { recordsChangedEvent } from './ElementalArea';
import type { RecordsChangedEvent } from './ElementalArea';
import type { ElementalPiletApi } from './shell';

export interface BlockEditPageOptions {
  api: ElementalPiletApi;
  types: ReadonlyArray<ElementType>;
  pageClass: string;
  /** The pages section's router path, such as `/pages` */
  routePrefix: string;
  /** CMSPageEditController's URL, such as `admin/pages/edit` */
  editSectionUrl: string;
}

// Added to the shell's FormSchemaRecord after the installed emulator was built
type BlockRecord = FormSchemaRecord & { parentTitle?: string | null };

const confirmedActions = ['action_doArchive', 'action_doDelete'];

const recordId = /^[1-9]\d*$/;

export function blockEditRoute(routePrefix: string): string {
  return `${routePrefix}/edit/EditForm/:pageId/field/:area/item/:blockId/*`;
}

interface Confirming {
  action: FormField;
  resolve(confirmed: boolean): void;
}

export function createBlockEditPage(options: BlockEditPageOptions): React.ComponentType<PageComponentProps> {
  const { api, types, pageClass, routePrefix, editSectionUrl } = options;
  const FormSchemaForm = api.getSilverstripeComponent('FormSchemaForm');

  const BlockEditPage = () => {
    const { pageId = '', area = '', blockId = '' } = useParams();
    const navigate = useNavigate();
    const [record, setRecord] = React.useState<BlockRecord | null>(null);
    const [confirming, setConfirming] = React.useState<Confirming | null>(null);
    const [leaving, setLeaving] = React.useState(false);
    const valid = recordId.test(pageId) && recordId.test(blockId) && area !== '';
    const pagePath = `${routePrefix}/edit/show/${pageId}`;
    const pageTitle = record?.parentTitle || 'page';
    const type = types.find((candidate) => candidate.class === record?.className);
    const title = record ? blockTitle(record, type) : `Block #${blockId}`;

    React.useEffect(
      () =>
        api.setSectionHeader({
          title,
          badge: type?.title,
          crumbs: [
            { label: 'Pages', to: `${routePrefix}/` },
            { label: record?.parentTitle || `Page #${pageId}`, to: pagePath },
          ],
          backTo: pagePath,
          backLabel: `Back to ${pageTitle}`,
        }),
      [title, type?.title, pageTitle, pagePath],
    );

    // The unsaved changes guard would stop a navigation made while the archived form still reads dirty
    React.useEffect(() => {
      if (!leaving) {
        return undefined;
      }
      let timer = 0;
      const leave = (attempts: number) => {
        timer = window.setTimeout(() => {
          if (api.hasUnsavedChanges() && attempts > 0) {
            leave(attempts - 1);
          } else {
            navigate(pagePath);
          }
        });
      };
      leave(10);
      return () => window.clearTimeout(timer);
    }, [leaving]);

    if (!valid) {
      return (
        <div className="shell-page">
          <p className="shell-page__inset">This block address is not valid.</p>
        </div>
      );
    }

    const onSubmitted = (response: FormSchemaResponse, action: FormField) => {
      const saved = response.record as BlockRecord | undefined;
      if (!saved) {
        return;
      }
      const blockEvent: RecordsChangedEvent = { recordClass: saved.className, ids: saved.id ? [saved.id] : [Number(blockId)] };
      const pageEvent: RecordsChangedEvent = { recordClass: pageClass, ids: [Number(pageId)] };
      api.emit(recordsChangedEvent, blockEvent);
      api.emit(recordsChangedEvent, pageEvent);
      const verb = fieldTitle(action);
      if (response.deleted) {
        const savedType = types.find((candidate) => candidate.class === saved.className);
        api.showNotification(`${verb} succeeded: ${blockTitle(saved, savedType)}`, { type: 'success', autoClose: 5000 });
        setLeaving(true);
        return;
      }
      api.showNotification(response.message || `${verb} succeeded`, { type: 'success', autoClose: 5000 });
      setRecord(saved);
    };

    const confirmAction = (action: FormField) =>
      confirmedActions.includes(action.name) ? new Promise<boolean>((resolve) => setConfirming({ action, resolve })) : true;

    const settle = (confirmed: boolean) => {
      confirming?.resolve(confirmed);
      setConfirming(null);
    };

    const verb = confirming ? fieldTitle(confirming.action) : '';
    return (
      <div className="shell-page">
        <FormSchemaForm
          schemaUrl={`${editSectionUrl}/EditForm/${pageId}/field/${area}/item/${blockId}/schema`}
          trackUnsavedChanges
          onLoad={(response: FormSchemaResponse) => setRecord((response.record as BlockRecord | undefined) ?? null)}
          onSubmitted={onSubmitted}
          confirmAction={confirmAction}
        />
        <Dialog
          open={confirming !== null}
          onClose={() => settle(false)}
          header={confirming ? `${verb} ${title}?` : ''}
          body={confirming ? `Are you sure you want to ${verb.toLowerCase()} this block?` : null}
          footer={
            <>
              <Button data-autofocus onClick={() => settle(false)}>
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
  return BlockEditPage;
}
