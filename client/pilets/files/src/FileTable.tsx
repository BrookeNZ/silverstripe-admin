/**
 * A folder's contents as a list (Figma "List header" 2:6388, "File list item" 2:6533), drawn by the shell's
 * `DataTable`: Title (type icon, name as the row's link, Draft badge), Size, Modified and a checkbox per row, the
 * folders first as the endpoint orders them. Title and Modified sort the folder through the same `sort` the
 * gallery's menu sets; Size cannot, as the endpoint does not sort by it. A row opens its folder or its file. The
 * file open in the details panel is the table's current row (Figma "File list item" Active 2:37437).
 */
import type * as React from 'react';
import { Link } from 'react-router-dom';
import type { DataTableColumn, DataTableProps, DataTableRow, DataTableSort } from '@silverstripe/admin-shell';
import type { FileItem, FileSort } from './api';
// Figma "File list item" Type=PDF 2:6683, its 24px document glyph
import documentIcon from './assets/document-small.svg';
// Figma "Folder" icon in Royal Blue, as on the gallery tile
import folderIcon from './assets/folder.svg';
// Figma "File list item" Type=Image 2:6578, the image glyph alone: the design paints it Grey 900 through a mask
// whose layer is #4F5861, and the mask layer is the asset the file holds
import imageIcon from './assets/image.svg';

export interface FileTableProps {
  items: ReadonlyArray<FileItem>;
  sort: FileSort;
  onSort: (sort: FileSort) => void;
  itemPath: (item: FileItem) => string;
  onOpen: (path: string) => void;
  Table: React.ComponentType<DataTableProps>;
  /** The file open in the details panel */
  activeId?: number | null;
}

const columnField: Record<string, string> = { title: 'title', modified: 'lastEdited' };

export const fileColumns: ReadonlyArray<DataTableColumn> = [
  { name: 'title', title: 'Title', sortable: true, rowHeader: true },
  { name: 'size', title: 'Size', align: 'center', hideWhenNarrow: true, className: 'files-table__meta' },
  { name: 'modified', title: 'Modified', sortable: true, firstDirection: 'desc', align: 'center', hideWhenNarrow: true, className: 'files-table__meta' },
];

/** The table's sort for a URL sort, and back */
export function tableSort(sort: FileSort): DataTableSort {
  const field = sort.replace(/^-/, '');
  return { column: field === 'lastEdited' ? 'modified' : 'title', direction: sort.startsWith('-') ? 'desc' : 'asc' };
}

export function fileSort(sort: DataTableSort): FileSort {
  const field = columnField[sort.column] ?? 'title';
  return (sort.direction === 'desc' ? `-${field}` : field) as FileSort;
}

/** The server's `Y-m-d H:i:s` as the design's "Feb 22 2021" */
export function formatModified(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return '';
  }
  const [, year, month, day] = match;
  const monthName = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  return `${monthName} ${Number(day)} ${year}`;
}

function typeIcon(item: FileItem): string {
  if (item.type === 'folder') {
    return folderIcon;
  }
  return item.category === 'image' ? imageIcon : documentIcon;
}

export function fileRows(items: ReadonlyArray<FileItem>, itemPath: (item: FileItem) => string): Array<DataTableRow> {
  return items.map((item) => ({
    id: item.id,
    label: item.title,
    cells: {
      title: (
        <span className="files-table__title">
          <span className="files-table__icon">
            <img src={typeIcon(item)} alt="" />
          </span>
          <Link className="files-table__link" to={itemPath(item)} data-file-link={item.type === 'folder' ? undefined : item.id}>
            {item.title}
          </Link>
          {item.draft && <span className="files-badge">Draft</span>}
        </span>
      ),
      // Figma shows an em dash for a folder
      size: item.size ?? '—',
      modified: item.lastEdited ? <time dateTime={item.lastEdited.replace(' ', 'T')}>{formatModified(item.lastEdited)}</time> : '',
    },
  }));
}

export const FileTable = ({ items, sort, onSort, itemPath, onOpen, Table, activeId = null }: FileTableProps) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <Table
      caption="Files"
      className="files-table"
      columns={fileColumns}
      rows={fileRows(items, itemPath)}
      currentRowId={activeId}
      sort={tableSort(sort)}
      onSort={(next) => onSort(fileSort(next))}
      selection={{ selected: [] }}
      onOpenRow={(id) => {
        const item = byId.get(Number(id));
        if (item) {
          onOpen(itemPath(item));
        }
      }}
    />
  );
};
