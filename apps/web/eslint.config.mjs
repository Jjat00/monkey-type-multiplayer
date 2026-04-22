import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The new react-hooks v6 rules are strict and reject several legitimate
    // patterns we use intentionally:
    //   - `react-hooks/set-state-in-effect`: we hydrate from localStorage and
    //     generate random text in mount-effects to avoid SSR/CSR mismatch.
    //   - `react-hooks/refs`: useTypingEngine uses a ref-as-state pattern so
    //     keystrokes don't get batched (a measured perf optimization).
    //   - `react-hooks/purity`: we read `performance.now()` and refs during
    //     render to derive live metrics; no React state derives from them
    //     so the "impurity" doesn't cause inconsistent renders.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
