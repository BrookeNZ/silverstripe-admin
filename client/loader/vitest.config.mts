import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The build leaves this specifier to the import map; tsconfig.json maps it to the same source for the typecheck
  resolve: { alias: [{ find: /^@silverstripe\/admin$/, replacement: fileURLToPath(new URL('./src/runtime.ts', import.meta.url)) }] },
});
