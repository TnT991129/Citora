// Revisión automática del código (npm run lint). No bloquea la publicación: corre en su propia
// Acción de GitHub (ver .github/workflows/checks.yml) para avisar de errores comunes de React y
// TypeScript antes de que lleguen a los clientes.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Las reglas de los hooks de React evitan errores reales (hooks dentro de un if, etc.)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TypeScript ya avisa de lo que no se usa (noUnusedLocals en tsconfig.json)
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'public/sw.js'],
    languageOptions: { globals: { ...globals.node, ...globals.serviceworker } },
  },
)
