import type { PiletApi } from '@silverstripe/admin-shell';
import { connectConfig } from './legacy/Config';
import SearchableDropdownField from './SearchableDropdownField/SearchableDropdownField';
import TreeDropdownField from './TreeDropdownField/TreeDropdownField';
import UsedOnTable from './UsedOnTable/UsedOnTable';
import PreviewImageField from './asset-admin/PreviewImageField/PreviewImageField';
import FocusPointField from './focuspoint/FocusPointField/FocusPointField';

export function setup(api: PiletApi) {
  connectConfig(api);
  api.registerSilverstripeComponent('SearchableDropdownField', SearchableDropdownField);
  api.registerSilverstripeComponent('TreeDropdownField', TreeDropdownField);
  api.registerSilverstripeComponent('UsedOnTable', UsedOnTable);
  // Fields of other modules, carried here until asset-admin and jonom/focuspoint ship pilets of their own
  api.registerSilverstripeComponent('PreviewImageField', PreviewImageField);
  api.registerSilverstripeComponent('FocusPointField', FocusPointField);
}
