import { describe, expect, it } from 'vitest';
import {
  actionBarFields,
  errorField,
  mergeFields,
  schemaText,
  serverMessage,
  uniqueMessages,
  withChangedActions,
  withoutFields,
} from './schema';
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

  it('reads the action icon from the schema data', () => {
    const [save] = mergeFields([action('action_save', 'btn', { data: { icon: 'tick' } })], undefined);
    expect(save.icon).toBe('tick');
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
      component: 'PopoverField',
      componentCandidates: ['PopoverField'],
      title: null,
      buttonLabel: 'More options',
      placement: 'top',
    });
    expect(menu.children.map((field) => field.name)).toEqual(['action_unpublish']);
  });
});
