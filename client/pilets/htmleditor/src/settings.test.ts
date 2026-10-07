import { describe, expect, it } from 'vitest';
import { parseEditorConfig, withoutDeferredItems } from './settings';

describe('withoutDeferredItems', () => {
  it('drops the insert buttons and the groups they leave empty', () => {
    expect(
      withoutDeferredItems([
        'bold italic underline removeformat | alignleft aligncenter | bullist numlist outdent indent',
        'blocks | pastetext | table ssmedia ssembed sslink anchor unlink | code visualblocks',
        'ssmedia | ssembed',
      ]),
    ).toEqual([
      'bold italic underline removeformat | alignleft aligncenter | bullist numlist outdent indent',
      'blocks | pastetext | table anchor unlink | code visualblocks',
    ]);
  });

  it('leaves a missing toolbar alone', () => {
    expect(withoutDeferredItems(undefined)).toBeUndefined();
  });
});

describe('parseEditorConfig', () => {
  it('reads the settings JSON and ignores anything else', () => {
    expect(parseEditorConfig('{"skin":"silverstripe"}')).toEqual({ skin: 'silverstripe' });
    expect(parseEditorConfig('not json')).toEqual({});
    expect(parseEditorConfig('[1]')).toEqual({});
    expect(parseEditorConfig(undefined)).toEqual({});
  });
});
