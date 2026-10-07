import { describe, expect, it } from 'vitest';
import { clearBeforeSubmitOf, registerBeforeSubmit, runBeforeSubmit } from './beforeSubmit';

describe('before-submit handlers', () => {
  it('runs the form handlers in order, awaiting each', async () => {
    const order: Array<string> = [];
    const disposeFirst = registerBeforeSubmit('Form_A', 'one', async ({ action }) => {
      await Promise.resolve();
      order.push(`first ${action}`);
    });
    const disposeSecond = registerBeforeSubmit('Form_A', 'two', () => {
      order.push('second');
      return true;
    });
    const disposeOther = registerBeforeSubmit('Form_B', 'one', () => {
      order.push('other form');
    });
    expect(await runBeforeSubmit('Form_A', { action: 'action_save' })).toBe(true);
    expect(order).toEqual(['first action_save', 'second']);
    disposeFirst();
    disposeSecond();
    disposeOther();
  });

  it('stops at a handler that answers false and cancels the submission', async () => {
    const ran: Array<string> = [];
    const disposeFirst = registerBeforeSubmit('Form_A', 'one', () => false);
    const disposeSecond = registerBeforeSubmit('Form_A', 'two', () => {
      ran.push('second');
    });
    expect(await runBeforeSubmit('Form_A', { action: 'action_save' })).toBe(false);
    expect(ran).toEqual([]);
    disposeFirst();
    disposeSecond();
  });

  it('lets a thrown error reach the form', async () => {
    const dispose = registerBeforeSubmit('Form_A', 'one', () => {
      throw new Error('Block failed');
    });
    await expect(runBeforeSubmit('Form_A', { action: 'action_save' })).rejects.toThrow('Block failed');
    dispose();
  });

  it('drops a disposed handler and the handlers of an unloaded pilet', async () => {
    const ran: Array<string> = [];
    const dispose = registerBeforeSubmit('Form_A', 'one', () => {
      ran.push('disposed');
    });
    registerBeforeSubmit('Form_A', 'unloaded', () => {
      ran.push('unloaded');
    });
    dispose();
    clearBeforeSubmitOf('unloaded');
    expect(await runBeforeSubmit('Form_A', { action: 'action_save' })).toBe(true);
    expect(ran).toEqual([]);
  });
});
