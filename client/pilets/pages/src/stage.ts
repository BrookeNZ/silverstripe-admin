/**
 * The draft and published toggle in the page form's action bar (Figma "Draft/publish toggle"). It
 * shows which stage of the page is being viewed, and offers Published only for a page that has a
 * published version. The chosen stage picks which preview link the section header carries (see
 * preview.ts), so switching it reloads the preview pane.
 */
import type { StatusFlag } from './api';

export type PageStage = 'draft' | 'live';

export interface StageOption {
  key: PageStage;
  label: string;
  disabled: boolean;
}

// Versioned::getStatusFlags() key for a page that exists only on draft
const draftOnlyFlag = 'addedtodraft';

export function stageOptions(statusFlags: ReadonlyArray<StatusFlag> | undefined): Array<StageOption> {
  const neverPublished = (statusFlags ?? []).some((flag) => flag.key === draftOnlyFlag);
  return [
    { key: 'draft', label: 'Draft', disabled: false },
    { key: 'live', label: 'Published', disabled: neverPublished },
  ];
}
