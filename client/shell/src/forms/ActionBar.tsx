/**
 * The form's action bar. When the section header carries a preview URL and the viewport has room for
 * it, the bar ends with Share and the preview mode menu. In split and preview modes the host's preview
 * controls (the pages section's draft and published toggle) come first; edit mode leaves them out, as
 * the design does. In preview mode the content is hidden, so the bar's right-hand group alone draws at
 * the foot of the preview pane, through a portal.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useSectionHeader } from '../header/state';
import { useMeasuredHeight } from '../measure';
import { usePreviewBarSlot } from '../preview/barSlot';
import { usePreviewMode } from '../preview/mode';
import { PreviewModeMenu } from '../preview/PreviewModeMenu';
import { renderFields } from './FormFieldSlot';
import type { FormField } from './types';

interface ActionBarProps {
  actions: Array<FormField>;
  previewControls?: React.ReactNode;
}

export const ActionBar = ({ actions, previewControls }: ActionBarProps) => {
  const barRef = useMeasuredHeight<HTMLDivElement>('--shell-form-actions-offset');
  const preview = useSectionHeader()?.header.preview;
  const { mode, available } = usePreviewMode();
  const offersPreview = Boolean(preview) && available;
  const previewBarSlot = usePreviewBarSlot();

  const endGroup = offersPreview && (
    <div className="shell-form__actions-end">
      {mode !== 'edit' && previewControls}
      <PreviewModeMenu mode={mode} />
    </div>
  );

  if (offersPreview && mode === 'preview') {
    return previewBarSlot && createPortal(<div className="shell-form__actions">{endGroup}</div>, previewBarSlot);
  }
  return (
    <div className="shell-form__actions" ref={barRef}>
      {renderFields(actions)}
      {endGroup}
    </div>
  );
};
