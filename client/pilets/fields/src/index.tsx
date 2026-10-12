/**
 * The admin module's own field pilet: legacy React fields ported with their bodies kept close to the
 * legacy source, plus fields of modules that ship no pilet yet. The stand-ins under legacy/ replace the
 * admin globals those files imported, so setup connects them to this pilet's API before any field
 * renders. PORTING.md beside the source lists each port's changes.
 */
import type * as React from 'react';
import type { PiletApi } from '@silverstripe/admin-shell';
import { connectConfig } from './legacy/Config';
import { connectServerCache } from './legacy/Backend';
import SearchableDropdownField from './SearchableDropdownField/SearchableDropdownField';
import TreeDropdownField from './TreeDropdownField/TreeDropdownField';
import UsedOnTable from './UsedOnTable/UsedOnTable';
import PreviewImageField from './asset-admin/PreviewImageField/PreviewImageField';
import FocusPointField from './focuspoint/FocusPointField/FocusPointField';
import UploadField from './UploadField/UploadField';
import { createLinkField } from './LinkField/LinkField';

declare module '@silverstripe/admin-shell' {
  interface SilverstripeComponents {
    SearchableDropdownField: React.ComponentProps<typeof SearchableDropdownField>;
    TreeDropdownField: React.ComponentProps<typeof TreeDropdownField>;
    UsedOnTable: React.ComponentProps<typeof UsedOnTable>;
    PreviewImageField: React.ComponentProps<typeof PreviewImageField>;
    FocusPointField: React.ComponentProps<typeof FocusPointField>;
    UploadField: React.ComponentProps<typeof UploadField>;
    LinkField: React.ComponentProps<ReturnType<typeof createLinkField>>;
  }
}

export function setup(api: PiletApi) {
  connectConfig(api);
  connectServerCache(api);
  api.registerSilverstripeComponent('SearchableDropdownField', SearchableDropdownField);
  api.registerSilverstripeComponent('TreeDropdownField', TreeDropdownField);
  api.registerSilverstripeComponent('UsedOnTable', UsedOnTable);
  // Fields of other modules, carried here until asset-admin, linkfield and jonom/focuspoint ship pilets of their own
  api.registerSilverstripeComponent('PreviewImageField', PreviewImageField);
  api.registerSilverstripeComponent('FocusPointField', FocusPointField);
  api.registerSilverstripeComponent('UploadField', UploadField);
  api.registerSilverstripeComponent('LinkField', createLinkField(api.getSilverstripeComponent('SchemaFormDialog')));
}
