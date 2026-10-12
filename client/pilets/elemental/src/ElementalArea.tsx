/**
 * The elemental area field: the page's blocks as a sortable list with an "Add a block" button. It
 * replaces the legacy ElementEditor for `ElementalAreaField` and posts no value with the page form
 * (the schema sends its server HTML as a fallback holding no control, and the component never calls
 * onChange); every change goes through elemental's own endpoints instead.
 *
 * Inline-editable block types (QuoteBlock, CallToActionBlock, GlobalContentBlock here) expand into their
 * `elementForm` rendered by the shell's FormSchemaForm in headless mode; the rest link to their GridField
 * item URL, which the design opens as a page of its own (Figma 2:30205). Dirty blocks are saved before
 * the page form posts (useBlockSaving).
 *
 * The dialogs render into the document body, because Enter in a control inside the page form would submit it.
 *
 * Every row but the last carries an add control that posts `insertAfterElementID`; the header button
 * appends, so the last row has none. The design draws no insert control, so it follows legacy elemental's
 * hover bar and shows on hover and on focus.
 *
 * This file composes the list (useBlockList), saving (useBlockSaving), the block actions
 * (useBlockActions), the add dialog (useAddBlock) and the sortable list. Reordering is dnd-kit with a
 * drag handle (pointer and keyboard) plus Move up and Move down in the block menu.
 */
import type { PiletApi } from '@silverstripe/admin-shell';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link as RouterLink } from 'react-router-dom';
import { AddIcon, Button } from '@silverstripe/admin-patterns';
import type { Block, ElementalApi } from './api';
import { blockTitle, blockType } from './blocks';
import type { ElementType } from './blocks';
import { BlockRow, builtInActions } from './BlockRow';
import type { BlockAction } from './BlockRow';
import { AddBlockDialog } from './AddBlockDialog';
import { ArchiveBlockDialog } from './ArchiveBlockDialog';
import { InlineBlockForm } from './InlineBlockForm';
import { SortableBlockList } from './SortableBlockList';
import { precedingHeading } from './areaDom';
import { reportFailure } from './reportFailure';
import { setIn } from './idSets';
import { useBlockList } from './useBlockList';
import { useBlockSaving } from './useBlockSaving';
import { useBlockActions } from './useBlockActions';
import { useAddBlock } from './useAddBlock';
import type { AreaFieldProps, BlockActionsHookContext } from './shell';

export { precedingHeading } from './areaDom';

export interface ElementalAreaOptions {
  api: PiletApi;
  client: ElementalApi;
  types: ReadonlyArray<ElementType>;
  /** The block form's schema URL for a block id */
  schemaUrl: (id: number) => string;
  pageClass: string;
}

interface AreaProps {
  'elemental-area-id'?: number;
  'page-id'?: number;
  'allowed-elements'?: Array<string>;
  data?: { blocks?: Array<Block> };
}

/** The form id FormFieldSlot passes; derived from the field id (FormField::ID() is `<form id>_<name>`) on an older shell */
function containingFormId(props: AreaFieldProps): string {
  if (props.formId) {
    return props.formId;
  }
  const suffix = `_${props.field.name}`;
  return props.field.id.endsWith(suffix) ? props.field.id.slice(0, -suffix.length) : props.field.id;
}

