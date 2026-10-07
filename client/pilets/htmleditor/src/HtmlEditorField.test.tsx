// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawEditorOptions, TinyMCE } from 'tinymce';
import { createHtmlEditorField } from './HtmlEditorField';
import type { BeforeSubmitHandler, HtmlEditorFieldProps, HtmlEditorPiletApi } from './shell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stands in for TinyMCE's parse and serialise round trip
const normalise = (html: string) => (html === '' || html.startsWith('<p>') ? html : `<p>${html}</p>`);

class FakeEditor {
  handlers = new Map<string, Array<() => void>>();
  mode = { set: vi.fn() };
  undoManager = { clear: vi.fn() };
  iframeElement = document.createElement('iframe');
  contentArea = document.createElement('div');
  setDirty = vi.fn();
  remove = vi.fn();
  content: string;

  constructor(public options: RawEditorOptions) {
    this.content = normalise((options.target as HTMLTextAreaElement).value);
  }

  on(names: string, handler: () => void) {
    for (const name of names.split(' ')) {
      this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
    }
  }

  fire(name: string) {
    for (const handler of this.handlers.get(name) ?? []) {
      handler();
    }
  }

  getContentAreaContainer() {
    return this.contentArea;
  }

  getContent() {
    return this.content;
  }

  setContent(html: string) {
    this.content = normalise(html);
  }

  type(html: string) {
    this.content = html;
    this.fire('input');
  }
}

const serverConfig = {
  baseURL: '/_resources/vendor/silverstripe/htmleditor-tinymce/client/dist/tinymce',
  editorIdentifier: 'cms',
  skin: 'silverstripe',
  content_css: ['/editor.css', '/_resources/themes/app/dist/editor.css'],
  convert_urls: false,
  relative_urls: true,
  height: 'auto',
  row_height: '400px',
  external_plugins: {
    lists: '/tinymce/plugins/lists/plugin.min.js',
    sslink: '/js/TinyMCE_sslink.js',
    ssmedia: '/js/TinyMCE_ssmedia.js',
    myplugin: '/app/client/myplugin.js',
  },
  toolbar: ['bold italic | bullist', 'blocks | table ssmedia ssembed sslink anchor unlink | code'],
  contextmenu: 'searchreplace | sslink anchor ssmedia ssembed inserttable',
};

function makeField(overrides: Partial<HtmlEditorFieldProps['field']> = {}): HtmlEditorFieldProps['field'] {
  return {
    key: 'Content',
    name: 'Content',
    id: 'Form_EditForm_Content',
    holderId: 'Form_EditForm_Content_Holder',
    title: 'Content',
    description: 'Shown on the page',
    readOnly: false,
    disabled: false,
    source: [],
    children: [],
    value: '',
    message: null,
    data: {},
    attributes: { 'data-config': JSON.stringify(serverConfig) },
    schemaType: 'HTML',
    component: 'TinyMceHtmlEditorField',
    ...overrides,
  } as unknown as HtmlEditorFieldProps['field'];
}

let container: HTMLDivElement;
let root: Root;
let editors: Array<FakeEditor>;
let tinymce: { init: ReturnType<typeof vi.fn> };
let load: ReturnType<typeof vi.fn>;
let beforeSubmit: Map<string, BeforeSubmitHandler>;
let disposed: Array<string>;
let api: HtmlEditorPiletApi;
let changes: Array<string>;
let blurs: number;
let setOuterValue: (value: string) => void;

const Harness = ({ initial, Field, field, error }: { initial: string; Field: React.ComponentType<HtmlEditorFieldProps>; field: HtmlEditorFieldProps['field']; error?: string }) => {
  const [value, setValue] = React.useState(initial);
  setOuterValue = setValue;
  return (
    <>
      <Field
        field={field}
        value={value}
        onChange={(next) => {
          changes.push(String(next));
          setValue(String(next));
        }}
        onBlur={() => {
          blurs += 1;
        }}
        error={error}
        submitting={false}
        renderFields={() => null}
        autofill={() => undefined}
        formId="Form_EditForm"
      />
      <output data-dirty={String(value !== initial)} />
    </>
  );
};

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

async function render(initial = 'Hello', field = makeField(), error?: string) {
  const Field = createHtmlEditorField({ api, load, syncDelay: 20 });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness initial={initial} Field={Field} field={field} error={error} />));
  await settle();
  return { Field, editor: editors[0] };
}

const dirty = () => container.querySelector('output')!.dataset.dirty;

