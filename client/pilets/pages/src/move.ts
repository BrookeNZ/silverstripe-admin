/**
 * Moving a page in the tree: the client for admin/pages/move (PageMoveController in the admin module), the
 * drop rules the legacy tree checked before sending a move (LeftAndMain.Tree.js `check_move`), and the move
 * itself, which shows the page in its new place at once and puts it back when the server refuses.
 *
 * The server checks every rule again; these only keep the tree from offering a drop it would refuse.
 */
import { requestApi, toApiError } from './api';
import type { JsonRequest, PageNode } from './api';
import type { TreeStore } from './treeStore';

export interface MoveHints {
  canOrganise: boolean;
  canCreateTopLevel: boolean;
  /** Classes that may sit at the top level (`can_be_root` is not false) */
  rootClasses: Array<string>;
  /** Each class's `allowedChildren()`; empty when it takes none */
  allowedChildren: Record<string, Array<string>>;
}

export interface MoveRequest {
  id: number;
  parentId: number;
  /** The new parent's children in their new order, the moved page included; without it the page goes last */
  siblingIds?: Array<number>;
}

export interface MovedPage {
  id: number;
  parentId: number;
  previousParentId: number;
  sort: number | null;
  /** Rows the move changed, as updateSaveTreeNodeStatusUpdates reported them */
  modifiedIds: Array<number>;
}

export interface MoveApi {
  hints: () => Promise<MoveHints>;
  move: (request: MoveRequest) => Promise<MovedPage>;
}

/** `moveUrl` is the absolute URL of admin/pages/move/, the url_segment of PageMoveController */
export function createMoveApi(moveUrl: string, request: JsonRequest): MoveApi {
  return {
    hints: () => requestApi(request, new URL('hints', moveUrl).href),
    move: (move) => requestApi(request, new URL('page', moveUrl).href, { method: 'POST', body: move }),
  };
}

export function canDragPage(hints: MoveHints | null, node: PageNode): boolean {
  return Boolean(hints?.canOrganise) && node.canEdit && (node.parentId !== 0 || Boolean(hints?.canCreateTopLevel));
}

/**
 * `parent` is null for the top level; canEdit stands in for the parent's canAddChildren(). Like the legacy tree,
 * a class the hints leave out is not refused here, and a virtual page is checked by the class of the page it copies
 */
export function canDropPage(hints: MoveHints | null, node: PageNode, parent: PageNode | null): boolean {
  if (!hints || !canDragPage(hints, node)) {
    return false;
  }
  const nodeClass = node.copiedClassName ?? node.className;
  if (!parent) {
    return (
      hints.canCreateTopLevel &&
      (node.parentId === 0 || !Object.prototype.hasOwnProperty.call(hints.allowedChildren, nodeClass) || hints.rootClasses.includes(nodeClass))
    );
  }
  if (parent.id === node.id || !parent.canEdit) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(hints.allowedChildren, parent.className)) {
    return true;
  }
  const allowed = hints.allowedChildren[parent.className];
  return allowed.length > 0 && (node.parentId === parent.id || allowed.includes(nodeClass));
}

export interface MoveSteps {
  client: Pick<MoveApi, 'move'>;
  store: Pick<TreeStore, 'move' | 'moved' | 'node'> & { sessionExpired: boolean };
  notify: (message: string, type: 'success' | 'error') => void;
}

/**
 * Moves the page to `index` among the new parent's held children. `siblingIds` goes to the server only when
 * the new parent's children are all held, since the server numbers the siblings it is sent from 1
 */
export async function movePage(
  { client, store, notify }: MoveSteps,
  request: MoveRequest,
  index: number,
): Promise<boolean> {
  const title = store.node(request.id)?.title ?? 'the page';
  const undo = store.move(request.id, request.parentId, index);
  try {
    const moved = await client.move(request);
    notify(`Moved "${title}"`, 'success');
    await store.moved(moved).catch(() => undefined);
    return true;
  } catch (failure: unknown) {
    undo();
    const error = toApiError(failure);
    store.sessionExpired ||= error.sessionExpired;
    notify(`"${title}" could not be moved: ${error.message}`, 'error');
    return false;
  }
}
