import { defineConfig } from 'vitest/config';

// The patterns package is linked from ../../patterns with its own React; the shell shares one copy at runtime
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
});
