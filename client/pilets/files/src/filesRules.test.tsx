// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Gallery } from './Gallery';
import type { FileItem } from './api';
import { readFolder } from './api';
import { readFolderQuery } from './paths';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const hostile: FileItem = {
  id: 7,
  title: '<img src=x onerror="window.pwned=1">',
  type: 'file',
  category: 'image',
  extension: 'png',
  thumbnail: '/assets/x.png',
  size: '1 KB',
  lastEdited: '2026-01-01 00:00:00',
  draft: false,
};

describe('files pilet rules', () => {
  it('draws a hostile title as text in the tile, its link and its checkbox name', () => {
    act(() =>
      root.render(
        <MemoryRouter>
          <Gallery items={[hostile]} folderPath={(id) => `/f/${id}`} filePath={(id) => `/e/${id}`} />
        </MemoryRouter>,
      ),
    );
    expect(container.querySelectorAll('img[onerror]')).toHaveLength(0);
    expect(container.querySelector('.files-tile__name')?.textContent).toBe(hostile.title);
    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe(`Select ${hostile.title}`);
  });

  it('gives a file tile one tab stop and keeps View out of the accessibility tree', () => {
    act(() =>
      root.render(
        <MemoryRouter>
          <Gallery items={[hostile]} folderPath={(id) => `/f/${id}`} filePath={(id) => `/e/${id}`} />
        </MemoryRouter>,
      ),
    );
    const tabbable = [...container.querySelectorAll<HTMLElement>('a[href], button, input')].filter((element) => !(element as HTMLInputElement).disabled);
    expect(tabbable).toHaveLength(1);
    expect(container.querySelector('.files-tile__view')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back on unknown sort, view and page values rather than sending them', async () => {
    const query = readFolderQuery(new URLSearchParams('sort=size&view=grid&page=0'));
    expect(query).toEqual({ view: 'gallery', sort: 'title', page: 1 });
    const urls: Array<string> = [];
    await readFolder(async (url: string) => {
      urls.push(url);
      return null as never;
    }, 'https://cms.test/admin/assets/api/read/', 3, query.page, query.sort);
    expect(urls).toEqual(['https://cms.test/admin/assets/api/read/3?page=1']);
  });

  it('says a page past the end is past the end, not an empty folder', async () => {
    const listing = await readFolder(async () => ({ id: 3, title: 'Illustrations', children: { pageInfo: { totalCount: 15 }, nodes: [] } }) as never, 'https://cms.test/admin/assets/api/read/', 3, 9, 'title');
    // 15 items fit on page 1, so page 9 has nothing to show while the folder is not empty
    expect(listing.page).toBeLessThanOrEqual(listing.pageCount);
  });
});
