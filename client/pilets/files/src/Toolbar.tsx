/**
 * The row above the folder's contents (Figma "Content tool bar" 2:6855 and 2:6864): Upload and Add a folder on the
 * left, then on the right the gallery's sort menu and the toggle to the other view. The list view drops the sort,
 * as its column headers sort. Below 576px the gallery's row splits into the two buttons above the sort and toggle.
 *
 * Upload opens the browser's file picker (see Uploads.tsx), and is disabled where the member cannot add files.
 * Add a folder is the host's (AddFolder.tsx), and a disabled placeholder without it.
 */
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ImportIcon, ListViewIcon, Menu } from '@silverstripe/admin-patterns';
import type { ButtonProps } from '@silverstripe/admin-patterns';
import { sortLabel, sortOptions } from './api';
import type { FileSort } from './api';
// Figma "White buttons" Add a folder in 2:6855; the patterns package has no folder glyph
import addFolderIcon from './assets/add-folder.svg';
// Figma "White buttons" Type=Gallery view 2:6163; the patterns package has no grid glyph
import galleryViewIcon from './assets/gallery-view.svg';
import type { FolderView } from './paths';

export interface ToolbarProps {
  view: FolderView;
  sort: FileSort;
  /** The path of the folder in the other view */
  otherViewPath: string;
  onSort: (sort: FileSort) => void;
  /** Opens the file picker; without it Upload is disabled */
  onUpload?: () => void;
  /** Typed with the pilet's React; the patterns package carries its own React types */
  uploadRef?: React.Ref<HTMLButtonElement>;
  addFolder?: React.ReactNode;
}

export const Toolbar = ({ view, sort, otherViewPath, onSort, onUpload, uploadRef, addFolder }: ToolbarProps) => {
  const navigate = useNavigate();
  const isGallery = view === 'gallery';
  return (
    <div className={isGallery ? 'files-toolbar files-toolbar--sorted' : 'files-toolbar'}>
      <div className="files-toolbar__actions">
        <Button variant="tertiary" icon={<ImportIcon />} disabled={!onUpload} onClick={onUpload} ref={uploadRef as ButtonProps['ref']}>
          Upload
        </Button>
        {addFolder ?? (
          <Button variant="tertiary" icon={<img src={addFolderIcon} alt="" />} disabled>
            Add a folder
          </Button>
        )}
      </div>
      <div className="files-toolbar__view">
        {isGallery && (
          <Menu id="Files_Sort" label="Sort files" title={`Sort: ${sortLabel(sort)}`} variant="tertiary">
            {sortOptions.map((option) => (
              <Button key={option.sort} variant="tertiary" onClick={() => onSort(option.sort)}>
                {option.label}
              </Button>
            ))}
          </Menu>
        )}
        <Button
          variant="tertiary"
          iconOnly
          aria-label={isGallery ? 'List view' : 'Gallery view'}
          icon={isGallery ? <ListViewIcon /> : <img src={galleryViewIcon} alt="" />}
          onClick={() => navigate(otherViewPath)}
        />
      </div>
    </div>
  );
};
