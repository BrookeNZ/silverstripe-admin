/**
 * The loader's entry file. ChromePage.ss writes the import map, `#ss-admin-entries` and `#ss-admin-config` before this
 * script. `@silverstripe/admin` is imported through the map, as entries import it, so both share one instance.
 */
// For its side effect; entries arrive only by dynamic import, so every static import, this one included, runs first
import './internals';
import { startChrome } from './clientConfig';
import { bootEntries, readEntryList } from './loader';

startChrome(() => bootEntries(readEntryList()));
