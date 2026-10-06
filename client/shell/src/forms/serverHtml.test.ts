import { describe, expect, it } from 'vitest';
import { serverHtmlBinding } from './serverHtml';
import type { HtmlControl } from './serverHtml';

const control = (tag: string, name: string, type = '', multiple = false): HtmlControl => ({ tag, type, name, multiple });

describe('serverHtmlBinding', () => {
  it('binds a single plain control carrying the field name', () => {
    expect(serverHtmlBinding('Slug', [control('input', 'Slug', 'text')]).posts).toBe(true);
    expect(serverHtmlBinding('Slug', [control('input', 'Slug')]).posts).toBe(true);
    expect(serverHtmlBinding('Notes', [control('textarea', 'Notes')]).posts).toBe(true);
    expect(serverHtmlBinding('Colour', [control('select', 'Colour')]).posts).toBe(true);
  });

  it('posts nothing for a control named otherwise', () => {
    expect(serverHtmlBinding('Slug', [control('input', 'Slug[0]', 'text')])).toEqual({
      posts: false,
      reason: 'its control is named Slug[0]',
    });
  });

  it('posts nothing for several named controls, or none', () => {
    expect(serverHtmlBinding('Money', [control('input', 'Money[Amount]'), control('select', 'Money[Currency]')]).posts).toBe(false);
    expect(serverHtmlBinding('Grid', []).reason).toBe('it has no named control');
  });

  it('posts nothing when the HTML has buttons, as a grid does', () => {
    expect(serverHtmlBinding('Grid', [control('input', 'Grid', 'text'), control('button', '')]).reason).toBe('it contains buttons');
    expect(serverHtmlBinding('Grid', [control('input', 'Grid', 'text'), control('input', 'action_x', 'submit')]).posts).toBe(false);
  });

  it('posts nothing for checkboxes, files and multiple selects', () => {
    expect(serverHtmlBinding('Agree', [control('input', 'Agree', 'checkbox')]).posts).toBe(false);
    expect(serverHtmlBinding('Upload', [control('input', 'Upload', 'file')]).posts).toBe(false);
    expect(serverHtmlBinding('Tags', [control('select', 'Tags', '', true)]).posts).toBe(false);
  });
});
