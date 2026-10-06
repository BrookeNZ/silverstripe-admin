/**
 * Stands in for the admin's provideUsedOnData HOC and its usedOn Redux slice: fetches the usage list
 * from the field's `readUsageEndpoint` once per record and keeps it in the component. The legacy
 * version waited until its tab was active (useTabContext); the shell's Tabs keep inactive panels
 * mounted but hidden, so this waits until the table first has a rendered box, whatever hid it
 */
import * as React from 'react';
import i18n from '../legacy/i18n';
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

export async function loadUsedOn(method: string | undefined, url: string | undefined): Promise<Array<UsedOnRecord>> {
  if (!method || !url) {
    throw new Error(i18n._t('Admin.NOT_AVAILABLE_USED_DATA', 'The usage data is currently unavailable.'));
  }
  const response = await fetch(new URL(url, document.baseURI), {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const body = await response.json();
  return body.usage ?? [];
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
    const identifier = recordClass && recordId ? `${recordClass}#${recordId}` : '';
    const [state, setState] = React.useState<UsedOnState>({ loading: true, usedOn: null, error: null });
    const root = React.useRef<HTMLDivElement>(null);
    const shown = useFirstShown(root);

    React.useEffect(() => {
      if (!shown) {
        return undefined;
      }
      let current = true;
      setState({ loading: true, usedOn: null, error: null });
      loadUsedOn(identifier ? readUsageEndpoint?.method : undefined, readUsageEndpoint?.url)
        .then((usedOn) => current && setState({ loading: false, usedOn, error: null }))
        .catch((error) => current && setState({ loading: false, usedOn: null, error: error.message }));
      return () => {
        current = false;
      };
    }, [shown, identifier, readUsageEndpoint?.method, readUsageEndpoint?.url]);

    return (
      <div ref={root}>
        <UsedOnTable {...state} />
      </div>
    );
  };

  return fieldHolder<UsedOnSchema>(UsedOnDataProvider, ['data']);
};

export default provideUsedOnData;
