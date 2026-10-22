import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The obsidian package ships only type declarations; modules that import it
    // at runtime get a stub that does nothing.
    alias: { obsidian: '/tests/stubs/obsidian.ts' }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
