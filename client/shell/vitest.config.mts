import { defineConfig } from 'vitest/config';

// The patterns package is linked from ../patterns, which has no react of its own; the webpack
// config makes the same choice for the build
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
});
