/**
 * The loader's entry file. ChromePage.ss writes the import map, `#ss-admin-modules` and `#ss-admin-config` before this
 * script. `@silverstripe/admin` is imported through the map, as modules import it, so both share one instance.
 */
import './internals';
import { startChrome } from './clientConfig';
import { bootModules, readModuleList } from './loader';

startChrome(() => bootModules(readModuleList()));
