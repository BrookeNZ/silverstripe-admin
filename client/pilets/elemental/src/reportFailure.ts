import type { PiletApi } from '@silverstripe/admin-shell';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lets a handler's promise settle on its own, showing a rejection as an error toast as the block writes do */
export function reportFailure(api: Pick<PiletApi, 'showNotification'>, result: void | Promise<unknown>): void {
  void Promise.resolve(result).catch((error: unknown) => {
    api.showNotification(errorMessage(error), { type: 'error' });
  });
}
