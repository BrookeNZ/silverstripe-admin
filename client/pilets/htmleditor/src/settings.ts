/**
 * Turns the TinyMCE settings the server sends (`data-config` on the field, built by
 * `SilverStripe\TinyMCE\TinyMCEConfig::getConfig()`) into the options this pilet passes to
 * `tinymce.init()`.
 *
 * The Silverstripe insert plugins (links, media, embeds) are dropped from `external_plugins`, the
 * toolbar and the context menu: they bind legacy admin globals (Injector, jQuery, the Redux modals) as
 * soon as they load, which the shell does not provide. They return as shell-aware rewrites in later
 * slices. Every other plugin, including a project's own, still loads from the URL the server gives.
 */
import type { RawEditorOptions } from 'tinymce';

export const deferredPlugins: ReadonlyArray<string> = [
  'sslink',
  'sslinkexternal',
  'sslinkemail',
  'sslinkphone',
  'sslinkinternal',
  'sslinkanchor',
  'sslinkfile',
  'ssmedia',
  'ssembed',
];

/** The settings JSON as sent, with the keys only the Silverstripe side reads */
export interface ServerEditorConfig extends Record<string, unknown> {
  baseURL?: string;
  editorIdentifier?: string;
  external_plugins?: Record<string, string>;
  toolbar?: string | Array<string>;
  contextmenu?: string;
  content_css?: string | Array<string>;
  row_height?: string;
  height?: string | number;
}

export function parseEditorConfig(raw: unknown): ServerEditorConfig {
  if (typeof raw !== 'string' || raw === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function withoutItems(row: string, removed: ReadonlySet<string>): string {
  return row
    .split('|')
    .map((group) => group.split(/\s+/).filter((item) => item !== '' && !removed.has(item)).join(' '))
    .filter((group) => group !== '')
    .join(' | ');
}

export function withoutDeferredItems<T extends string | Array<string> | undefined>(rows: T, removed: ReadonlyArray<string> = deferredPlugins): T {
  const names = new Set(removed);
  if (typeof rows === 'string') {
    return withoutItems(rows, names) as T;
  }
  if (Array.isArray(rows)) {
    return rows.map((row) => withoutItems(row, names)).filter((row) => row !== '') as T;
  }
  return rows;
}

export interface EditorContext {
  target: HTMLElement;
  /** The field's label, read out as the editing area's name */
  label: string;
  readOnly: boolean;
  setup: NonNullable<RawEditorOptions['setup']>;
}

export function editorOptions(config: ServerEditorConfig, { target, label, readOnly, setup }: EditorContext): RawEditorOptions {
  const {
    baseURL,
    editorIdentifier,
    external_plugins: externalPlugins = {},
    toolbar,
    contextmenu,
    row_height: rowHeight,
    ...options
  } = config;
  const plugins = Object.fromEntries(Object.entries(externalPlugins).filter(([name]) => !deferredPlugins.includes(name)));
  return {
    ...(options as RawEditorOptions),
    base_url: baseURL,
    suffix: '.min',
    external_plugins: plugins,
    toolbar: withoutDeferredItems(toolbar),
    contextmenu: withoutDeferredItems(contextmenu),
    skin: typeof options.skin === 'string' ? options.skin : 'silverstripe',
    iframe_aria_text: label,
    readonly: readOnly,
    target,
    setup: (editor) => {
      // As the legacy wrapper did: the field's rows size the editing area, and the frame grows around it
      if (rowHeight) {
        editor.on('init', () => {
          editor.getContentAreaContainer().style.minHeight = rowHeight;
        });
      }
      setup(editor);
    },
  };
}
