import type { PiletApi } from '@silverstripe/admin-shell';
import { connectConfig } from './legacy/Config';
import SearchableDropdownField from './SearchableDropdownField/SearchableDropdownField';

export function setup(api: PiletApi) {
  connectConfig(api);
  api.registerSilverstripeComponent('SearchableDropdownField', SearchableDropdownField);
}
