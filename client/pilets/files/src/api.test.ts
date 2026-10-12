import { describe, expect, it, vi } from 'vitest';
import { endpointSort, readFolder, readFolderUrl, readSort } from './api';

const endpoint = 'https://cms.test/admin/assets/api/read/';

describe('readFolderUrl', () => {
  it('names the folder in the path and the page in the query', () => {
    expect(readFolderUrl(endpoint, 3, 2)).toBe('https://cms.test/admin/assets/api/read/3?page=2');
  });

  it('reads the root as folder 0 and copes with an endpoint without its trailing slash', () => {
    expect(readFolderUrl('https://cms.test/admin/assets/api/read', 0, 1)).toBe('https://cms.test/admin/assets/api/read/0?page=1');
  });

  it("sends a sort other than the endpoint's default as its field and direction", () => {
    expect(readFolderUrl(endpoint, 3, 1, '-lastEdited')).toBe('https://cms.test/admin/assets/api/read/3?page=1&sort=lastEdited%2Cdesc');
    expect(readFolderUrl(endpoint, 3, 1, 'title')).toBe('https://cms.test/admin/assets/api/read/3?page=1');
  });
});

describe('sort', () => {
  it("maps each URL sort to the endpoint's field and direction", () => {
    expect(endpointSort('title')).toBe('title,asc');
    expect(endpointSort('-title')).toBe('title,desc');
    expect(endpointSort('lastEdited')).toBe('lastEdited,asc');
    expect(endpointSort('-lastEdited')).toBe('lastEdited,desc');
  });

  it('reads an unknown or missing URL sort as title A-Z', () => {
    expect(readSort('-lastEdited')).toBe('-lastEdited');
    expect(readSort('size')).toBe('title');
    expect(readSort(null)).toBe('title');
  });
});

describe('readFolder', () => {
  const body = {
    id: 9,
    title: 'Logos',
    ancestors: [
      { id: 3, title: 'Brand' },
      { id: 5, title: '', name: 'print' },
    ],
    children: {
      pageInfo: { totalCount: 120 },
      nodes: [
        { id: 12, title: 'Archive', type: 'folder', category: 'folder', extension: '', thumbnail: null, size: null, lastEdited: '2021-02-22 09:00:00' },
        {
          id: 40,
          title: '',
          name: 'logo.svg',
          type: 'file',
          category: 'image',
          extension: 'svg',
          thumbnail: '/assets/logo.svg',
          size: '13 KB',
          lastEdited: '2023-04-13 10:30:00',
          draft: true,
        },
      ],
    },
  };

  it('requests the page through the shell fetch and passes the abort signal', async () => {
    const request = vi.fn().mockResolvedValue(body);
    const signal = new AbortController().signal;
    await readFolder(request, endpoint, 9, 3, 'title', signal);
    expect(request).toHaveBeenCalledWith('https://cms.test/admin/assets/api/read/9?page=3', { signal });
  });

  it('maps the folder, its ancestors and its children, falling back to the file name for a blank title', async () => {
    const listing = await readFolder(vi.fn().mockResolvedValue(body), endpoint, 9, 3, 'title');
    expect(listing).toMatchObject({ id: 9, title: 'Logos', totalCount: 120, page: 3, pageCount: 3 });
    expect(listing.ancestors).toEqual([
      { id: 3, title: 'Brand' },
      { id: 5, title: 'print' },
    ]);
    expect(listing.items).toEqual([
      { id: 12, title: 'Archive', type: 'folder', category: 'folder', extension: '', thumbnail: null, size: null, lastEdited: '2021-02-22 09:00:00', draft: false },
      {
        id: 40,
        title: 'logo.svg',
        type: 'file',
        category: 'image',
        extension: 'svg',
        thumbnail: '/assets/logo.svg',
        size: '13 KB',
        lastEdited: '2023-04-13 10:30:00',
        draft: true,
      },
    ]);
  });

  it("reads whether the folder takes new folders from the folder's own canEdit", async () => {
    const listing = await readFolder(vi.fn().mockResolvedValue({ ...body, canEdit: false }), endpoint, 9, 3, 'title');
    expect(listing.canEdit).toBe(false);
  });

  it('gives the root no title and an empty folder one page', async () => {
    const root = { title: null, canEdit: true, children: { pageInfo: { totalCount: 0 }, nodes: [] } };
    const listing = await readFolder(vi.fn().mockResolvedValue(root), endpoint, 0, 1, 'title');
    expect(listing).toMatchObject({ id: 0, title: null, canEdit: true, ancestors: [], items: [], pageCount: 1 });
  });
});
