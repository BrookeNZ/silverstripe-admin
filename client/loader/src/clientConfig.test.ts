// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientConfig } from '@silverstripe/admin';
import { CONFIG_BLOCK_ID, startChrome } from './clientConfig';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function configBlock(json: string) {
  const block = document.createElement('script');
  block.type = 'application/json';
  block.id = CONFIG_BLOCK_ID;
  block.textContent = json;
  document.body.append(block);
}

describe('startChrome', () => {
  it('starts nothing and logs once without a config, and with one hands modules the page config frozen', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const start = vi.fn();
    startChrome(start);
    expect(start).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);

    configBlock('{"SecurityID":"csrf-token","adminUrl":"admin/","sections":[]}');
    startChrome(start);
    expect(start).toHaveBeenCalledTimes(1);
    const config = clientConfig();
    expect(config.SecurityID).toBe('csrf-token');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.sections)).toBe(true);
  });
});
