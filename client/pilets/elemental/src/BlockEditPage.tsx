/**
 * A block that is not inline-editable opens as a page of its own (Figma 2:30205): its GridField item form
 * at the legacy URL `<pages>/edit/EditForm/<page>/field/<area>/item/<id>[/edit]`, which the block list's
 * Edit link and `CMSEditLink()` produce. The route is more specific than the pages section's `<pages>/*`,
 * so the router ranks it first and the pages pilet needs no change.
 *
 * The header names the block, with the page as the last crumb and the back target. The page's title is
 * the one the pages section's header showed when the editor came from the page form, or the schema
 * record's `parentTitle` on a direct load. A save emits records-changed for the block and for the page
 * (the tree's Modified badge); archive asks first, then goes back to the page.
 *
 * The form's SilverStripeNavigator is left out, as on the page form: the header carries the block's
 * preview URL (the patterns package's previewLinks) for the stage the action bar's Draft/Published toggle picks, so the shell's
 * own preview pane and mode menu replace it.
 */
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dialog, fieldTitle, navigatorField, previewLinks, Toggle } from '@silverstripe/admin-patterns';
import type { PreviewLinks, PreviewStage } from '@silverstripe/admin-patterns';
import type { FormField, FormSchemaRecord, FormSchemaResponse, FormSchemaState, PageComponentProps, PiletApi, SharedState } from '@silverstripe/admin-shell';
import { blockTitle } from './blocks';
import type { ElementType } from './blocks';
import type { RecordsChangedEvent } from './shell';

export interface BlockEditPageOptions {
  api: PiletApi;
  types: ReadonlyArray<ElementType>;
  pageClass: string;
  /** The pages section's router path, such as `/pages` */
  routePrefix: string;
  /** CMSPageEditController's URL, such as `admin/pages/edit` */
  editSectionUrl: string;
}

const confirmedActions = ['action_doArchive', 'action_doDelete'];

const recordId = /^[1-9]\d*$/;

const omittedFields = [navigatorField];

/**
 * The page's title from the header the pages section set while it edited this page, which is still
 * showing as the block editor first renders
 */
function shownPageTitle(state: SharedState, pageClass: string, pageId: string): string | undefined {
  const { currentRecord, header } = state;
  if (currentRecord?.recordClass !== pageClass || String(currentRecord.id) !== pageId || !header?.views?.length) {
    return undefined;
  }
  // The pages section's fallback title for a page the tree has not loaded (pageSectionHeader in the pages pilet)
  return header.title === `Page ${pageId}` ? undefined : header.title;
}

export function blockEditRoute(routePrefix: string): string {
  return `${routePrefix}/edit/EditForm/:pageId/field/:area/item/:blockId/*`;
}

interface Confirming {
  action: FormField;
  resolve: (confirmed: boolean) => void;
}

export function createBlockEditPage(options: BlockEditPageOptions): React.ComponentType<PageComponentProps> {
  const { api, types, pageClass, routePrefix, editSectionUrl } = options;
  const FormSchemaForm = api.getSilverstripeComponent('FormSchemaForm');

  interface BlockEditorProps {
    pageId: string;
    area: string;
    blockId: string;
  }

  // Keyed by the block, so a route element reused for another block starts with that block's state
  const BlockEditor = ({ pageId, area, blockId }: BlockEditorProps) => {
    const navigate = useNavigate();
    const [record, setRecord] = React.useState<FormSchemaRecord | null>(null);
    const [confirming, setConfirming] = React.useState<Confirming | null>(null);
    const [leaving, setLeaving] = React.useState(false);
    const [links, setLinks] = React.useState<PreviewLinks>({});
    const [stage, setStage] = React.useState<PreviewStage>('draft');
    const unsaved = api.useSharedState((state) => state.unsavedChanges);
    const shownTitle = api.useSharedState((state) => shownPageTitle(state, pageClass, pageId));
    // Kept from the first render: this page's own header replaces the one it was read from
    const [inheritedTitle] = React.useState(shownTitle);
    const pagePath = `${routePrefix}/edit/show/${pageId}`;
    const pageTitle = inheritedTitle || record?.parentTitle || undefined;
    const preview = links[stage];
    const type = types.find((candidate) => candidate.class === record?.className);
    const title = record ? blockTitle(record, type) : `Block #${blockId}`;

    React.useEffect(
      () =>
        api.setSectionHeader({
          title,
          badge: type?.title,
          crumbs: [
            { label: 'Pages', to: `${routePrefix}/` },
            { label: pageTitle ?? `Page #${pageId}`, to: pagePath },
          ],
          backTo: pagePath,
          backLabel: `Back to ${pageTitle ?? 'page'}`,
          ...(preview ? { preview } : {}),
        }),
      [title, type?.title, pageId, pageTitle, pagePath, preview],
    );

    const onStateChange = React.useCallback(
      (state: FormSchemaState) => setLinks(previewLinks(state.fields, window.location.href)),
      [],
    );

    // Leaving unmounts the archived form, which clears its unsaved changes. The guard's blocker updates in
    // its own effect, so the navigation waits a tick past the commit that saw the changes cleared
    React.useEffect(() => {
      if (!leaving || unsaved) {
        return undefined;
      }
      const timer = window.setTimeout(() => navigate(pagePath));
      return () => window.clearTimeout(timer);
    }, [leaving, unsaved, navigate, pagePath]);

    const onSubmitted = (response: FormSchemaResponse, action: FormField) => {
      const saved = response.record as FormSchemaRecord | undefined;
      if (!saved) {
        return;
      }
      const blockEvent: RecordsChangedEvent = { recordClass: saved.className, ids: saved.id ? [saved.id] : [Number(blockId)] };
      const pageEvent: RecordsChangedEvent = { recordClass: pageClass, ids: [Number(pageId)] };
      api.emit(api.recordsChangedEvent, blockEvent);
      api.emit(api.recordsChangedEvent, pageEvent);
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
        {!leaving && (
          <FormSchemaForm
            schemaUrl={`${editSectionUrl}/EditForm/${pageId}/field/${area}/item/${blockId}/schema`}
            trackUnsavedChanges
            onLoad={(response: FormSchemaResponse) => setRecord((response.record as FormSchemaRecord | undefined) ?? null)}
            onStateChange={onStateChange}
            omitFields={omittedFields}
            previewControls={
              <Toggle<PreviewStage>
                label="Stage"
                options={[
                  { key: 'draft', label: 'Draft', disabled: false },
                  { key: 'live', label: 'Published', disabled: !links.live },
                ]}
                value={stage}
                onChange={setStage}
              />
            }
            onSubmitted={onSubmitted}
            confirmAction={confirmAction}
          />
        )}
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

  const BlockEditPage = () => {
    const { pageId = '', area = '', blockId = '' } = useParams();
    if (!recordId.test(pageId) || !recordId.test(blockId) || area === '') {
      return (
        <div className="shell-page">
          <p className="shell-page__inset">This block address is not valid.</p>
        </div>
      );
    }
    return <BlockEditor key={`${pageId}/${area}/${blockId}`} pageId={pageId} area={area} blockId={blockId} />;
  };
  return BlockEditPage;
}
