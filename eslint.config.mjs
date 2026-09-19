import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// eslint-config-next 16 exports a flat config array directly, so no FlatCompat.
// It already carries its own global ignores (.next, out, build, next-env.d.ts)
// and its TypeScript block, which is inert here because the project is JS-only.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ['db/migrations/**'],
  },
]

export default eslintConfig
