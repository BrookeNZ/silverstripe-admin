/**
 * The CMS module's URL segment `suggest` action, shared by the URL segment field and the page Title field
 * that drives it. The action answers the segment the server would store for a value (filtered, and made
 * unique among the page's siblings) as `{"value": ...}`, or a plain-text error.
 */
import type { JsonRequest } from './api';

export const siteTreeURLSegmentFieldClass = 'SilverStripe\\CMS\\Forms\\SiteTreeURLSegmentField';

export function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function decoded(value: string, decode: (part: string) => string): string {
  try {
    return decode(value);
  } catch {
    return value;
  }
}

function liveSecurityId(): string {
  return text((window as { ss?: { config?: { SecurityID?: unknown } } }).ss?.config?.SecurityID);
}

export async function suggestSegment(request: JsonRequest, suggestUrl: string, value: string, signal?: AbortSignal): Promise<string> {
  const answer = await request<{ value?: unknown }>(suggestUrl, {
    query: { value },
    // The suggest action reads nothing but the value; the token is sent so it could be checked
    headers: { 'X-SecurityID': liveSecurityId() },
    signal,
  });
  return decoded(text(answer?.value), decodeURIComponent);
}

export function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

export function failureMessage(error: unknown): string {
  const failure = error as { name?: unknown; serverMessage?: unknown; message?: unknown } | null;
  if (failure?.name === 'ServerRequestError' && typeof failure.serverMessage === 'string') {
    return failure.serverMessage;
  }
  return typeof failure?.message === 'string' && failure.message !== '' ? failure.message : 'The URL segment could not be checked.';
}
