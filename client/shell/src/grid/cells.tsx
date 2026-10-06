/**
 * Cell rendering. A cell the server sent as `html` renders that HTML (prepared like a server HTML
 * field: no inline handlers, links disabled) whatever its column declares. A `value` cell renders the
 * column's declared component, looked up as a Silverstripe component so a pilet can register or
 * replace `GridField.cell.<Name>`; with no registration it falls back to the value as text.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import { prepareServerHtml } from '../forms/serverHtml';
import type { GridCellData, GridCellProps, GridCellValue, GridColumn, GridRow } from './types';

export const textCellComponent = 'GridField.cell.Text';

export type CellRendering =
  | { kind: 'empty' }
  | { kind: 'html'; html: string }
  | { kind: 'component'; name: string; value: GridCellValue }
  | { kind: 'text'; text: string };

export function cellText(value: GridCellValue): string {
  return value === null ? '' : String(value);
}

export function resolveCell(
  cell: GridCellData | undefined,
  column: GridColumn,
  isRegistered: (name: string) => boolean,
): CellRendering {
  if (!cell) {
    return { kind: 'empty' };
  }
  if ('html' in cell) {
    return { kind: 'html', html: cell.html };
  }
  const name = column.cell?.component;
  if (name && isRegistered(name)) {
    return { kind: 'component', name, value: cell.value };
  }
  return { kind: 'text', text: cellText(cell.value) };
}

export const TextCell = ({ value }: GridCellProps) => <>{cellText(value)}</>;

/**
 * Server HTML for a cell or slot: prepared like a server HTML field, and its controls disabled, because
 * the grid sits inside the CMS form and a server button would submit it; its action is not ported yet
 */
export function prepareGridHtml(html: string): string {
  const body = new DOMParser().parseFromString(prepareServerHtml(html).html, 'text/html').body;
  for (const control of Array.from(body.querySelectorAll('button, input, select, textarea'))) {
    control.setAttribute('disabled', '');
    if (control.tagName === 'BUTTON') {
      control.setAttribute('type', 'button');
    }
  }
  return body.innerHTML;
}

export const HtmlContent = ({ html, className }: { html: string; className?: string }) => {
  const prepared = React.useMemo(() => prepareGridHtml(html), [html]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: prepared }} />;
};

export interface GridCellContentProps {
  cell: GridCellData | undefined;
  row: GridRow;
  column: GridColumn;
  isRegistered(name: string): boolean;
  component(name: string): ComponentType<GridCellProps>;
}

export const GridCellContent = ({ cell, row, column, isRegistered, component }: GridCellContentProps) => {
  const rendering = resolveCell(cell, column, isRegistered);
  switch (rendering.kind) {
    case 'html':
      return <HtmlContent html={rendering.html} />;
    case 'component': {
      const Cell = component(rendering.name);
      return <Cell value={rendering.value} row={row} column={column} props={column.cell?.props ?? {}} />;
    }
    case 'text':
      return <>{rendering.text}</>;
    default:
      return null;
  }
};
