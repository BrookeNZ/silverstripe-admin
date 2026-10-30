/**
 * Claims the setter of the runtime file (runtime.ts, served as `@silverstripe/admin`) for the loader. The claim runs
 * while the entry file's imports evaluate, so before any module loads; every later claim throws.
 */
import { claimInternals } from '@silverstripe/admin';

export const { setClientConfig } = claimInternals();
