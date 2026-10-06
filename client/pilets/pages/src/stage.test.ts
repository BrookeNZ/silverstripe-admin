import { describe, expect, it } from 'vitest';
import { stageOptions } from './stage';

describe('stageOptions', () => {
  it('offers both stages for a published page', () => {
    expect(stageOptions([{ key: 'modified', text: 'Modified', title: null }])).toEqual([
      { key: 'draft', label: 'Draft', disabled: false },
      { key: 'live', label: 'Published', disabled: false },
    ]);
  });

  it('disables Published for a page that was never published', () => {
    const options = stageOptions([{ key: 'addedtodraft', text: 'Draft', title: null }]);
    expect(options.find((option) => option.key === 'live')?.disabled).toBe(true);
  });

  it('treats an unloaded tree node as published', () => {
    expect(stageOptions(undefined).every((option) => !option.disabled)).toBe(true);
  });
});
