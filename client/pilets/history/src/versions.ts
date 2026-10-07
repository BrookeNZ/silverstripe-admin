import type { Version, VersionMember } from './api';

export type VersionStatus = 'archived' | 'published' | 'draft';

export const statusLabels: Readonly<Record<VersionStatus, string>> = {
  archived: 'Archived',
  published: 'Published',
  draft: 'Draft',
};

export function versionStatus(version: Version): VersionStatus {
  if (version.deleted) {
    return 'archived';
  }
  return version.published ? 'published' : 'draft';
}

export function memberName(member: VersionMember | null | undefined): string {
  return [member?.firstName, member?.surname].filter(Boolean).join(' ') || 'Unknown';
}

/** `lastEdited` is the server's `Y-m-d H:i:s`, read as local time like the legacy viewer */
export function formatEdited(lastEdited: string, locale?: string): string {
  const date = new Date(lastEdited.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return lastEdited;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function pageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
}

/** Legacy offers revert for any version but the newest one, and only to a member who can edit */
export function canRevertTo(version: Version, newestVersion: number | null, isRevertable: boolean): boolean {
  return isRevertable && newestVersion !== null && version.version !== newestVersion;
}
