/**
 * The Share button and the edit, split and preview mode menu from the design's bottom bar (Figma
 * 2:6871, 2:6892, 2:6921), drawn at the end of the form's action bar. Share has no flow behind it yet,
 * so it is drawn disabled. The bar sits at the foot of the viewport, so the menu opens upwards
 */
import type * as React from 'react';
import { Button, EditIcon, Menu, PreviewIcon, ShareIcon, SplitViewIcon } from '@silverstripe/admin-patterns';
import { previewModes, setPreviewMode } from './mode';
import type { PreviewMode } from './mode';
import './preview.css';

const modeIcons: Record<PreviewMode, React.ReactNode> = {
  edit: <EditIcon />,
  split: <SplitViewIcon />,
  preview: <PreviewIcon />,
};

export const previewModeMenuId = 'shell-preview-mode';

// Entering or leaving preview mode moves the bar to or from the preview pane, remounting the menu
function choose(mode: PreviewMode): void {
  setPreviewMode(mode);
  requestAnimationFrame(() => document.getElementById(previewModeMenuId)?.focus());
}

export const PreviewModeMenu = ({ mode }: { mode: PreviewMode }) => {
  const current = previewModes.find((option) => option.mode === mode) ?? previewModes[0];
  return (
    <div className="shell-preview-tools">
      <Button variant="tertiary" icon={<ShareIcon />} disabled>
        Share
      </Button>
      <Menu
        id={previewModeMenuId}
        label={`View: ${current.label}`}
        title={current.label}
        icon={modeIcons[current.mode]}
        variant="tertiary"
        placement="top"
      >
        {previewModes.map((option) => (
          <Button
            key={option.mode}
            variant="tertiary"
            tone={option.mode === mode ? 'accent' : undefined}
            icon={modeIcons[option.mode]}
            aria-current={option.mode === mode || undefined}
            onClick={() => choose(option.mode)}
          >
            {option.label}
          </Button>
        ))}
      </Menu>
    </div>
  );
};
