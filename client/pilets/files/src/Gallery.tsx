/**
 * A folder's contents as tiles (Figma "Folder" 2:6464, "Image/doc file" 2:6481): its folders first, then its files,
 * each group a grid of one to five columns by width. A folder tile is its icon, name and checkbox in a row; a file
 * tile is its thumbnail, or a document icon on a pale ground, above its name and checkbox, and on hover or focus
 * the thumbnail blurs under a "View" label. Each tile's name is its link, stretched over the whole tile; the
 * checkbox sits above that stretch and stays disabled until the gallery can select. The file open in the details
 * panel is the Active tile (2:6491): its name row takes Bright Blue 200 and its link is `aria-current`.
 */
import { Link } from 'react-router-dom';
import { PreviewIcon } from '@silverstripe/admin-patterns';
import type { FileItem } from './api';
// Figma "Image/doc file" Type=Document 2:6521, the 50px document glyph
import documentIcon from './assets/document.svg';
// Figma "Folder" 2:6464 icon in Royal Blue; the patterns package has no folder glyph
import folderIcon from './assets/folder.svg';

export interface GalleryProps {
  items: ReadonlyArray<FileItem>;
  folderPath: (id: number) => string;
  filePath: (id: number) => string;
  /** The file open in the details panel */
  activeId?: number | null;
}

// Legacy's AssetAdmin.EMPTY
export const emptyFolderText = 'No files';

interface TileProps {
  item: FileItem;
  to: string;
  active?: boolean;
}

const FolderTile = ({ item, to }: TileProps) => (
  <li className="files-tile">
    <span className="files-tile__footer">
      <Link className="files-tile__link" to={to}>
        <img className="files-tile__icon" src={folderIcon} alt="" />
        <span className="files-tile__name">{item.title}</span>
      </Link>
      <input className="admin-field__check files-tile__check" type="checkbox" disabled aria-label={`Select ${item.title}`} />
    </span>
  </li>
);

const FileTile = ({ item, to, active = false }: TileProps) => (
  <li className={active ? 'files-tile files-tile--file files-tile--active' : 'files-tile files-tile--file'}>
    <span className="files-tile__preview">
      {item.thumbnail ? <img className="files-tile__image" src={item.thumbnail} alt="" /> : <img className="files-tile__type" src={documentIcon} alt="" />}
      <span className="files-tile__view" aria-hidden="true">
        <PreviewIcon />
        View
      </span>
    </span>
    <span className="files-tile__footer">
      <Link className="files-tile__link" to={to} aria-current={active ? 'true' : undefined} data-file-link={item.id}>
        <span className="files-tile__name">{item.title}</span>
      </Link>
      <input className="admin-field__check files-tile__check" type="checkbox" disabled aria-label={`Select ${item.title}`} />
    </span>
  </li>
);

export const Gallery = ({ items, folderPath, filePath, activeId = null }: GalleryProps) => {
  if (items.length === 0) {
    return <p className="files__message files__inset">{emptyFolderText}</p>;
  }
  const folders = items.filter((item) => item.type === 'folder');
  const files = items.filter((item) => item.type !== 'folder');
  return (
    <div className="files-gallery files__inset">
      {folders.length > 0 && (
        <ul className="files-gallery__group" aria-label="Folders">
          {folders.map((item) => (
            <FolderTile key={item.id} item={item} to={folderPath(item.id)} />
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="files-gallery__group" aria-label="Files">
          {files.map((item) => (
            <FileTile key={item.id} item={item} to={filePath(item.id)} active={item.id === activeId} />
          ))}
        </ul>
      )}
    </div>
  );
};
