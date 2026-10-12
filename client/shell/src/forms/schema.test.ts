import { describe, expect, it } from 'vitest';
import {
  actionBarFields,
  barActions,
  dialogActions,
  defaultValues,
  encodeSubmission,
  errorField,
  mergeFields,
  schemaText,
  uniqueMessages,
  withChangedActions,
  withoutFields,
} from './schema';
import { serverMessage } from '../state/serverRequest';
import type { FieldSchema, FormField } from './types';

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

describe('defaultValues', () => {
  const field = (key: string, schemaType: string | null, value: unknown) => ({ key, schemaType, value }) as unknown as FormField;

  it('starts an empty text-like field as "", the value its input reports once emptied', () => {
    expect(
      defaultValues([field('Title', 'String', null), field('Content', 'HTML', undefined), field('Sort', 'Integer', null), field('Title2', 'Text', 'Kept')]),
    ).toEqual({ Title: '', Content: '', Sort: '', Title2: 'Kept' });
  });

  it('keeps null for fields whose empty value is not text', () => {
    expect(defaultValues([field('ParentID', 'SingleSelect', null), field('Image', 'Custom', null), field('Plain', null, null)])).toEqual({
      ParentID: null,
      Image: null,
      Plain: null,
    });
  });
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

describe('withoutFields', () => {
  it('leaves out the named fields at any depth', () => {
    const fields = mergeFields(
      [
        schemaField('TitleHeader', 'Form_TitleHeader'),
        { ...schemaField('Root', 'Form_Root'), children: [schemaField('Title', 'Form_Title'), schemaField('TitleHeader', 'Form_Nested')] },
      ],
      undefined,
    );
    const kept = withoutFields(fields, ['TitleHeader']);
    expect(kept.map((field) => field.name)).toEqual(['Root']);
    expect(kept[0].children.map((field) => field.name)).toEqual(['Title']);
    expect(withoutFields(fields, [])).toBe(fields);
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

const action = (name: string, extraClass: string, extra: Partial<FieldSchema> = {}): FieldSchema => ({
  ...schemaField(name, `Form_EditForm_${name}`),
  type: 'submit',
  schemaType: null,
  component: 'FormAction',
  extraClass,
  ...extra,
});

// The page form's actions as SiteTree::getCMSActions() sends them for a published, unchanged page
const pageActions = (): Array<FieldSchema> => [
  {
    ...schemaField('MajorActions', 'Form_EditForm_MajorActions'),
    component: 'CompositeField',
    schemaType: 'Structural',
    children: [
      action('action_save', 'action btn btn--primary btn-outline-primary', {
        title: 'Saved',
        data: { icon: 'tick' },
        attributes: {
          'data-icon-alternate': 'save',
          'data-btn-alternate-add': 'btn-primary',
          'data-btn-alternate-remove': 'btn-outline-primary',
          'data-text-alternate': 'Save',
        },
      }),
      action('action_publish', 'action btn btn--primary btn-outline-primary', {
        title: 'Published',
        data: { icon: 'tick' },
        attributes: {
          'data-icon-alternate': 'rocket',
          'data-btn-alternate-add': 'btn-primary',
          'data-btn-alternate-remove': 'btn-outline-primary',
          'data-text-alternate': 'Publish',
        },
      }),
    ],
  },
  {
    ...schemaField('ActionMenus', 'Form_EditForm_ActionMenus'),
    component: 'Tabs',
    schemaType: 'Structural',
    children: [
      {
        ...schemaField('MoreOptions', 'Form_EditForm_MoreOptions'),
        title: 'More options',
        component: 'TabItem',
        schemaType: 'Structural',
        children: [action('action_unpublish', 'action btn btn--primary btn-secondary')],
      },
    ],
  },
];

describe('action variants', () => {
  it('follows the legacy FormAction rule: a Bootstrap colour class, else save and constructive are primary', () => {
    const actions = mergeFields(
      [
        action('action_publish', 'action btn btn--primary btn-primary'),
        action('action_save', 'action btn btn--primary btn-outline-primary'),
        action('action_save', 'action btn btn--primary'),
        action('action_publish', 'action btn btn--primary'),
        action('action_doSomething', 'action btn ss-ui-action-constructive'),
        action('action_delete', 'action btn btn--primary', { data: { buttonStyle: 'primary' } }),
      ],
      undefined,
    );
    expect(actions.map((field) => field.primary)).toEqual([true, false, true, false, true, true]);
  });
});

describe('withChangedActions', () => {
  it('swaps Saved and Published to their primary alternates at any depth', () => {
    const merged = mergeFields(pageActions(), undefined);
    expect(merged[0].children.map((field) => [field.title, field.primary, field.icon])).toEqual([
      ['Saved', false, 'tick'],
      ['Published', false, 'tick'],
    ]);
    const [group] = withChangedActions(merged);
    expect(group.children.map((field) => [field.title, field.primary, field.icon, field.extraClass])).toEqual([
      ['Save', true, 'save', 'action btn btn--primary btn-primary'],
      ['Publish', true, 'rocket', 'action btn btn--primary btn-primary'],
    ]);
  });

  it('returns actions without alternates unchanged', () => {
    const merged = mergeFields([action('action_unpublish', 'btn btn-secondary')], undefined);
    expect(withChangedActions(merged)).toEqual(merged);
  });
});

describe('actionBarFields', () => {
  it('lays the major actions in a row and turns each More options tab into an untitled popover opening upwards', () => {
    const [group, menu, ...rest] = actionBarFields(mergeFields(pageActions(), undefined));
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ name: 'MajorActions', component: 'FieldGroup', componentCandidates: ['FieldGroup'] });
    expect(menu).toMatchObject({
      name: 'MoreOptions',
      component: 'MenuField',
      componentCandidates: ['MenuField'],
      title: null,
      buttonLabel: 'More options',
      placement: 'top',
    });
    expect(menu.children.map((field) => field.name)).toEqual(['action_unpublish']);
  });
});

describe('dialogActions', () => {
  it('flattens groups and tab sets into one row, in their changed form once dirty', () => {
    const clean = dialogActions(mergeFields(pageActions(), undefined), false);
    expect(clean.map((field) => [field.title, field.primary])).toEqual([
      ['Saved', false],
      ['Published', false],
      ['action_unpublish', false],
    ]);
    expect(clean.map((field) => field.name)).toEqual(['action_save', 'action_publish', 'action_unpublish']);
    const dirty = dialogActions(mergeFields(pageActions(), undefined), true);
    expect(dirty.slice(0, 2).map((field) => [field.title, field.primary])).toEqual([
      ['Save', true],
      ['Publish', true],
    ]);
  });
});

// The asset admin file form's Save and Publish as FileFormFactory sends them: the pristine and dirty sets
// arrive in the field state, not the schema
const fileActions = (publish: { isPublished: boolean; isModified: boolean }) =>
  mergeFields(
    [action('action_save', '', { data: { icon: 'save' } }), action('action_publish', '', { data: { icon: 'rocket' } })],
    {
      id: 'Form_fileEditForm',
      fields: [
        {
          id: 'Form_EditForm_action_save',
          name: 'action_save',
          value: null,
          message: null,
          data: { pristineTitle: 'Saved', pristineIcon: 'tick', dirtyTitle: 'Save', dirtyIcon: 'save', pristineClass: 'btn-outline-primary', dirtyClass: '' },
        },
        {
          id: 'Form_EditForm_action_publish',
          name: 'action_publish',
          value: null,
          message: null,
          data: {
            ...publish,
            pristineTitle: 'Published',
            pristineIcon: 'tick',
            dirtyTitle: 'Publish',
            dirtyIcon: 'rocket',
            pristineClass: 'btn-outline-primary',
            dirtyClass: 'btn-primary',
          },
        },
      ],
      messages: [],
    },
  );

const shown = (fields: Array<FormField>) => fields.map((field) => [field.title, field.primary, field.icon]);

describe('barActions on the file form', () => {
  it('draws an unpublished file as the design does: outlined Saved, filled Publish', () => {
    expect(shown(barActions(fileActions({ isPublished: false, isModified: false }), false))).toEqual([
      ['Saved', false, 'tick'],
      ['Publish', true, 'rocket'],
    ]);
  });

  it('outlines and ticks Published only while the published file is unchanged', () => {
    expect(shown(barActions(fileActions({ isPublished: true, isModified: true }), false))[1]).toEqual(['Publish', true, 'rocket']);
    expect(shown(barActions(fileActions({ isPublished: true, isModified: false }), false))).toEqual([
      ['Saved', false, 'tick'],
      ['Published', false, 'tick'],
    ]);
  });

  it('fills both once the form has changes', () => {
    expect(shown(barActions(fileActions({ isPublished: true, isModified: false }), true))).toEqual([
      ['Save', true, 'save'],
      ['Publish', true, 'rocket'],
    ]);
  });
});

describe('barActions on a page just created', () => {
  it('lands clean: outlined Saved, filled Publish, as SiteTree sends a draft-only page', () => {
    const [save, publish] = pageActions()[0].children!;
    const draftOnly = mergeFields(
      [{ ...pageActions()[0], children: [save, { ...publish, title: 'Publish', extraClass: 'action btn btn--primary btn-primary', data: { icon: 'rocket' } }] }],
      undefined,
    );
    expect(shown(barActions(draftOnly, false)[0].children)).toEqual([
      ['Saved', false, 'tick'],
      ['Publish', true, 'rocket'],
    ]);
  });
});

describe('encodeSubmission', () => {
  const fields = mergeFields(
    [
      schemaField('Title', 'Form_Title'),
      schemaField('ShowInMenus', 'Form_ShowInMenus'),
      schemaField('ViewerMembers[]', 'Form_ViewerMembers'),
      schemaField('HeroImage', 'Form_HeroImage'),
      schemaField('Rows', 'Form_Rows'),
    ],
    undefined,
  );
  const encode = (values: Record<string, unknown>) =>
    [...encodeSubmission(fields, Object.fromEntries(fields.map((field) => [field.key, values[field.name]])), 'action_save')];

  it('posts scalars, booleans and null values as single entries', () => {
    expect(encode({ Title: 'Home', ShowInMenus: true, HeroImage: null, Rows: null })).toEqual([
      ['Title', 'Home'],
      ['ShowInMenus', '1'],
      ['HeroImage', ''],
      ['Rows', ''],
      ['action_save', '1'],
    ]);
  });

  it('posts a multi-value field once per item, unwrapping option objects', () => {
    expect(encode({ 'ViewerMembers[]': ['3', { value: 4, label: 'Four' }] })).toContainEqual(['ViewerMembers[]', '4']);
    expect(encode({ 'ViewerMembers[]': ['3'] })).toContainEqual(['ViewerMembers[]', '3']);
  });

  it('posts the empty marker a multi-value field holds as its one item', () => {
    expect(encode({ 'ViewerMembers[]': 'unchanged' })).toContainEqual(['ViewerMembers[]', 'unchanged']);
  });

  it('posts a nested object with PHP keys', () => {
    expect(encode({ HeroImage: { Files: [12, 13] } })).toEqual(
      expect.arrayContaining([
        ['HeroImage[Files][]', '12'],
        ['HeroImage[Files][]', '13'],
      ]),
    );
    expect(encode({ Rows: [{ Key: 'a', Value: 'b' }] })).toEqual(
      expect.arrayContaining([
        ['Rows[0][Key]', 'a'],
        ['Rows[0][Value]', 'b'],
      ]),
    );
  });

  it('leaves out an undefined value, so the merge keeps the saved one instead of clearing it', () => {
    expect(encode({ Title: 'Home', ShowInMenus: false, HeroImage: { Files: [12], Caption: undefined } })).toEqual([
      ['Title', 'Home'],
      ['ShowInMenus', '0'],
      ['HeroImage[Files][]', '12'],
      ['action_save', '1'],
    ]);
  });

  it('posts a nested object that has a value key in full, unless it is shaped like an option', () => {
    expect(encode({ Rows: { value: 'b', Key: 'a' } })).toEqual(
      expect.arrayContaining([
        ['Rows[value]', 'b'],
        ['Rows[Key]', 'a'],
      ]),
    );
    expect(encode({ Rows: { value: 7, label: 'Seven', selected: true } })).toContainEqual(['Rows', '7']);
  });

  it('posts an option whose value is an object as that nested value', () => {
    expect(encode({ Rows: { value: { ID: 5, Class: 'Page' }, label: 'Home' } })).toEqual(
      expect.arrayContaining([
        ['Rows[ID]', '5'],
        ['Rows[Class]', 'Page'],
      ]),
    );
  });

  it('posts a date as the ISO format its field parses, and refuses a file', () => {
    const dated = mergeFields(
      [
        { ...schemaField('Published', 'Form_Published'), schemaType: 'Date' },
        { ...schemaField('Embargo', 'Form_Embargo'), schemaType: 'Datetime' },
        { ...schemaField('Opens', 'Form_Opens'), schemaType: 'Time' },
      ],
      undefined,
    );
    const when = new Date(2026, 9, 11, 9, 5, 7);
    const values = Object.fromEntries(dated.map((field) => [field.key, when]));
    expect([...encodeSubmission(dated, values, 'action_save')]).toEqual([
      ['Published', '2026-10-11'],
      ['Embargo', '2026-10-11T09:05:07'],
      ['Opens', '09:05:07'],
      ['action_save', '1'],
    ]);
    expect(() => encode({ HeroImage: new File(['x'], 'x.txt') })).toThrow(/File/);
  });

  it('posts nothing for an empty array, so a cleared upload detaches', () => {
    const entries = encode({ HeroImage: { Files: [] }, 'ViewerMembers[]': [] });
    expect(entries.some(([name]) => name.startsWith('HeroImage') || name.startsWith('ViewerMembers'))).toBe(false);
  });
});
