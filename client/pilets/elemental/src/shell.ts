/**
 * This pilet's own Pilet API types: the block actions hook point it declares and the field props it
 * receives. Everything else comes from the shell's emulator
 */
import type { FieldComponentProps, HookHandler } from '@silverstripe/admin-shell';
import type { Block } from './api';
import type { BlockAction } from './BlockRow';

export type { FormSchemaFormHandle, FormSchemaFormProps, FormSchemaSubmitResult, RecordsChangedEvent } from '@silverstripe/admin-shell';

export interface BlockActionsHookContext {
  block: Block;
  area: { id: number; pageId: number };
}

declare module '@silverstripe/admin-shell' {
  interface HookPoints {
    updateBlockActions: { value: ReadonlyArray<BlockAction>; context: BlockActionsHookContext };
  }

  // Keep the area field's key in sync with `areaField` in index.tsx
  interface SilverstripeComponents {
    TextCheckboxGroupField: FieldComponentProps;
    'DNADesign\\Elemental\\Forms\\ElementalAreaField': AreaFieldProps;
  }
}

export type BeforeFormSubmitHandler = HookHandler<'onBeforeFormSubmit'>;

export type AreaFieldProps = FieldComponentProps<unknown> & { formId?: string };
