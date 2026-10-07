import { describe, expect, it } from 'vitest';
import { availableKinds, kindForHref, linkKinds, linkSchemaUrl, stateValues } from './links';

const kind = (name: string) => linkKinds.find((entry) => entry.name === name)!;

describe('link kinds', () => {
  it('recognise an existing link by its href', () => {
    expect(kindForHref('[sitetree_link,id=4]')?.name).toBe('editorInternalLink');
    expect(kindForHref('[sitetree_link id="4"]')?.name).toBe('editorInternalLink');
    expect(kindForHref('[sitetree_link,id=4]#team')?.name).toBe('editorAnchorLink');
    expect(kindForHref('#team')?.name).toBe('editorAnchorLink');
    expect(kindForHref('[file_link,id=9]')?.name).toBe('EditorFileLink');
    expect(kindForHref('mailto:a@example.com')?.name).toBe('EditorEmailLink');
    expect(kindForHref('tel:+6441234567')?.name).toBe('EditorPhoneLink');
    expect(kindForHref('https://example.com/#x')?.name).toBe('EditorExternalLink');
  });

  it('fall back to an offered kind when the matching one is not offered', () => {
    const offered = [kind('editorInternalLink'), kind('EditorEmailLink')];
    expect(kindForHref('[file_link,id=9]', offered)?.name).toBe('editorInternalLink');
  });

  it('read a link back into its form values', () => {
    expect(kind('editorInternalLink').values({ href: '[sitetree_link,id=4]', title: 'About', target: '_blank' })).toEqual({
      PageID: '4',
      Description: 'About',
      TargetBlank: '1',
    });
    expect(kind('editorAnchorLink').values({ href: '[sitetree_link,id=4]#team' })).toEqual({ PageID: '4', Anchor: 'team' });
    expect(kind('editorAnchorLink').values({ href: '#team' })).toEqual({ Anchor: 'team' });
    expect(kind('EditorExternalLink').values({ href: 'https://example.com/a#b' })).toEqual({ Link: 'https://example.com/a', Anchor: 'b' });
    expect(kind('EditorEmailLink').values({ href: 'mailto:a@example.com?subject=Hi%20there', target: '_blank' })).toEqual({
      Link: 'a@example.com',
      Subject: 'Hi there',
    });
    expect(kind('EditorPhoneLink').values({ href: 'tel:123' })).toEqual({ Link: '123' });
    expect(kind('EditorFileLink').values({ href: '[file_link,id=9]' })).toEqual({ FileID: '9' });
  });

  it('build the link from the values the server accepted', () => {
    expect(kind('editorInternalLink').attributes({ PageID: 4, Description: '', TargetBlank: true })).toEqual({
      href: '[sitetree_link,id=4]',
      title: undefined,
      target: '_blank',
    });
    expect(kind('editorAnchorLink').attributes({ PageID: '4', Anchor: '##team' }).href).toBe('[sitetree_link,id=4]#team');
    expect(kind('editorAnchorLink').attributes({ PageID: 0, Anchor: 'team' }).href).toBe('#team');
    expect(kind('EditorExternalLink').attributes({ Link: 'https://example.com', TargetBlank: 0 })).toEqual({
      href: 'https://example.com',
      title: undefined,
      target: undefined,
    });
    expect(kind('EditorExternalLink').attributes({ Link: 'http://' }).href).toBe('');
    expect(kind('EditorExternalLink').attributes({ Link: 'javascript:alert(1)' }).href).toBe('');
    expect(kind('EditorExternalLink').attributes({ Link: 'DATA:text/html,x' }).href).toBe('');
    expect(kind('EditorExternalLink').attributes({ Link: 'mailto:a@example.com' }).href).toBe('mailto:a@example.com');
    expect(kind('EditorEmailLink').attributes({ Link: 'a@example.com', Subject: 'Hi & bye', TargetBlank: 1 })).toEqual({
      href: 'mailto:a@example.com?subject=Hi%20%26%20bye',
      title: undefined,
      target: undefined,
    });
    expect(kind('EditorPhoneLink').attributes({ Link: ' 123 ' }).href).toBe('tel:123');
    expect(kind('EditorFileLink').attributes({ FileID: '9', Description: 'PDF' })).toEqual({ href: '[file_link,id=9]', title: 'PDF', target: undefined });
    expect(kind('EditorFileLink').attributes({ FileID: '0' }).href).toBe('');
  });

  it('offer only the kinds the server has a form for, in dialog order', () => {
    const offered = availableKinds({
      form: {
        EditorEmailLink: { schemaUrl: 'email/:pageid' },
        editorInternalLink: { schemaUrl: 'page/:pageid' },
        SomethingElse: { schemaUrl: 'other' },
      },
    });
    expect(offered.map((entry) => entry.kind.name)).toEqual(['editorInternalLink', 'EditorEmailLink']);
    expect(availableKinds(undefined)).toEqual([]);
  });

  it('put the item, the text requirement and the values in the schema URL', () => {
    expect(linkSchemaUrl('modals/x/:pageid', { itemId: 3, requireText: true, values: { Link: 'a b' } })).toBe('modals/x/3?Link=a+b&requireLinkText=1');
    expect(linkSchemaUrl('modals/x/:pageid', {})).toBe('modals/x/0');
  });

  it('read the values from a FormSchema state', () => {
    expect(stateValues({ fields: [{ name: 'Link', value: 'x' }, { value: 'nameless' }] })).toEqual({ Link: 'x' });
  });
});
