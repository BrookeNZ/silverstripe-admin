import type { PiletApi } from '@silverstripe/admin-shell';
import { connectConfig } from './legacy/Config';
import SearchableDropdownField from './SearchableDropdownField/SearchableDropdownField';
import TreeDropdownField from './TreeDropdownField/TreeDropdownField';
import UsedOnTable from './UsedOnTable/UsedOnTable';
import PreviewImageField from './asset-admin/PreviewImageField/PreviewImageField';
import FocusPointField from './focuspoint/FocusPointField/FocusPointField';
import UploadField from './UploadField/UploadField';
import { createLinkField } from './LinkField/LinkField';

export function setup(api: PiletApi) {
  connectConfig(api);
  api.registerSilverstripeComponent('SearchableDropdownField', SearchableDropdownField);
  api.registerSilverstripeComponent('TreeDropdownField', TreeDropdownField);
  api.registerSilverstripeComponent('UsedOnTable', UsedOnTable);
  // Fields of other modules, carried here until asset-admin, linkfield and jonom/focuspoint ship pilets of their own
  api.registerSilverstripeComponent('PreviewImageField', PreviewImageField);
  api.registerSilverstripeComponent('FocusPointField', FocusPointField);
  api.registerSilverstripeComponent('UploadField', UploadField);
  api.registerSilverstripeComponent('LinkField', createLinkField(api.getSilverstripeComponent('SchemaFormDialog')));
}
