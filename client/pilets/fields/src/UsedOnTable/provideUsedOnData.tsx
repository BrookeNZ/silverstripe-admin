/**
 * Stands in for the admin's provideUsedOnData HOC and its usedOn Redux slice: reads the usage list from
 * the field's `readUsageEndpoint` through the server cache, keyed `[recordClass, recordId, 'usage']`, so
 * a change to the record refetches it. The legacy version waited until its tab was active
 * (useTabContext); the shell's Tabs keep inactive panels mounted but hidden, so this waits until the
 * table first has a rendered box, whatever hid it
 */
import * as React from 'react';
import i18n from '../legacy/i18n';
import { failedStatus, serverCache } from '../legacy/Backend';
import type { ServerCache } from '../legacy/Backend';
import fieldHolder from '../legacy/fieldHolder';
import type { UsedOnRecord } from './UsedOnTable';

export interface UsedOnSchema {
  data: {
    recordClass?: string;
    recordId?: string | number;
    readUsageEndpoint?: { url: string; method: string };
  };
}

interface UsedOnState {
  loading: boolean;
  usedOn: Array<UsedOnRecord> | null;
  error: string | null;
}

const unavailable = () => i18n._t('Admin.NOT_AVAILABLE_USED_DATA', 'The usage data is currently unavailable.');

type UsageMethod = 'GET' | 'POST';

export async function loadUsedOn(request: ServerCache['fetchJson'], method: string, url: string, signal: AbortSignal): Promise<Array<UsedOnRecord>> {
  const body = await request<{ usage?: Array<UsedOnRecord> } | null>(url, { method: method.toUpperCase() as UsageMethod, signal });
  return body?.usage ?? [];
}

function usageError(error: Error, url: string): string {
  const status = failedStatus(error);
  return status === null ? error.message : `${url} answered ${status}`;
}

function useFirstShown(element: React.RefObject<HTMLElement>): boolean {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const target = element.current;
    if (shown || !target) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (target.getClientRects().length > 0) {
        setShown(true);
        observer.disconnect();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, shown]);
  return shown;
}

const provideUsedOnData = (UsedOnTable: React.ComponentType<UsedOnState>) => {
  const UsedOnDataProvider = ({ data }: UsedOnSchema) => {
    const { recordClass, recordId, readUsageEndpoint } = data ?? {};
    const root = React.useRef<HTMLDivElement>(null);
    const shown = useFirstShown(root);
    const method = readUsageEndpoint?.method;
    const url = readUsageEndpoint?.url;
    const available = Boolean(recordClass && recordId && method && url);
    const usage = serverCache().useServerQuery(
      [String(recordClass), Number(recordId), 'usage'],
      ({ signal, request }) => loadUsedOn(request, method ?? '', url ?? '', signal),
      { enabled: shown && available },
    );
    let state: UsedOnState = { loading: true, usedOn: null, error: null };
    if (shown && !available) {
      state = { loading: false, usedOn: null, error: unavailable() };
    } else if (usage.data) {
      state = { loading: false, usedOn: usage.data, error: null };
    } else if (usage.error) {
      state = { loading: false, usedOn: null, error: usageError(usage.error, url ?? '') };
    }

    return (
      <div ref={root}>
        <UsedOnTable {...state} />
      </div>
    );
  };

  return fieldHolder<UsedOnSchema>(UsedOnDataProvider, ['data']);
};

export default provideUsedOnData;
