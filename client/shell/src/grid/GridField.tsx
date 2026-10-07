/**
 * The shell's component for `SilverStripe\Forms\GridField\GridField`. A grid whose config carries the
 * admin module's rows endpoint arrives with `data.rowsUrl` and renders as a React grid, loaded as its
 * own chunk with TanStack Table; any other grid still arrives with its server HTML and renders as a
 * server HTML field.
 */
import * as React from 'react';
import { fieldTitle } from '@silverstripe/admin-patterns';
import { ServerHtmlField } from '../forms/fields/ServerHtmlField';
import type { FieldComponentProps } from '../forms/types';

const GridTable = React.lazy(() => import(/* webpackChunkName: "grid" */ './GridTable').then((module) => ({ default: module.GridTable })));

export const GridField = (props: FieldComponentProps) => {
  const rowsUrl = props.field.data.rowsUrl;
  if (typeof rowsUrl !== 'string') {
    return <ServerHtmlField {...props} />;
  }
  return (
    <React.Suspense fallback={<p role="status">Loading {fieldTitle(props.field) || props.field.name}…</p>}>
      <GridTable id={props.field.id} name={props.field.name} title={fieldTitle(props.field) || null} rowsUrl={rowsUrl} />
    </React.Suspense>
  );
};

GridField.fullWidth = true;
