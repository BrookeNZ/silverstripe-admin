import { describe, expect, it } from 'vitest';
import { errorField, mergeFields, schemaText, serverMessage, uniqueMessages } from './schema';
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

describe('serverMessage', () => {
  it('joins the texts of a JSON error', () => {
    expect(
      serverMessage('{"status":"error","errors":[{"type":"error","code":400,"value":"Missing request params"}]}', 'application/json'),
    ).toBe('Missing request params');
  });

  it('takes the first line of a plain-text dev error and ignores HTML pages', () => {
    expect(serverMessage('ERROR [Emergency]: Uncaught LogicException: No component for SocialLinks\nIN GET /admin', 'text/html')).toBe(
      'ERROR [Emergency]: Uncaught LogicException: No component for SocialLinks',
    );
    expect(serverMessage('<!DOCTYPE html><html>', 'text/html')).toBeNull();
    expect(serverMessage('', null)).toBeNull();
  });
});

describe('schemaText', () => {
  it('reduces an { html } title or description to its text and passes anything else through', () => {
    expect(schemaText({ html: 'MFA <a href="/help">Learn more</a>' })).toBe('MFA Learn more');
    expect(schemaText('Plain')).toBe('Plain');
    expect(schemaText(null)).toBeNull();
    expect(schemaText(false)).toBe(false);
  });
});
