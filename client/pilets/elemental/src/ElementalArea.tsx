/**
 * The elemental area field: the page's blocks as a sortable list with an "Add a block" button. It
 * replaces the legacy ElementEditor for `ElementalAreaField` and posts no value with the page form
 * (the schema sends its server HTML as a fallback holding no control, and the component never calls
 * onChange); every change goes through elemental's own endpoints instead.
 *
 * Inline-editable block types (QuoteBlock, CallToActionBlock, GlobalContentBlock here) expand into their
 * `elementForm` rendered by the shell's FormSchemaForm in headless mode; the rest link to their GridField
 * item URL, which the design opens as a page of its own (Figma 2:30205). Before the page form posts,
 * dirty blocks are saved one by one and a failure cancels the page save, as the legacy Entwine hook did.
 *
 * The dialogs render into the document body, because Enter in a control inside the page form would submit it.
 *
 * Every row but the last carries an add control that posts `insertAfterElementID`; the header button
 * appends, so the last row has none. The design draws no insert control, so it follows legacy elemental's
 * hover bar and shows on hover and on focus.
 *
 * Create, duplicate and the other writes answer 204 with no id, so the list is re-read after each; a new
 * block is the id the re-read adds. Reordering is dnd-kit with a drag handle (pointer and keyboard) plus
 * Move up and Move down in the block menu.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Link as RouterLink } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AddIcon, Button, Dialog } from '@silverstripe/admin-patterns';
import type { Block, ElementalApi } from './api';
import { afterBlockId, blockTitle, blockType, moveBlock } from './blocks';
import type { ElementType } from './blocks';
import { BlockRow, builtInActions, handleId, insertId, menuId } from './BlockRow';
import type { BlockAction, BuiltInBlockAction } from './BlockRow';
import { AddBlockDialog } from './AddBlockDialog';
import { closestEdge, stepByRow } from './collision';
import { InlineBlockForm } from './InlineBlockForm';
import type { AreaFieldProps, BlockActionsHookContext, ElementalPiletApi, FormSchemaFormHandle, RecordsChangedEvent } from './shell';

export interface ElementalAreaOptions {
  api: ElementalPiletApi;
  client: ElementalApi;
  types: ReadonlyArray<ElementType>;
  /** The block form's schema URL for a block id */
  schemaUrl(id: number): string;
  /** A block's edit URL as a router path, or null when it is outside the admin */
  routerPath(url: string): string | null;
  pageClass: string;
}

interface AreaProps {
  'elemental-area-id'?: number;
  'page-id'?: number;
  'allowed-elements'?: Array<string>;
}

const actionMessages: Readonly<Record<'publish' | 'unpublish' | 'archive' | 'duplicate', (title: string) => string>> = {
  publish: (title) => `Published "${title}"`,
  unpublish: (title) => `Unpublished "${title}"`,
  archive: (title) => `Archived "${title}"`,
  duplicate: (title) => `Duplicated "${title}"`,
};

/** The form id FormFieldSlot passes; derived from the field id (FormField::ID() is `<form id>_<name>`) on an older shell */
function containingFormId(props: AreaFieldProps): string {
  if (props.formId) {
    return props.formId;
  }
  const suffix = `_${props.field.name}`;
  return props.field.id.endsWith(suffix) ? props.field.id.slice(0, -suffix.length) : props.field.id;
}

/**
 * The text of a heading placed directly before the area, as a page with two areas names each with a
 * HeaderField; null when the field before it is anything else. Piral wraps every field in its own
 * piral-component element, so wrappers holding a single element are looked through
 */
export function precedingHeading(element: HTMLElement | null): string | null {
  let current = element;
  while (current && !current.previousElementSibling && !current.parentElement?.matches('form, .shell-form')) {
    current = current.parentElement;
  }
  let before = current?.previousElementSibling ?? null;
  while (before && !before.matches('h1, h2, h3, h4, h5, h6') && before.childElementCount === 1) {
    before = before.firstElementChild;
  }
  return before?.matches('h1, h2, h3, h4, h5, h6') ? before.textContent?.trim() || null : null;
}