export function createElementalAreaField(options: ElementalAreaOptions): React.ComponentType<AreaFieldProps> {
  const { api, client, types, schemaUrl, pageClass } = options;
  const FormSchemaForm = api.getSilverstripeComponent('FormSchemaForm');
  const renderRouterLink = ({ to, ...rest }: Record<string, unknown>) => <RouterLink {...(rest as object)} to={String(to)} />;

  const blockName = (block: Block) => blockTitle(block, blockType(block, types));
  const report = (result: void | Promise<unknown>) => reportFailure(api, result);
  // Handlers other pilets add through the hook may reject too, so every one is reported
  const updateBlockActions = (actions: ReadonlyArray<BlockAction>, context: BlockActionsHookContext): Array<BlockAction> =>
    (api.runUpdateHook ? api.runUpdateHook('updateBlockActions', actions, context) : actions).map((action) => ({
      ...action,
      onSelect: (block: Block) => report(action.onSelect(block)),
    }));

  const editLink = (block: Block) => {
    const url = block.blockSchema.actions.edit;
    if (!url) {
      return null;
    }
    const path = api.routerPath(url);
    return path ? { to: path, inRouter: true } : { to: url, inRouter: false };
  };

  const ElementalArea = (props: AreaFieldProps & { field: AreaProps }) => {
    const { field } = props;
    const areaId = Number(field['elemental-area-id']);
    const pageId = Number(field['page-id']);
    const formId = containingFormId(props);
    const allowed = field['allowed-elements'];
    const addableTypes = React.useMemo(
      () => types.filter((type) => !type.broken && (!allowed || allowed.includes(type.class))),
      [allowed],
    );

    const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(new Set());
    const [mounted, setMounted] = React.useState<ReadonlySet<number>>(new Set());
    const [dirty, setDirty] = React.useState<ReadonlySet<number>>(new Set());
    const root = React.useRef<HTMLDivElement>(null);
    const [areaTitle, setAreaTitle] = React.useState<string | null>(null);
    const addButtonId = `${field.id}_add`;

    React.useLayoutEffect(() => setAreaTitle(precedingHeading(root.current)), []);

    const list = useBlockList({ api, client, types, pageClass, areaId, pageId, schemaBlocks: field.data?.blocks });
    const { blocks, load, notifyChanged } = list;
    const saving = useBlockSaving({
      api,
      formId,
      blocksRef: list.blocksRef,
      blockName,
      expand: (id) => setIn(setExpanded, id, true),
    });
    const { handles, saveBlock } = saving;
    const actions = useBlockActions({
      api,
      client,
      list,
      saving,
      blockName,
      forget: (id) => setIn(setDirty, id, false),
      addButtonId,
    });
    const add = useAddBlock({
      api,
      client,
      areaId,
      list,
      open: (id) => {
        setIn(setMounted, id, true);
        setIn(setExpanded, id, true);
      },
      addButtonId,
    });

    // Every successful block post lands here: the Save button, Enter in the form and the page save
    const onBlockSaved = async (block: Block) => {
      notifyChanged([block]);
      const read = await load();
      const saved = read?.find((candidate) => candidate.id === block.id) ?? block;
      api.showNotification(`Saved "${blockName(saved)}"`, { type: 'success', autoClose: 5000 });
    };

    const heading = areaTitle ? `Blocks in ${areaTitle}` : 'Blocks';
    const addLabel = areaTitle ? `Add a block to ${areaTitle}` : 'Add a block';

    const renderRow = (block: Block, index: number) => {
      const count = blocks?.length ?? 0;
      const isExpanded = expanded.has(block.id);
      return (
        <BlockRow
          key={block.id}
          block={block}
          type={blockType(block, types)}
          index={index}
          count={count}
          expanded={isExpanded}
          dirty={dirty.has(block.id)}
          busy={actions.busy === block.id}
          editLink={editLink(block)}
          renderRouterLink={renderRouterLink}
          onToggle={() => {
            setIn(setMounted, block.id, true);
            setIn(setExpanded, block.id, !isExpanded);
          }}
          actions={updateBlockActions(
            builtInActions({ block, index, count }, (action) => actions.onAction(block, action)),
            { block, area: { id: areaId, pageId } },
          )}
          onInsertAfter={addableTypes.length > 0 && index < count - 1 ? () => add.openAddDialog(block) : undefined}
        >
          {mounted.has(block.id) && (
            <div className="elemental-block__panel" hidden={!isExpanded}>
              <InlineBlockForm
                FormSchemaForm={FormSchemaForm}
                schemaUrl={schemaUrl(block.id)}
                regionId={`elemental-block-${block.id}-form`}
                title={blockName(block)}
                handleRef={(handle) => {
                  if (handle) {
                    handles.current.set(block.id, handle);
                  } else {
                    handles.current.delete(block.id);
                  }
                }}
                dirty={dirty.has(block.id)}
                saving={saving.saving.has(block.id)}
                onDirtyChange={(isDirty) => setIn(setDirty, block.id, isDirty)}
                onSave={() => report(saveBlock(block))}
                onSaved={() => report(onBlockSaved(block))}
              />
            </div>
          )}
        </BlockRow>
      );
    };

    const loadError = list.loadError && (
      <p className="elemental-area__status" role="alert">
        The blocks could not be loaded: {list.loadError}
      </p>
    );
    let content: React.ReactNode;
    if (blocks === null) {
      content = loadError || (
        <p className="elemental-area__status" role="status">
          Loading blocks…
        </p>
      );
    } else if (blocks.length === 0) {
      content = (
        <>
          {loadError}
          <p className="elemental-area__status">Add blocks to place your content</p>
        </>
      );
    } else {
      content = (
        <>
          {loadError}
          <SortableBlockList
            blocks={blocks}
            label={heading}
            blockName={blockName}
            onMove={(block, toIndex, focusId) => report(actions.move(block, toIndex, focusId))}
            renderRow={renderRow}
          />
        </>
      );
    }

    return (
      <div className="elemental-area" id={field.holderId} ref={root}>
        <div className="elemental-area__header">
          <h2 className="elemental-area__title">{heading}</h2>
          {addableTypes.length > 0 && (
            <Button id={addButtonId} variant="primary" icon={<AddIcon size="sm" />} aria-label={addLabel} onClick={() => add.openAddDialog(null)}>
              Add a block
            </Button>
          )}
        </div>
        {content}
        {createPortal(
          <>
            <AddBlockDialog
              open={add.adding !== 'closed'}
              header={add.insertAfter ? `Add a block after ${blockName(add.insertAfter)}` : addLabel}
              types={addableTypes}
              adding={add.adding === 'posting'}
              error={add.addError}
              onAdd={(type) => report(add.addBlock(type))}
              onClose={add.closeAddDialog}
            />
            <ArchiveBlockDialog
              title={actions.archiving ? blockName(actions.archiving) : null}
              onConfirm={() => report(actions.confirmArchive())}
              onCancel={actions.cancelArchive}
            />
          </>,
          document.body,
        )}
      </div>
    );
  };

  return ElementalArea as React.ComponentType<AreaFieldProps>;
}
