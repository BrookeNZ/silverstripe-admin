/**
 * The edit, split and preview mode menu and the Share button from the design's bottom bar (Figma
 * 2:6892, 2:6921), drawn in the section header's view area instead. Share has no flow behind it yet,
 * so it is drawn disabled
 */
import * as React from 'react';
import { Button, EditIcon, Menu, PreviewIcon, ShareIcon, SplitViewIcon, Stack } from '@silverstripe/admin-patterns';
import { previewModes, setPreviewMode } from './mode';
import type { PreviewMode } from './mode';

const modeIcons: Record<PreviewMode, React.ReactNode> = {
  edit: <EditIcon />,
  split: <SplitViewIcon />,
  preview: <PreviewIcon />,
};

export const previewModeMenuId = 'shell-preview-mode';

export const PreviewModeMenu = ({ mode }: { mode: PreviewMode }) => {
  const current = previewModes.find((option) => option.mode === mode) ?? previewModes[0];
  return (
    <Stack className="shell-preview-tools" direction="row" align="center" spacing="sm" wrap={false}>
      <Button variant="tertiary" icon={<ShareIcon />} disabled>
        Share
      </Button>
      <Menu id={previewModeMenuId} label={`View: ${current.label}`} title={current.label}>
        {previewModes.map((option) => (
          <Button
            key={option.mode}
            variant="tertiary"
            tone={option.mode === mode ? 'accent' : undefined}
            icon={modeIcons[option.mode]}
            aria-current={option.mode === mode || undefined}
            onClick={() => setPreviewMode(option.mode)}
          >
            {option.label}
          </Button>
        ))}
      </Menu>
    </Stack>
  );
};
