import { describe, expect, it } from 'vitest';
import { unsavedChangesLevel } from '@silverstripe/admin-patterns';

const minutes = { notice: 5, warning: 10 };

describe('unsavedChangesLevel', () => {
  it('is quiet while clean and plain while recently dirty', () => {
    expect(unsavedChangesLevel(false, 20 * 60000, minutes)).toBe('none');
    expect(unsavedChangesLevel(true, 0, minutes)).toBe('unsaved');
  });

  it('steps up at the notice and warning thresholds the field sends', () => {
    expect(unsavedChangesLevel(true, 5 * 60000 - 1, minutes)).toBe('unsaved');
    expect(unsavedChangesLevel(true, 5 * 60000, minutes)).toBe('notice');
    expect(unsavedChangesLevel(true, 10 * 60000, minutes)).toBe('warning');
    expect(unsavedChangesLevel(true, 60 * 60000, {})).toBe('unsaved');
  });
});
