import { describe, expect, it } from 'vitest';
import type { Version } from './api';
import { canRevertTo, formatEdited, memberName, pageCount, versionStatus } from './versions';

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

describe('versions', () => {
  it('reads the status from the flags, archived first', () => {
    expect(versionStatus(version())).toBe('draft');
    expect(versionStatus(version({ published: true }))).toBe('published');
    expect(versionStatus(version({ published: true, deleted: true }))).toBe('archived');
  });

  it('names a member, or Unknown without one', () => {
    expect(memberName({ firstName: 'Default Admin', surname: null })).toBe('Default Admin');
    expect(memberName({ firstName: '', surname: '' })).toBe('Unknown');
    expect(memberName(null)).toBe('Unknown');
  });

  it('formats the server time and passes an unreadable one through', () => {
    expect(formatEdited('2026-10-07 11:40:04', 'en-NZ')).toMatch(/2026/);
    expect(formatEdited('not a date')).toBe('not a date');
  });

  it('counts at least one page', () => {
    expect(pageCount(0, 30)).toBe(1);
    expect(pageCount(30, 30)).toBe(1);
    expect(pageCount(31, 30)).toBe(2);
  });

  it('offers revert for any version but the newest, to a member who can edit', () => {
    expect(canRevertTo(version({ version: 3 }), 8, true)).toBe(true);
    expect(canRevertTo(version({ version: 8 }), 8, true)).toBe(false);
    expect(canRevertTo(version({ version: 3 }), 8, false)).toBe(false);
    expect(canRevertTo(version({ version: 3 }), null, true)).toBe(false);
  });
});
