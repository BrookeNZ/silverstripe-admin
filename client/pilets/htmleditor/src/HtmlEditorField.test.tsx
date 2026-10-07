// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawEditorOptions, TinyMCE } from 'tinymce';
import { createHtmlEditorField } from './HtmlEditorField';
import type { HtmlEditorFieldProps, HtmlEditorPiletApi, SchemaFormDialogProps, UpdateFormValuesHandler } from './shell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Stands in for TinyMCE's parse and serialise round trip
const normalise = (html: string) => (html === '' || html.startsWith('<p>') ? html : `<p>${html}</p>`);

class FakeEditor {
  handlers = new Map<string, Array<() => void>>();
  readOnly = false;
  mode = { set: vi.fn(), isReadOnly: () => this.readOnly };
  buttons = new Map<string, { onAction(): void }>();
  menuItems = new Map<string, { onAction(): void }>();
  ui = {
    registry: {
      addButton: (name: string, spec: { onAction(): void }) => this.buttons.set(name, spec),
      addMenuItem: (name: string, spec: { onAction(): void }) => this.menuItems.set(name, spec),
      addContextToolbar: vi.fn(),
    },
  };
  addShortcut = vi.fn();
  commands = new Map<string, () => void>();
  addCommand = (name: string, command: () => void) => this.commands.set(name, command);
  nodeChanged = vi.fn();
  focus = vi.fn();
  execCommand = vi.fn();
  /** The anchor the cursor is in, if any */
  link: HTMLAnchorElement | null = null;
  collapsed = true;
  selection = {
    getNode: () => this.link ?? document.createElement('p'),
    select: vi.fn(),
    getBookmark: vi.fn(() => 'bookmark'),
    moveToBookmark: vi.fn(),
    isCollapsed: () => this.collapsed,
    setNode: vi.fn(),
    collapse: vi.fn(),
    setCursorLocation: vi.fn(),
  };
  body = document.createElement('div');
  getBody() {
    return this.body;
  }
  dom = {
    getParent: (node: Node, selector: string) => (node instanceof Element ? node.closest(selector) : null),
    create: (name: string, attributes: Record<string, string | null>, html: string) => {
      const element = document.createElement(name);
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== null) {
          element.setAttribute(key, value);
        }
      }
      element.innerHTML = html;
      return element;
    },
    encode: (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  };
  undoManager = { clear: vi.fn(), add: vi.fn(), transact: vi.fn((change: () => void) => change()) };
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
let hooks: Map<string, UpdateFormValuesHandler>;
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
  hooks = new Map();
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
    registerHook: (name: string, handler: UpdateFormValuesHandler) => {
      hooks.set(name, handler);
      return () => {
        disposed.push(name);
        hooks.delete(name);
      };
    },
  } as unknown as HtmlEditorPiletApi;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('HtmlEditorField', () => {
  it('starts TinyMCE with the server settings minus the legacy insert plugins', async () => {
    const { editor } = await render();
    expect(load).toHaveBeenCalledWith(serverConfig.baseURL);
    const options = tinymce.init.mock.calls[0][0] as RawEditorOptions;
    expect(options.base_url).toBe(serverConfig.baseURL);
    expect(options.external_plugins).toEqual({ lists: serverConfig.external_plugins.lists, myplugin: serverConfig.external_plugins.myplugin });
    expect(options.toolbar).toEqual(['bold italic | bullist', 'blocks | table sslink anchor unlink | code']);
    expect(options.contextmenu).toBe('searchreplace | sslink anchor inserttable');
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

  it('marks the form dirty on the first edit, then writes edits after typing pauses and reports the stored value again on revert', async () => {
    const { editor } = await render('Hello');
    editor.type('<p>Hello <strong>w</strong></p>');
    expect(changes).toEqual(['<p>Hello <strong>w</strong></p>']);
    editor.type('<p>Hello <strong>world</strong></p>');
    await settle(5);
    expect(changes).toHaveLength(1);
    await settle(40);
    expect(changes).toEqual(['<p>Hello <strong>w</strong></p>', '<p>Hello <strong>world</strong></p>']);
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
    const flush = hooks.get('updateFormValues')!;
    expect(flush({ Content: '<p>Blurred</p>' }, { formId: 'Form_Other', action: 'action_save' })).toEqual({ Content: '<p>Blurred</p>' });
    expect(flush({ Content: '<p>Blurred</p>' }, { formId: 'Form_EditForm', action: 'action_save' })).toEqual({ Content: '<p>Posted</p>' });
    // Already handed to the form through the hook, so the debounced report has nothing new to say
    await settle();
    expect(changes).toEqual(['<p>Blurred</p>']);
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

  it('points the field id at the editor, so a server error on the field focuses it', async () => {
    const { editor } = await render();
    document.getElementById('Form_EditForm_Content')!.focus();
    expect(editor.focus).toHaveBeenCalled();
  });

  it('writes typing still waiting for the pause into the form on unmount', async () => {
    const { editor } = await render('Hello');
    editor.type('<p>Hello again</p>');
    editor.type('<p>Hello again and again</p>');
    act(() => root.unmount());
    expect(changes).toEqual(['<p>Hello again</p>', '<p>Hello again and again</p>']);
  });

  it('removes the editor and its form values handler on unmount', async () => {
    const { editor } = await render();
    act(() => root.unmount());
    expect(editor.remove).toHaveBeenCalled();
    expect(disposed).toEqual(['updateFormValues']);
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
    act(() => {
      textarea.dispatchEvent(new Event('blur'));
    });
    expect(blurs).toBe(1);
    act(() => setOuterValue('<p>Saved</p>'));
    expect(textarea.value).toBe('<p>Saved</p>');
  });

  it('marks the fallback textarea invalid with the error', async () => {
    load.mockRejectedValue(new Error('offline'));
    await render('Hello', makeField(), '"Content" is required');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(textarea.getAttribute('aria-describedby')).toBe('Form_EditForm_Content_description Form_EditForm_Content_message');
  });
});

const linkSection = {
  name: 'SilverStripe\\Admin\\LeftAndMain',
  form: {
    editorInternalLink: { schemaUrl: 'admin/modals/linkModalFormSchema/editorInternalLink/:pageid' },
    EditorExternalLink: { schemaUrl: 'admin/modals/linkModalFormSchema/EditorExternalLink/:pageid' },
    EditorEmailLink: { schemaUrl: 'admin/modals/linkModalFormSchema/EditorEmailLink/:pageid' },
  },
};

let submitState: Array<{ name: string; value: unknown }>;

const FakeFormDialog = ({ open, header, intro, schemaUrl, onClose, onSubmitted }: SchemaFormDialogProps) =>
  open ? (
    <div role="dialog" data-schema-url={schemaUrl}>
      <h2>{header}</h2>
      {intro}
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button type="button" onClick={() => onSubmitted?.({ id: schemaUrl, state: { fields: submitState } } as never, {} as never)}>
        Insert link
      </button>
    </div>
  ) : null;

describe('HtmlEditorField links', () => {
  beforeEach(() => {
    submitState = [];
    Object.assign(api, {
      getSilverstripeComponent: (name: string) => (name === 'SchemaFormDialog' ? FakeFormDialog : () => null),
      getConfig: () => ({ sections: [linkSection] }),
      getData: () => 7,
    });
  });

  const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');
  const press = (name: string) =>
    act(() => {
      [...dialog()!.querySelectorAll('button')].find((button) => button.textContent === name)!.click();
    });

  it('inserts a page link with its text where the selection was empty', async () => {
    const { editor } = await render('Hello');
    act(() => editor.buttons.get('sslink')!.onAction());
    expect(dialog()!.dataset.schemaUrl).toBe('admin/modals/linkModalFormSchema/editorInternalLink/7?requireLinkText=1');
    submitState = [
      { name: 'PageID', value: 4 },
      { name: 'Text', value: 'About <us>' },
      { name: 'TargetBlank', value: true },
    ];
    editor.content = '<p>Hello <a href="[sitetree_link,id=4]">About us</a></p>';
    press('Insert link');
    expect(dialog()).toBeNull();
    expect(editor.selection.moveToBookmark).toHaveBeenCalledWith('bookmark');
    const inserted = editor.selection.setNode.mock.calls[0][0] as HTMLAnchorElement;
    expect(inserted.outerHTML).toBe('<a href="[sitetree_link,id=4]" target="_blank">About &lt;us&gt;</a>');
    expect(editor.undoManager.add).toHaveBeenCalled();
    expect(changes).toEqual(['<p>Hello <a href="[sitetree_link,id=4]">About us</a></p>']);
  });

  it('switches kind in the dialog and links the selected text', async () => {
    const { editor } = await render('Hello');
    editor.collapsed = false;
    act(() => editor.buttons.get('sslink')!.onAction());
    act(() => {
      dialog()!.querySelector<HTMLInputElement>('input[value="EditorExternalLink"]')!.click();
    });
    expect(dialog()!.dataset.schemaUrl).toBe('admin/modals/linkModalFormSchema/EditorExternalLink/7');
    submitState = [{ name: 'Link', value: 'example.com' }, { name: 'Description', value: 'Example' }, { name: 'Anchor', value: 'top' }];
    press('Insert link');
    expect(editor.execCommand).toHaveBeenCalledWith('mceInsertLink', false, {
      href: `${window.location.protocol}//example.com#top`,
      title: 'Example',
      target: null,
    });
  });

  it('opens an existing link on its own kind with its values', async () => {
    const { editor } = await render('Hello');
    const link = document.createElement('a');
    link.setAttribute('href', 'mailto:someone@example.com?subject=Hi%20there');
    link.setAttribute('title', 'Write');
    editor.link = link;
    act(() => editor.buttons.get('sslink-edit')!.onAction());
    expect(editor.selection.select).toHaveBeenCalledWith(link);
    expect(dialog()!.dataset.schemaUrl).toBe(
      'admin/modals/linkModalFormSchema/EditorEmailLink/7?Link=someone%40example.com&Subject=Hi+there&Description=Write&editing=1',
    );
    press('Cancel');
    expect(dialog()).toBeNull();
    expect(editor.execCommand).not.toHaveBeenCalled();
  });

  it('removes the link at the cursor', async () => {
    const { editor } = await render('Hello');
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.setAttribute('href', '#top');
    paragraph.append(link);
    editor.link = link;
    act(() => editor.buttons.get('unlink')!.onAction());
    expect(editor.selection.select).toHaveBeenCalledWith(link);
    expect(editor.execCommand).toHaveBeenCalledWith('unlink');
  });

  it('opens nothing while read-only', async () => {
    const { editor } = await render('Hello');
    editor.readOnly = true;
    act(() => editor.buttons.get('sslink')!.onAction());
    expect(dialog()).toBeNull();
  });
});

describe('HtmlEditorField source code', () => {
  const dialog = () => container.querySelector<HTMLDialogElement>('dialog[open]');
  const press = (name: string) =>
    act(() => {
      [...dialog()!.querySelectorAll('button')].find((button) => button.textContent === name)!.click();
    });
  const edit = (html: string) =>
    act(() => {
      const textarea = dialog()!.querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, html);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('opens on the current content and writes the edited HTML back on Save', async () => {
    const { editor } = await render('Hello');
    editor.fire('PreInit');
    act(() => editor.commands.get('mceCodeEditor')!());
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Source code');
    expect(dialog()!.querySelector('label')!.textContent).toBe('Source code');
    expect(dialog()!.querySelector('textarea')!.value).toBe('<p>Hello</p>');
    edit('<p>Hello <strong>world</strong></p>');
    press('Save');
    expect(dialog()).toBeNull();
    expect(editor.undoManager.transact).toHaveBeenCalled();
    expect(editor.getContent()).toBe('<p>Hello <strong>world</strong></p>');
    expect(changes).toEqual(['<p>Hello <strong>world</strong></p>']);
    expect(dirty()).toBe('true');
  });

  it('discards the edit on Cancel and opens on the content again', async () => {
    const { editor } = await render('Hello');
    act(() => editor.buttons.get('code')!.onAction());
    edit('<p>Gone</p>');
    press('Cancel');
    expect(dialog()).toBeNull();
    expect(editor.undoManager.transact).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
    act(() => editor.buttons.get('code')!.onAction());
    expect(dialog()!.querySelector('textarea')!.value).toBe('<p>Hello</p>');
  });
});
