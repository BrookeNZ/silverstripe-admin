/** This pilet's own Pilet API types; everything else comes from the shell's emulator */
import type { FieldComponentProps, HookHandler } from '@silverstripe/admin-shell';
import type { InsertLinkModalOptions } from './LinkDialog';

export type { ModalComponentProps, SchemaFormDialogProps } from '@silverstripe/admin-shell';

export type UpdateFormValuesHandler = HookHandler<'updateFormValues'>;

export type HtmlEditorFieldProps = FieldComponentProps<string | null> & { formId?: string };

// Keep the editor's key in sync with `editorComponent` in index.tsx
declare module '@silverstripe/admin-shell' {
  interface SilverstripeComponents {
    TinyMceHtmlEditorField: HtmlEditorFieldProps;
    AnchorSelectorField: FieldComponentProps<string | null>;
  }

  // Keep the key in sync with `insertLinkModal` in LinkDialog.tsx
  interface PiralCustomModalsMap {
    InsertLinkModal: InsertLinkModalOptions;
  }
}
