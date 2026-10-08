/**
 * The Pilet API plugin run against stand-ins for Piral's global state context and pilet API, since
 * Piral's own need the codegen a piral build produces. Each stand-in carries only what the test reaches
 */
import type { SilverstripeApi } from '../api/silverstripe';
import { createSilverstripeApi } from '../api/silverstripe';

type PiletApiFactory = (api: unknown, meta: { name: string }) => SilverstripeApi;

export function silverstripePlugin(context: unknown): PiletApiFactory {
  const plugin = createSilverstripeApi() as unknown as (context: unknown) => PiletApiFactory;
  return plugin(context);
}