beforeEach(() => {
  editors = [];
  changes = [];
  blurs = 0;
  disposed = [];
  beforeSubmit = new Map();
  tinymce = {
    init: vi.fn(async (options: RawEditorOptions) => {
      const editor = new FakeEditor(options);
      options.setup?.(editor as never);
      editor.fire('init');
      editors.push(editor);
      return [editor];
    }),
  };
  load = vi.fn(async () => tinymce as unknown as TinyMCE);
  api = {
    registerBeforeSubmit: (formId: string, handler: BeforeSubmitHandler) => {
      beforeSubmit.set(formId, handler);
      return () => {
        disposed.push(formId);
        beforeSubmit.delete(formId);
      };
    },
  } as unknown as HtmlEditorPiletApi;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('HtmlEditorField', () => {
  it('starts TinyMCE with the server settings minus the insert plugins', async () => {
    const { editor } = await render();
    expect(load).toHaveBeenCalledWith(serverConfig.baseURL);
    const options = tinymce.init.mock.calls[0][0] as RawEditorOptions;
    expect(options.base_url).toBe(serverConfig.baseURL);
    expect(options.external_plugins).toEqual({ lists: serverConfig.external_plugins.lists, myplugin: serverConfig.external_plugins.myplugin });
    expect(options.toolbar).toEqual(['bold italic | bullist', 'blocks | table anchor unlink | code']);
    expect(options.contextmenu).toBe('searchreplace | anchor inserttable');
    expect(options.content_css).toEqual(serverConfig.content_css);
    expect(options.convert_urls).toBe(false);
    expect(options.relative_urls).toBe(true);
    expect(options.height).toBe('auto');
    expect(editor.contentArea.style.minHeight).toBe('400px');
    expect(options.skin).toBe('silverstripe');
    expect(options.iframe_aria_text).toBe('Content');
    expect(options.readonly).toBe(false);
    expect((options.target as HTMLTextAreaElement).id).toBe('Form_EditForm_Content');
    expect(options).not.toHaveProperty('editorIdentifier');
    expect(editor.iframeElement.getAttribute('aria-describedby')).toBe('Form_EditForm_Content_description');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('keeps the form clean when TinyMCE only normalises the stored value', async () => {
    const { editor } = await render('Hello');
    expect(editor.getContent()).toBe('<p>Hello</p>');
    editor.fire('change');
    await settle(40);
    expect(changes).toEqual([]);
    expect(dirty()).toBe('false');
  });

  it('writes edits into the form after typing pauses and reports the stored value again on revert', async () => {
    const { editor } = await render('Hello');
    editor.type('<p>Hello <strong>world</strong></p>');
    await settle(5);
    expect(changes).toEqual([]);
    await settle(40);
    expect(changes).toEqual(['<p>Hello <strong>world</strong></p>']);
    expect(dirty()).toBe('true');
    editor.type('<p>Hello</p>');
    await settle(40);
    expect(changes[changes.length - 1]).toBe('Hello');
    expect(dirty()).toBe('false');
  });

  it('flushes on blur and before the form posts', async () => {
    const { editor } = await render('Hello');
    act(() => editor.fire('focus'));
    expect(container.querySelector('.htmleditor-field--focused')).not.toBeNull();
    editor.type('<p>Blurred</p>');
    act(() => editor.fire('blur'));
    expect(container.querySelector('.htmleditor-field--focused')).toBeNull();
    expect(changes).toEqual(['<p>Blurred</p>']);
    expect(blurs).toBe(1);
    editor.type('<p>Posted</p>');
    await act(async () => {
      await beforeSubmit.get('Form_EditForm')!({ action: 'action_save' });
    });
    expect(changes).toEqual(['<p>Blurred</p>', '<p>Posted</p>']);
  });

  it('takes a value from outside as the new content and baseline', async () => {
    const { editor } = await render('Hello');
    act(() => setOuterValue('<p>Saved by the server</p>'));
    await settle();
    expect(editor.getContent()).toBe('<p>Saved by the server</p>');
    expect(editor.undoManager.clear).toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it('starts read-only for a read-only or disabled field and follows changes', async () => {
    const { Field } = await render('Hello', makeField({ disabled: true }));
    expect((tinymce.init.mock.calls[0][0] as RawEditorOptions).readonly).toBe(true);
    expect(editors[0].mode.set).toHaveBeenLastCalledWith('readonly');
    act(() =>
      root.render(<Harness initial="Hello" Field={Field} field={makeField({ disabled: false })} />),
    );
    expect(editors[0].mode.set).toHaveBeenLastCalledWith('design');
  });

  it('describes the editing area with the error message', async () => {
    const { editor } = await render('', makeField(), '"Content" is required');
    expect(editor.iframeElement.getAttribute('aria-describedby')).toBe('Form_EditForm_Content_description Form_EditForm_Content_message');
    expect(editor.iframeElement.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('#Form_EditForm_Content_message')!.textContent).toBe('"Content" is required');
  });

  it('removes the editor and its before-submit handler on unmount', async () => {
    const { editor } = await render();
    act(() => root.unmount());
    expect(editor.remove).toHaveBeenCalled();
    expect(disposed).toEqual(['Form_EditForm']);
    expect(document.getElementById('Form_EditForm_Content')).toBeNull();
  });

  it('removes an editor that finishes starting after unmount', async () => {
    let release: () => void = () => undefined;
    load.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve(tinymce);
    }));
    await render();
    act(() => root.unmount());
    release();
    await settle();
    expect(tinymce.init).not.toHaveBeenCalled();
  });

  it('falls back to an editable textarea when TinyMCE cannot load', async () => {
    load.mockRejectedValue(new Error('offline'));
    await render('Hello');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.hidden).toBe(false);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('could not be loaded');
    textarea.value = '<p>Typed</p>';
    act(() => {
      textarea.dispatchEvent(new Event('input'));
    });
    expect(changes).toEqual(['<p>Typed</p>']);
  });
});
