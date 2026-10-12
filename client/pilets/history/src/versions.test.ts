import { describe, expect, it } from 'vitest';
import type { Version } from './api';
import { canRevertTo } from './versions';

const version = (flags: Partial<Version> = {}): Version => ({
  version: 3,
  author: { firstName: 'Ada', surname: 'Lovelace' },
  publisher: { firstName: '', surname: '' },
  deleted: false,
  draft: true,
  published: false,
  liveVersion: false,
  latestDraftVersion: false,
  lastEdited: '2026-10-07 11:40:04',
  ...flags,
});

describe('canRevertTo', () => {
  it('offers revert for any version but the newest, to a member who can edit', () => {
    expect(canRevertTo(version({ version: 3 }), 8, true)).toBe(true);
    expect(canRevertTo(version({ version: 8 }), 8, true)).toBe(false);
    expect(canRevertTo(version({ version: 3 }), 8, false)).toBe(false);
    expect(canRevertTo(version({ version: 3 }), null, true)).toBe(false);
  });
});
