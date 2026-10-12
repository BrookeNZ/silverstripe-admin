/**
 * Stands in for mapHighlight from the admin's lib/castStringToElement: splits `haystack` around each
 * case-insensitive match of `needle` and wraps the matches in `Tag`
 */
import type * as React from 'react';

export function mapHighlight(haystack: string, needle: string, Tag?: React.ComponentType<{ children: React.ReactNode }>) {
  let index = 0;
  let search = haystack;
  const results: Array<React.ReactNode> = [];
  const part = needle.toLocaleLowerCase();

  while (index !== -1) {
    index = search.toLocaleLowerCase().indexOf(part);

    if (index !== -1) {
      const next = index + needle.length;
      const start = search.substring(0, index);
      const found = search.substring(index, next);
      const end = search.substring(next);

      if (start.length) {
        results.push(start);
      }
      results.push(Tag ? <Tag key={results.length / 2}>{found}</Tag> : found);
      search = end;
    }
  }
  results.push(search);

  return results;
}
