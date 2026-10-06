import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "coverage/**", "public/sw.js"] },
  ...compat.extends("next/core-web-vitals"),
  {
    // Flat config only lints .js/.mjs/.cjs by default; components are .jsx.
    files: ["**/*.{js,jsx,mjs,cjs}"],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // React Three Fiber uses three.js props (position, intensity, args…) that the
    // DOM-oriented rule does not recognise.
    files: ["components/3d/**/*.{js,jsx}"],
    rules: { "react/no-unknown-property": "off" },
  },
];

export default eslintConfig;
