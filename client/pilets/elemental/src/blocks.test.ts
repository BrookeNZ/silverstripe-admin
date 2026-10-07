import { describe, expect, it } from 'vitest';
import { afterBlockId, blockStatus, moveBlock } from './blocks';

const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('blockStatus', () => {
  it('reads draft, modified and published from the publication flags', () => {
    expect(blockStatus({ isPublished: false, isLiveVersion: false })).toBe('draft');
    expect(blockStatus({ isPublished: true, isLiveVersion: false })).toBe('modified');
    expect(blockStatus({ isPublished: true, isLiveVersion: true })).toBe('published');
  });
});

describe('afterBlockId and moveBlock', () => {
  it('moves to the top after block 0', () => {
    expect(afterBlockId(list, 3, 0)).toBe(0);
    expect(moveBlock(list, 3, 0).map((block) => block.id)).toEqual([3, 1, 2, 4]);
  });

  it('moves up one place after the block two above', () => {
    expect(afterBlockId(list, 3, 1)).toBe(1);
    expect(moveBlock(list, 3, 1).map((block) => block.id)).toEqual([1, 3, 2, 4]);
  });

  it('moves down one place after the block that was below', () => {
    expect(afterBlockId(list, 2, 2)).toBe(3);
    expect(moveBlock(list, 2, 2).map((block) => block.id)).toEqual([1, 3, 2, 4]);
  });

  it('moves to the end after the last other block', () => {
    expect(afterBlockId(list, 1, 3)).toBe(4);
    expect(moveBlock(list, 1, 3).map((block) => block.id)).toEqual([2, 3, 4, 1]);
  });
});
