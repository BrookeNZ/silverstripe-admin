/**
 * The HTML editor field: TinyMCE on a textarea the component creates itself, so React never reconciles
 * the nodes TinyMCE inserts beside it.
 *
 * Value sync replaces the legacy change tracker's `prepValueForChangeTracker`. TinyMCE rewrites the
 * stored HTML as it loads (wrapping bare text in a paragraph, for instance), so the content it holds
 * right after init is the baseline: while the editor still holds that content the field reports the
 * stored value unchanged, and the form stays clean. Edits reach the form after typing pauses, on blur
 * and before the form posts. A value from outside (the state a save brings back) replaces the content
 * and becomes the new baseline. The first edit after a clean state reaches the form at once, so the form is
 * dirty (and leaving asks first) from the first keystroke.
 *
 * The field id stays on the hidden textarea TinyMCE replaces, where the shell's form looks for the control
 * to focus after a server error; its `focus()` is pointed at the editor.
 *
 * Links go through the shell's link dialog (`LinkDialog`), opened from the toolbar, the context menu, a
 * link's context toolbar or Ctrl/Cmd+K. The source code button opens the shell's `SourceCodeDialog`.
 */
import * as React from 'react';
import { describedBy, FieldHolder } from '@silverstripe/admin-patterns';
import type { Editor, TinyMCE } from 'tinymce';
import { LinkDialog } from './LinkDialog';
import type { LinkDialogRequest } from './LinkDialog';
import { availableKinds, kindForHref } from './links';
import type { LinkFormSection, LinkKind } from './links';
import { applyLink, currentLink, linkAttributes, registerLinkUi } from './linkUi';
import { loadTinyMce } from './loadTinyMce';
import { SourceCodeDialog } from './SourceCodeDialog';
import { applySourceCode, registerSourceCodeUi } from './sourceCodeUi';
import { editorOptions, parseEditorConfig } from './settings';
import type { HtmlEditorFieldProps, HtmlEditorPiletApi, SchemaFormDialogProps } from './shell';

export interface HtmlEditorFieldOptions {
  api: HtmlEditorPiletApi;
  load?(baseUrl: string): Promise<TinyMCE>;
  /** How long typing must pause before the content reaches the form, in milliseconds */
  syncDelay?: number;
}

type Status = 'loading' | 'ready' | 'failed';

interface SyncState {
  /** The value the editor's baseline content came from */
  stored: string;
  /** What TinyMCE made of `stored` */
  baseline: string;
  /** The last value given to the form */
  reported: string;
}

function textValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function rawConfig(field: HtmlEditorFieldProps['field']): unknown {
  const attributes = (field.attributes ?? {}) as Record<string, unknown>;
  const dataAttributes = ((field.data as Record<string, unknown> | undefined)?.attributes ?? {}) as Record<string, unknown>;
  return attributes['data-config'] ?? dataAttributes['data-config'];
}

const linkFormSection = 'SilverStripe\\Admin\\LeftAndMain';
const currentPageKey = 'silverstripe:pages:current-page-id';

/** The anchors in the content of the editor whose link dialog is open, for the dialog's anchor field */
export const editorAnchors: { current: ReadonlyArray<string> } = { current: [] };

function anchorsIn(editor: Editor): Array<string> {
  const elements = [...editor.getBody().querySelectorAll('[id], a[name]')].filter((element) => !element.hasAttribute('data-mce-type'));
  const names = elements.map((element) => element.id || element.getAttribute('name') || '');
  // TinyMCE's own ids (bookmarks, selection markers) start with mce
  return [...new Set(names.filter((name) => name !== '' && !name.startsWith('mce')))];
}

function linkKindsFromConfig(api: HtmlEditorPiletApi) {
  const sections = (api.getConfig?.().sections ?? []) as ReadonlyArray<{ name?: string } & LinkFormSection>;
  return availableKinds(sections.find((section) => section.name === linkFormSection));
}

function currentPageId(api: HtmlEditorPiletApi): number {
  const id = Number((api.getData as ((name: string) => unknown) | undefined)?.(currentPageKey));
  return Number.isFinite(id) ? id : 0;
}

