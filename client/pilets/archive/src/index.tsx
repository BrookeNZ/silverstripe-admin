import type { PiletApi } from '@silverstripe/admin-shell';
import { createArchiveTypeField } from './ArchiveTypeField';

// ArchiveAdminShellExtension::TYPE_FIELD_COMPONENT in the admin module
const typeFieldComponent = 'ArchiveTypeField';

export function setup(api: PiletApi) {
  api.registerSilverstripeComponent(
    typeFieldComponent,
    createArchiveTypeField(api.getSilverstripeComponent('SingleSelectField'), (url) => window.location.assign(url)),
  );
}
