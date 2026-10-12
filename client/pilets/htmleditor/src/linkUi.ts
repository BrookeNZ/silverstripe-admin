/**
 * The editor's link controls, in place of the legacy `sslink` plugin: the `sslink` toolbar button and
 * context menu item (the names the server's toolbar config already uses) open the shell's link dialog,
 * `unlink` removes the link at the cursor (TinyMCE's own `unlink` button belongs to its `link` plugin,
 * which the server does not load), and a context toolbar on a link offers "Edit link" and "Remove link".
 */
import type { Editor } from 'tinymce';
import type { LinkAttributes } from './links';

export function currentLink(editor: Editor): HTMLAnchorElement | null {
  return editor.dom.getParent<HTMLAnchorElement>(editor.selection.getNode(), 'a[href]');
}

export function linkAttributes(link: HTMLAnchorElement): LinkAttributes {
  return {
    href: link.getAttribute('href') ?? '',
    title: link.getAttribute('title') ?? undefined,
    target: link.getAttribute('target') ?? undefined,
  };
}

export function removeLink(editor: Editor): void {
  const link = currentLink(editor);
  if (link) {
    editor.selection.select(link);
  }
  editor.execCommand('unlink');
  // Adjacent text nodes left by the removed anchor confuse TinyMCE's collapsed-selection checks
  editor.selection.getNode()?.normalize();
}

/**
 * Writes the link at the selection the dialog opened on. With `text`, the selection was empty and the
 * link is inserted with that text; with no `href`, the link is removed
 */
export function applyLink(editor: Editor, { href, title, target }: LinkAttributes, text = ''): void {
  if (!href) {
    removeLink(editor);
    return;
  }
  if (text && !currentLink(editor)) {
    const attributes = { href, title: title ?? null, target: target ?? null };
    editor.selection.setNode(editor.dom.create('a', attributes, editor.dom.encode(text)));
  } else {
    editor.execCommand('mceInsertLink', false, { href, title: title ?? null, target: target ?? null });
  }
  editor.undoManager.add();
  editor.selection.collapse(false);
}

export function registerLinkUi(editor: Editor, openLinkDialog: () => void): void {
  const remove = () => removeLink(editor);
  const whileInLink = (setEnabled: (enabled: boolean) => void) => {
    const update = () => setEnabled(currentLink(editor) !== null);
    editor.on('NodeChange', update);
    update();
    return () => editor.off('NodeChange', update);
  };

  editor.ui.registry.addButton('sslink', {
    icon: 'link',
    tooltip: 'Insert link',
    onAction: openLinkDialog,
  });
  editor.ui.registry.addMenuItem('sslink', {
    icon: 'link',
    text: 'Insert link',
    shortcut: 'Meta+K',
    onAction: openLinkDialog,
  });
  editor.ui.registry.addButton('unlink', {
    icon: 'unlink',
    tooltip: 'Remove link',
    onAction: remove,
    onSetup: (button) => whileInLink((enabled) => button.setEnabled(enabled)),
  });
  editor.ui.registry.addButton('sslink-edit', {
    text: 'Edit link',
    onAction: openLinkDialog,
  });
  editor.ui.registry.addButton('sslink-remove', {
    text: 'Remove link',
    onAction: remove,
  });
  editor.ui.registry.addContextToolbar('sslink', {
    predicate: (node) => editor.dom.is(node, 'a[href]'),
    position: 'node',
    scope: 'node',
    items: 'sslink-edit sslink-remove',
  });
  editor.addShortcut('Meta+K', 'Insert link', openLinkDialog);
}
