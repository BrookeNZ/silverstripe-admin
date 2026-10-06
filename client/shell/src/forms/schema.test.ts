import { describe, expect, it } from 'vitest';
import { errorField, mergeFields, uniqueMessages } from './schema';
import type { FieldSchema } from './types';

const schemaField = (name: string, id: string): FieldSchema => ({
  name,
  id,
  type: 'text',
  schemaType: 'Text',
  component: null,
  title: name,
  readOnly: false,
  disabled: false,
  data: [],
});

describe('errorField', () => {
  const fields = mergeFields([schemaField('Title', 'Form_Title'), schemaField('ViewerMembers[]', 'Form_ViewerMembers')], undefined);

  it('matches a server error to a multi-value field by its name without brackets', () => {
    expect(errorField(fields, 'ViewerMembers')?.id).toBe('Form_ViewerMembers');
    expect(errorField(fields, 'Title')?.id).toBe('Form_Title');
  });

  it('leaves form-level and unknown errors unmatched', () => {
    expect(errorField(fields, null)).toBeUndefined();
    expect(errorField(fields, 'Nothing')).toBeUndefined();
  });
});

describe('uniqueMessages', () => {
  it('shows each message text once and skips what a field already shows', () => {
    const inline = { type: 'error', value: '"Filename" is required', field: 'Name' };
    expect(
      uniqueMessages(
        [
          { type: 'error', value: 'Save failed' },
          { type: 'error', value: 'Save failed' },
          { type: 'error', value: '"Filename" is required' },
        ],
        [inline],
      ),
    ).toEqual([{ type: 'error', value: 'Save failed' }]);
  });
});

describe('mergeFields', () => {
  it('turns FormSchema data into the plain props the shared components read', () => {
    const [select] = mergeFields(
      [{ ...schemaField('Parent', 'Form_Parent'), data: { hasEmptyDefault: true, emptyString: '(none)', maxlength: 20 } }],
      undefined,
    );
    expect(select).toMatchObject({ emptyOption: '(none)', maxLength: 20, primary: false, headingLevel: null });
  });
});