function focusLater(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export function createElementalAreaField(options: ElementalAreaOptions): React.ComponentType<AreaFieldProps> {
  const { api, client, types, schemaUrl, routerPath, pageClass } = options;
  const FormSchemaForm = api.getSilverstripeComponent('FormSchemaForm');
  const renderRouterLink = ({ to, ...rest }: Record<string, unknown>) => <RouterLink {...(rest as object)} to={String(to)} />;

  const blockName = (block: Block) => blockTitle(block, blockType(block, types));
  const updateBlockActions = (actions: ReadonlyArray<BlockAction>, context: BlockActionsHookContext) =>
    api.runUpdateHook ? api.runUpdateHook('updateBlockActions', actions, context) : actions;

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

    const [blocks, setBlocks] = React.useState<Array<Block> | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(new Set());
    const [mounted, setMounted] = React.useState<ReadonlySet<number>>(new Set());
    const [dirty, setDirty] = React.useState<ReadonlySet<number>>(new Set());
    const [busy, setBusy] = React.useState<number | null>(null);
    const [saving, setSaving] = React.useState<ReadonlySet<number>>(new Set());
    const [adding, setAdding] = React.useState<'closed' | 'open' | 'posting'>('closed');
    const [addError, setAddError] = React.useState<string | null>(null);
    const [insertAfter, setInsertAfter] = React.useState<Block | null>(null);
    const creating = React.useRef(false);
    const root = React.useRef<HTMLDivElement>(null);
    const [areaTitle, setAreaTitle] = React.useState<string | null>(null);
    const [archiving, setArchiving] = React.useState<Block | null>(null);
    const handles = React.useRef(new Map<number, FormSchemaFormHandle>());
    const blocksRef = React.useRef(blocks);
    blocksRef.current = blocks;
    const emitting = React.useRef(false);
    const addButtonId = `${field.id}_add`;

    React.useLayoutEffect(() => setAreaTitle(precedingHeading(root.current)), []);

    const load = React.useCallback(
      async (signal?: AbortSignal) => {
        try {
          const read = await client.readElements(areaId, signal);
          setBlocks(read);
          setLoadError(null);
          return read;
        } catch (error) {
          if (!signal?.aborted) {
            setLoadError(error instanceof Error ? error.message : String(error));
          }
          return null;
        }
      },
      [areaId],
    );

    React.useEffect(() => {
      const abort = new AbortController();
      load(abort.signal);
      return () => abort.abort();
    }, [load]);

    const notifyChanged = React.useCallback(
      (changed: ReadonlyArray<Block>) => {
        emitting.current = true;
        try {
          for (const block of changed) {
            const type = blockType(block, types);
            const event: RecordsChangedEvent = { recordClass: type?.class ?? 'DNADesign\\Elemental\\Models\\BaseElement', ids: [block.id] };
            api.emit(api.recordsChangedEvent, event);
          }
          // A block change alters the page's Modified badge in the tree
          const pageEvent: RecordsChangedEvent = { recordClass: pageClass, ids: [pageId] };
          api.emit(api.recordsChangedEvent, pageEvent);
        } finally {
          emitting.current = false;
        }
      },
      [pageId],
    );

    // A page save or publish changes its blocks' state (publish publishes them), so re-read
    React.useEffect(() => {
      const refresh = ({ recordClass, ids }: RecordsChangedEvent) => {
        if (!emitting.current && recordClass === pageClass && ids.includes(pageId)) {
          load();
        }
      };
      api.on(api.recordsChangedEvent, refresh);
      return () => {
        api.off(api.recordsChangedEvent, refresh);
      };
    }, [load, pageId]);

    const setIn = (setter: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>, id: number, on: boolean) =>
      setter((current) => {
        if (current.has(id) === on) {
          return current;
        }
        const next = new Set(current);
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });

    /** Posts a block's form; true when saved. Expands the block on failure so its errors show */
    const saveBlock = React.useCallback(async (block: Block): Promise<boolean> => {
      const handle = handles.current.get(block.id);
      if (!handle) {
        return true;
      }
      setIn(setSaving, block.id, true);
      try {
        const result = await handle.submit('action_save');
        if (!result.ok) {
          setIn(setExpanded, block.id, true);
          api.showNotification(`"${blockName(block)}" could not be saved${result.message ? `: ${result.message}` : ''}`, {
            type: 'error',
          });
          return false;
        }
        return true;
      } finally {
        setIn(setSaving, block.id, false);
      }
    }, []);

    // Every successful block post lands here: the Save button, Enter in the form and the page save
    const onBlockSaved = async (block: Block) => {
      notifyChanged([block]);
      const read = await load();
      const saved = read?.find((candidate) => candidate.id === block.id) ?? block;
      api.showNotification(`Saved "${blockName(saved)}"`, { type: 'success', autoClose: 5000 });
    };

    // Page Save and Publish save every dirty block first and stop if one fails
    React.useEffect(() => {
      if (!api.registerHook) {
        return undefined;
      }
      return api.registerHook('onBeforeFormSubmit', async (context) => {
        if (context.formId !== formId) {
          return true;
        }
        const dirtyBlocks = (blocksRef.current ?? []).filter((block) => handles.current.get(block.id)?.isDirty());
        for (const block of dirtyBlocks) {
          if (!(await saveBlock(block))) {
            api.showNotification('The page was not saved because a block could not be saved', { type: 'error' });
            return false;
          }
        }
        return true;
      });
    }, [formId, saveBlock, notifyChanged]);


    const runWrite = async (block: Block, write: () => Promise<void>, message: string | null): Promise<Array<Block> | null> => {
      setBusy(block.id);
      try {
        await write();
        if (message) {
          api.showNotification(message, { type: 'success', autoClose: 5000 });
        }
        notifyChanged([block]);
        return await load();
      } catch (error) {
        api.showNotification(error instanceof Error ? error.message : String(error), { type: 'error' });
        // An optimistic move is undone by reading the order back
        await load();
        return null;
      } finally {
        setBusy(null);
      }
    };

    const move = async (block: Block, toIndex: number, focusId: string) => {
      const current = blocksRef.current ?? [];
      const after = afterBlockId(current, block.id, toIndex);
      setBlocks(moveBlock(current, block.id, toIndex));
      await runWrite(block, () => client.sort(block.id, after), null);
      focusLater(focusId);
    };

    const onAction = async (block: Block, action: BuiltInBlockAction) => {
      const index = (blocksRef.current ?? []).findIndex((candidate) => candidate.id === block.id);
      const title = blockName(block);
      switch (action) {
        case 'archive':
          setArchiving(block);
          return;
        case 'moveUp':
          await move(block, index - 1, menuId(block));
          return;
        case 'moveDown':
          await move(block, index + 1, menuId(block));
          return;
        case 'publish':
          // Publishing posts the saved draft, so unsaved inline changes are saved first
          if (handles.current.get(block.id)?.isDirty() && !(await saveBlock(block))) {
            return;
          }
          await runWrite(block, () => client.publish(block.id), actionMessages.publish(title));
          break;
        case 'unpublish':
          await runWrite(block, () => client.unpublish(block.id), actionMessages.unpublish(title));
          break;
        case 'duplicate': {
          const before = new Set((blocksRef.current ?? []).map((candidate) => candidate.id));
          const read = await runWrite(block, () => client.duplicate(block.id), actionMessages.duplicate(title));
          const copy = read?.find((candidate) => !before.has(candidate.id));
          if (copy) {
            focusLater(menuId(copy));
            return;
          }
          break;
        }
      }
      focusLater(menuId(block));
    };

    const confirmArchive = async () => {
      const block = archiving;
      setArchiving(null);
      if (!block) {
        return;
      }
      const list = blocksRef.current ?? [];
      const index = list.findIndex((candidate) => candidate.id === block.id);
      const neighbour = list[index + 1] ?? list[index - 1];
      await runWrite(block, () => client.archive(block.id), actionMessages.archive(blockName(block)));
      handles.current.delete(block.id);
      setIn(setDirty, block.id, false);
      focusLater(neighbour ? menuId(neighbour) : addButtonId);
    };

    const openAddDialog = (after: Block | null) => {
      setInsertAfter(after);
      setAddError(null);
      setAdding('open');
    };

    const addBlock = async (type: ElementType) => {
      // Two clicks in one tick both arrive before the loading state renders
      if (creating.current) {
        return;
      }
      creating.current = true;
      setAddError(null);
      setAdding('posting');
      const before = new Set((blocksRef.current ?? []).map((block) => block.id));
      try {
        await (insertAfter ? client.create(type.class, areaId, insertAfter.id) : client.create(type.class, areaId));
      } catch (error) {
        setAdding('open');
        setAddError(`The block could not be added: ${error instanceof Error ? error.message : String(error)}`);
        return;
      } finally {
        creating.current = false;
      }
      setAdding('closed');
      const read = await load();
      const created = read?.find((block) => !before.has(block.id));
      api.showNotification(`Added a ${type.title} block`, { type: 'success', autoClose: 5000 });
      if (created) {
        notifyChanged([created]);
        if (type.inlineEditable) {
          setIn(setMounted, created.id, true);
          setIn(setExpanded, created.id, true);
        }
        focusLater(menuId(created));
      } else {
        focusLater(insertAfter ? insertId(insertAfter) : addButtonId);
      }
    };

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor, { coordinateGetter: stepByRow }),
    );

    const titleOf = (id: number | string) => {
      const block = blocksRef.current?.find((candidate) => candidate.id === id);
      return block ? blockName(block) : 'block';
    };
    const positionOf = (id: number | string | undefined) => {
      const list = blocksRef.current ?? [];
      return `${list.findIndex((candidate) => candidate.id === id) + 1} of ${list.length}`;
    };
    const announcements: Announcements = {
      onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)}`,
      onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over position ${positionOf(over.id)}` : `${titleOf(active.id)} is not over a position`),
      onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)}` : `${titleOf(active.id)} dropped`),
      onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled`,
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
      const list = blocksRef.current ?? [];
      const block = list.find((candidate) => candidate.id === active.id);
      const toIndex = list.findIndex((candidate) => candidate.id === over?.id);
      if (!block || toIndex < 0 || over?.id === active.id) {
        return;
      }
      move(block, toIndex, handleId(block));
    };

    const editLink = (block: Block) => {
      const url = block.blockSchema.actions.edit;
      if (!url) {
        return null;
      }
      const path = routerPath(url);
      return path ? { to: path, inRouter: true } : { to: url, inRouter: false };
    };

    const heading = areaTitle ? `Blocks in ${areaTitle}` : 'Blocks';
    const addLabel = areaTitle ? `Add a block to ${areaTitle}` : 'Add a block';

    let list: React.ReactNode;
    if (loadError) {
      list = (
        <p className="elemental-area__status" role="alert">
          The blocks could not be loaded: {loadError}
        </p>
      );
    } else if (blocks === null) {
      list = (
        <p className="elemental-area__status" role="status">
          Loading blocks…
        </p>
      );
    } else if (blocks.length === 0) {
      list = <p className="elemental-area__status">Add blocks to place your content</p>;
    } else {
      list = (
        <DndContext
          sensors={sensors}
          collisionDetection={closestEdge}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: 'To move a block, press Space or Enter on its reorder button, use the arrow keys, then press Space or Enter to drop it, or Escape to cancel.',
            },
          }}
        >
          <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
            <ol className="elemental-area__list" aria-label={heading}>
              {blocks.map((block, index) => {
                const type = blockType(block, types);
                const isExpanded = expanded.has(block.id);
                return (
                  <BlockRow
                    key={block.id}
                    block={block}
                    type={type}
                    index={index}
                    count={blocks.length}
                    expanded={isExpanded}
                    dirty={dirty.has(block.id)}
                    busy={busy === block.id}
                    editLink={editLink(block)}
                    renderRouterLink={renderRouterLink}
                    onToggle={() => {
                      setIn(setMounted, block.id, true);
                      setIn(setExpanded, block.id, !isExpanded);
                    }}
                    actions={updateBlockActions(
                      builtInActions({ block, index, count: blocks.length }, (action) => onAction(block, action)),
                      { block, area: { id: areaId, pageId } },
                    )}
                    onInsertAfter={addableTypes.length > 0 && index < blocks.length - 1 ? () => openAddDialog(block) : undefined}
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
                          saving={saving.has(block.id)}
                          onDirtyChange={(isDirty) => setIn(setDirty, block.id, isDirty)}
                          onSave={() => saveBlock(block)}
                          onSaved={() => onBlockSaved(block)}
                        />
                      </div>
                    )}
                  </BlockRow>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      );
    }

    return (
      <div className="elemental-area" id={field.holderId} ref={root}>
        <div className="elemental-area__header">
          <h2 className="elemental-area__title">{heading}</h2>
          {addableTypes.length > 0 && (
            <Button id={addButtonId} variant="primary" icon={<AddIcon size="sm" />} aria-label={addLabel} onClick={() => openAddDialog(null)}>
              Add a block
            </Button>
          )}
        </div>
        {list}
        {createPortal(
          <>
            <AddBlockDialog
              open={adding !== 'closed'}
              header={insertAfter ? `Add a block after ${blockName(insertAfter)}` : addLabel}
              types={addableTypes}
              adding={adding === 'posting'}
              error={addError}
              onAdd={addBlock}
              onClose={() => setAdding('closed')}
            />
            <Dialog
              open={archiving !== null}
              onClose={() => setArchiving(null)}
              header={archiving ? `Archive "${blockName(archiving)}"?` : 'Archive block?'}
              body={<p>The block is removed from this page and kept in the archive.</p>}
              footer={
                <>
                  <Button variant="primary" onClick={confirmArchive}>
                    Archive
                  </Button>
                  <Button data-autofocus onClick={() => setArchiving(null)}>
                    Cancel
                  </Button>
                </>
              }
            />
          </>,
          document.body,
        )}
      </div>
    );
  };

  return ElementalArea as React.ComponentType<AreaFieldProps>;
}