export function createHtmlEditorField({ api, load = loadTinyMce, syncDelay = 300 }: HtmlEditorFieldOptions) {
  const FormDialog = api.getSilverstripeComponent?.('SchemaFormDialog') as React.ComponentType<SchemaFormDialogProps> | undefined;

  const HtmlEditorField = ({ field, value, onChange, onBlur, error, formId }: HtmlEditorFieldProps) => {
    const configText = textValue(rawConfig(field));
    const config = React.useMemo(() => parseEditorConfig(configText), [configText]);
    const host = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<Editor | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const sync = React.useRef<SyncState>({ stored: '', baseline: '', reported: '' });
    const latest = React.useRef({ onChange, onBlur, value });
    latest.current = { onChange, onBlur, value };
    const [status, setStatus] = React.useState<Status>('loading');
    const [focused, setFocused] = React.useState(false);
    const label = typeof field.title === 'string' || typeof field.title === 'number' ? String(field.title) : field.name;
    const readOnly = Boolean(field.readOnly || field.disabled);
    const labelId = `${field.id}_label`;
    const descriptionIds = describedBy(field, error);
    const linkKinds = React.useMemo(() => (FormDialog ? linkKindsFromConfig(api) : []), []);
    const [linkRequest, setLinkRequest] = React.useState<LinkDialogRequest | null>(null);
    const linkBookmark = React.useRef<unknown>(null);
    const [sourceCode, setSourceCode] = React.useState<string | null>(null);
    const [sourceCodeKey, setSourceCodeKey] = React.useState(0);

    const report = React.useCallback(() => {
      clearTimeout(timer.current);
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      const content = editor.getContent();
      const next = content === sync.current.baseline ? sync.current.stored : content;
      if (next !== sync.current.reported) {
        sync.current.reported = next;
        latest.current.onChange(next);
      }
    }, []);

    const openLinkDialog = React.useCallback(() => {
      const editor = editorRef.current;
      if (!editor || linkKinds.length === 0 || editor.mode.isReadOnly()) {
        return;
      }
      const link = currentLink(editor);
      if (link) {
        editor.selection.select(link);
      }
      const attributes = link ? linkAttributes(link) : null;
      const kind = kindForHref(attributes?.href ?? '', linkKinds.map((entry) => entry.kind)) ?? linkKinds[0].kind;
      editorAnchors.current = anchorsIn(editor);
      linkBookmark.current = editor.selection.getBookmark(2, true);
      setLinkRequest({
        kind: link ? kind.name : linkKinds[0].kind.name,
        values: attributes ? kind.values(attributes) : {},
        editing: link !== null,
        requireText: link === null && editor.selection.isCollapsed(),
        itemId: currentPageId(api),
      });
    }, [linkKinds]);
    const latestOpenLinkDialog = React.useRef(openLinkDialog);
    latestOpenLinkDialog.current = openLinkDialog;

    const insertLink = (kind: LinkKind, values: Record<string, unknown>) => {
      const editor = editorRef.current;
      const request = linkRequest;
      setLinkRequest(null);
      editorAnchors.current = [];
      if (!editor || !request) {
        return;
      }
      editor.focus();
      if (linkBookmark.current) {
        editor.selection.moveToBookmark(linkBookmark.current as never);
      }
      applyLink(editor, kind.attributes(values), request.requireText ? String(values.Text ?? '') : '');
      report();
    };

    // The control that opened the dialog (a context toolbar button) may be gone, so focus goes back to the editor
    const cancelLink = () => {
      editorAnchors.current = [];
      setLinkRequest(null);
      requestAnimationFrame(() => {
        const editor = editorRef.current;
        editor?.focus();
        if (editor && linkBookmark.current) {
          editor.selection.moveToBookmark(linkBookmark.current as never);
        }
      });
    };

    const openSourceCode = React.useCallback(() => {
      const editor = editorRef.current;
      if (!editor || editor.mode.isReadOnly()) {
        return;
      }
      setSourceCodeKey((key) => key + 1);
      setSourceCode(editor.getContent({ source_view: true }));
    }, []);

    const saveSourceCode = (html: string) => {
      const editor = editorRef.current;
      setSourceCode(null);
      if (editor) {
        applySourceCode(editor, html);
        report();
      }
    };

    React.useEffect(() => {
      const element = host.current;
      if (!element) {
        return undefined;
      }
      const textarea = document.createElement('textarea');
      textarea.id = field.id;
      textarea.name = field.name;
      textarea.value = textValue(latest.current.value);
      textarea.hidden = true;
      element.append(textarea);
      textareaRef.current = textarea;
      let cancelled = false;
      setStatus('loading');

      const setup = (editor: Editor) => {
        editor.on('init', () => {
          const stored = textValue(latest.current.value);
          sync.current = { stored, baseline: editor.getContent(), reported: stored };
        });
        editor.on('input change undo redo', () => {
          clearTimeout(timer.current);
          if (sync.current.reported === sync.current.stored) {
            report();
          } else {
            timer.current = setTimeout(report, syncDelay);
          }
        });
        editor.on('focus', () => setFocused(true));
        editor.on('blur', () => {
          setFocused(false);
          report();
          latest.current.onBlur();
        });
        registerLinkUi(editor, () => latestOpenLinkDialog.current());
        registerSourceCodeUi(editor, openSourceCode);
      };

      load(String(config.baseURL ?? ''))
        .then((tinymce) => (cancelled ? [] : tinymce.init(editorOptions(config, { target: textarea, label, readOnly, setup }))))
        .then((editors) => {
          const [editor] = editors;
          if (cancelled) {
            editor?.remove();
            return;
          }
          if (!editor) {
            throw new Error('The editor did not start');
          }
          editorRef.current = editor;
          textarea.focus = () => editor.focus();
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) {
            setStatus('failed');
          }
        });

      return () => {
        cancelled = true;
        report();
        editorRef.current?.remove();
        editorRef.current = null;
        textarea.remove();
        textareaRef.current = null;
      };
      // Read-only state changes on the running editor below; a new config starts a new editor
    }, [config, field.id, field.name, load, report, openSourceCode]);

    React.useEffect(() => {
      editorRef.current?.mode.set(readOnly ? 'readonly' : 'design');
    }, [readOnly, status]);

    React.useEffect(() => {
      const editor = editorRef.current;
      const text = textValue(value);
      if (status === 'failed' && textareaRef.current && textareaRef.current.value !== text) {
        textareaRef.current.value = text;
      }
      if (!editor || text === sync.current.reported) {
        return;
      }
      clearTimeout(timer.current);
      editor.setContent(text);
      editor.undoManager.clear();
      editor.setDirty(false);
      sync.current = { stored: text, baseline: editor.getContent(), reported: text };
    }, [value, status]);

    React.useEffect(() => {
      const frame = editorRef.current?.iframeElement;
      if (!frame) {
        return;
      }
      for (const [name, attribute] of [['aria-describedby', descriptionIds], ['aria-invalid', error ? 'true' : undefined]] as const) {
        if (attribute) {
          frame.setAttribute(name, attribute);
        } else {
          frame.removeAttribute(name);
        }
      }
    }, [descriptionIds, error, status]);

    // The editor cannot load: the plain textarea still edits the HTML
    React.useEffect(() => {
      const textarea = textareaRef.current;
      if (status !== 'failed' || !textarea) {
        return undefined;
      }
      textarea.hidden = false;
      textarea.className = 'admin-field__control';
      textarea.readOnly = readOnly;
      textarea.rows = 10;
      textarea.setAttribute('aria-labelledby', labelId);
      for (const [name, attribute] of [['aria-describedby', descriptionIds], ['aria-invalid', error ? 'true' : undefined]] as const) {
        if (attribute) {
          textarea.setAttribute(name, attribute);
        } else {
          textarea.removeAttribute(name);
        }
      }
      const input = () => latest.current.onChange(textarea.value);
      const blur = () => latest.current.onBlur();
      textarea.addEventListener('input', input);
      textarea.addEventListener('blur', blur);
      return () => {
        textarea.removeEventListener('input', input);
        textarea.removeEventListener('blur', blur);
      };
    }, [status, readOnly, labelId, descriptionIds, error]);

    React.useEffect(() => {
      if (!formId || !api.registerBeforeSubmit) {
        return undefined;
      }
      return api.registerBeforeSubmit(formId, () => {
        report();
      });
    }, [formId, report]);

    return (
      <>
        <FieldHolder field={field} error={error} labelId={labelId}>
          {status === 'loading' && (
            <p className="htmleditor-field__status" role="status">
              Loading the editor
            </p>
          )}
          {status === 'failed' && (
            <p className="htmleditor-field__status" role="alert">
              The editor could not be loaded. You can still edit the HTML below.
            </p>
          )}
          <div className={focused ? 'htmleditor-field htmleditor-field--focused' : 'htmleditor-field'} ref={host} aria-busy={status === 'loading'} />
        </FieldHolder>
        <SourceCodeDialog key={sourceCodeKey} content={sourceCode} onCancel={() => setSourceCode(null)} onSave={saveSourceCode} />
        {FormDialog && (
          <LinkDialog request={linkRequest} kinds={linkKinds} FormDialog={FormDialog} onClose={cancelLink} onSubmit={insertLink} />
        )}
      </>
    );
  };
  return HtmlEditorField;
}
