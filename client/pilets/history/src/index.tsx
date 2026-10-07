import type { PiletApi } from '@silverstripe/admin-shell';
import { createHistoryApi } from './api';
import { createHistoryViewer } from './HistoryViewer';
import './history.css';

const historyController = 'SilverStripe\\VersionedAdmin\\Controllers\\HistoryViewerController';
// The schemaComponent of versioned-admin's HistoryViewerField
const historyViewerComponent = 'HistoryViewer';

interface HistorySection {
  endpoints?: { read?: string; revert?: string };
  form?: { versionForm?: { schemaUrl?: string } };
}

export function setup(api: PiletApi) {
  const config = api.getConfig();
  const section = config.sections.find((candidate) => candidate.name === historyController) as HistorySection | undefined;
  const read = section?.endpoints?.read;
  const revert = section?.endpoints?.revert;
  const versionSchemaUrl = section?.form?.versionForm?.schemaUrl;
  if (!read || !revert || !versionSchemaUrl) {
    return;
  }
  const absolute = (url: string) => new URL(url, document.baseURI).href;
  api.registerSilverstripeComponent(
    historyViewerComponent,
    createHistoryViewer({
      api,
      client: createHistoryApi({ read: absolute(read), revert: absolute(revert) }, () => String(config.SecurityID ?? '')),
      versionSchemaUrl: (recordClass, id, version) => {
        const url = new URL(absolute(versionSchemaUrl));
        url.searchParams.set('RecordClass', recordClass);
        url.searchParams.set('RecordID', String(id));
        url.searchParams.set('RecordVersion', String(version));
        return url.href;
      },
    }),
  );
}
