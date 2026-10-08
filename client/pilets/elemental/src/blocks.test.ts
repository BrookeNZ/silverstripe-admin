import { describe, expect, it } from 'vitest';
import { afterBlockId, blockStatus, blockTitle, moveBlock } from './blocks';

const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('blockStatus', () => {
  it('reads draft, modified and published from the publication flags', () => {
    expect(blockStatus({ isPublished: false, isLiveVersion: false })).toBe('draft');
    expect(blockStatus({ isPublished: true, isLiveVersion: false })).toBe('modified');
    expect(blockStatus({ isPublished: true, isLiveVersion: true })).toBe('published');
  });
});

describe('afterBlockId and moveBlock', () => {
  it.each([
    ['to the top after block 0', 3, 0, 0, [3, 1, 2, 4]],
    ['up one place after the block two above', 3, 1, 1, [1, 3, 2, 4]],
    ['down one place after the block that was below', 2, 2, 3, [1, 3, 2, 4]],
    ['to the end after the last other block', 1, 3, 4, [2, 3, 4, 1]],
  ])('moves %s', (_, id, index, after, order) => {
    expect(afterBlockId(list, id, index)).toBe(after);
    expect(moveBlock(list, id, index).map((block) => block.id)).toEqual(order);
  });
});

describe('blockTitle', () => {
  it('uses the title, then the type name, then a generic name', () => {
    expect(blockTitle({ title: ' Opening ' }, { title: 'Quote' })).toBe('Opening');
    expect(blockTitle({ title: '' }, { title: 'Quote' })).toBe('Quote block');
    expect(blockTitle({ title: null } as never, { title: 'Content block' })).toBe('Content block');
    expect(blockTitle({ title: '' })).toBe('Untitled block');
  });
});
