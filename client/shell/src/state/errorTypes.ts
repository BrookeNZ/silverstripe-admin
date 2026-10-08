/**
 * The failure `fetchJson` rejects with, as pilets see it. Pilets get the shell's types but none of its
 * runtime, so they cannot use `instanceof`; they narrow an unknown failure by its `name`, which is fixed
 * for this purpose. Published through `extraTypes` in package.json, so this file holds types only.
 */
export interface ServerRequestErrorShape extends Error {
  readonly name: 'ServerRequestError';
  readonly status: number;
  /** A 401, a 403 with `X-Reauthenticate`, or a request redirected to the login form */
  readonly sessionExpired: boolean;
  /** What the server said about the failure, when it said anything worth showing */
  readonly serverMessage: string | null;
  /** The first error's `reason` in the CMS JSON envelope, a code an endpoint can name the failure with */
  readonly reason?: string;
  /** The first error's `field` in the CMS JSON envelope */
  readonly field?: string;
}

export type ServerRequestError = ServerRequestErrorShape;
