/**
 * This pilet's own Pilet API types: the block actions hook point it declares and the field props it
 * receives. Everything else comes from the shell's emulator
 */
import type { FieldComponentProps, HookHandler, PiletApi } from '@silverstripe/admin-shell';
import type { Block } from './api';
import type { BlockAction } from './BlockRow';

export type { FormSchemaFormHandle, FormSchemaSubmitResult, RecordsChangedEvent } from '@silverstripe/admin-shell';

export interface BlockActionsHookContext {
  block: Block;
  area: { id: number; pageId: number };
}

declare module '@silverstripe/admin-shell' {
  interface HookPoints {
    updateBlockActions: { value: ReadonlyArray<BlockAction>; context: BlockActionsHookContext };
  }
}

export type BeforeFormSubmitHandler = HookHandler<'onBeforeFormSubmit'>;

export type ElementalPiletApi = PiletApi;

export type AreaFieldProps = FieldComponentProps<unknown> & { formId?: string };
