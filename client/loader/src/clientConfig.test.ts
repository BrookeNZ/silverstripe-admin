// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientConfig } from '@silverstripe/admin';
import { CONFIG_BLOCK_ID, startChrome } from './clientConfig';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Writes a config block into the page the way ChromePage.ss does */
function configBlock(json: string) {
  const block = document.createElement('script');
  block.type = 'application/json';
  block.id = CONFIG_BLOCK_ID;
  block.textContent = json;
  document.body.append(block);
}

describe('startChrome', () => {
  it('starts nothing and logs once for a config that is missing or not an object', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const start = vi.fn();
    startChrome(start);
    configBlock('[]');
    startChrome(start);
    expect(start).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('hands entries the page config frozen, readable once the start callback runs', () => {
    let readInStart: unknown;
    const start = vi.fn(() => {
      readInStart = clientConfig();
    });
    configBlock('{"SecurityID":"csrf-token","adminUrl":"admin","sections":[]}');
    startChrome(start);
    expect(start).toHaveBeenCalledTimes(1);
    const config = clientConfig();
    expect(readInStart).toBe(config);
    expect(config.SecurityID).toBe('csrf-token');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sections)).toBe(true);
  });
});
