/**
 * The source code button and menu item, opening the shell's source code dialog (`SourceCodeDialog`) in
 * place of the `code` plugin's window. They keep the plugin's `code` name, which the server's toolbar
 * config already uses, so the button works whether or not the plugin loads
 */
import type { Editor } from 'tinymce';

export function registerSourceCodeUi(editor: Editor, openSourceCode: () => void): void {
  editor.ui.registry.addButton('code', {
    icon: 'sourcecode',
    tooltip: 'Source code',
    onAction: openSourceCode,
  });
  editor.ui.registry.addMenuItem('code', {
    icon: 'sourcecode',
    text: 'Source code',
    onAction: openSourceCode,
  });
  // The plugin registers its button and command after setup runs; its button calls this command
  editor.on('PreInit', () => editor.addCommand('mceCodeEditor', openSourceCode));
}

/** Writes the dialog's HTML back as one undo step, which marks the editor dirty and fires its change event */
export function applySourceCode(editor: Editor, html: string): void {
  editor.focus();
  editor.undoManager.transact(() => {
    editor.setContent(html);
  });
  editor.selection.setCursorLocation();
  editor.nodeChanged();
}
