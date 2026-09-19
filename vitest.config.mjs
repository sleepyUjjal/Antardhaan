import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Pinned rather than left to the default glob. `node_modules` is excluded
    // by default but `.next` is not, and vitest's default include would happily
    // walk a production build. The tests also live next to what they test and
    // import it relatively, so no `@/*` alias resolution is needed here.
    include: ['lib/**/*.test.js'],
  },
})
