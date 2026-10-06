import { describe, expect, it } from 'vitest';
import { fileTitle } from './assets';
import type { FieldState, FormSchemaState } from './forms/types';

const state = (values: Record<string, unknown>): FormSchemaState => ({
  id: 'Form_fileEditForm_2',
  messages: [],
  fields: Object.entries(values).map(([name, value]) => ({ name, id: name, value, message: null, data: [] }) as FieldState),
});

describe('fileTitle', () => {
  it('reads the title, then the file name when the title is blank', () => {
    expect(fileTitle(state({ Title: 'Screenshot', Name: 'shot.png' }))).toBe('Screenshot');
    expect(fileTitle(state({ Title: ' ', Name: 'shot.png' }))).toBe('shot.png');
    expect(fileTitle(state({}))).toBeNull();
  });
});
