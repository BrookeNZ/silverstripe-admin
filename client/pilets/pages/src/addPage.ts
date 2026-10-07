import type { CreatedPage, CreatePageApi } from './api';
import type { TreeStore } from './treeStore';

export interface AddPageSteps {
  client: Pick<CreatePageApi, 'create'>;
  store: Pick<TreeStore, 'childAdded'>;
  land(page: CreatedPage): void;
}

/** Creates the page, re-reads its parent so the tree holds the new row, then lands on its edit route */
export async function addPage({ client, store, land }: AddPageSteps, parentId: number, className: string): Promise<CreatedPage> {
  const page = await client.create(parentId, className);
  await store.childAdded(page.parentId).catch(() => undefined);
  land(page);
  return page;
}
