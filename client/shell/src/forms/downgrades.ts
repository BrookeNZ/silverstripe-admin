/**
 * The fields this page load rendered as an ancestor's component, for a developer checking which field
 * components are still to port. Shell-only: pilets have no use for it, so it is not on the Pilet API.
 * PILET-API.md "Component resolution" has the rule.
 */
import type { FieldDowngrade } from './resolve';

const reported = new Map<string, FieldDowngrade>();

/** Warns the first time each field class is downgraded */
export function reportFieldDowngrade(downgrade: FieldDowngrade): void {
  if (reported.has(downgrade.component)) {
    return;
  }
  reported.set(downgrade.component, downgrade);
  console.warn(
    `${downgrade.component} has no registered component of its own, so it renders as its ancestor's ${downgrade.resolved} and loses what that lacks`,
  );
}

/** Each downgraded field class this page load, in the order first seen */
export function fieldDowngrades(): ReadonlyArray<FieldDowngrade> {
  return [...reported.values()];
}

export function resetFieldDowngrades(): void {
  reported.clear();
}
