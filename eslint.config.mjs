import { defineConfig, globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      boundaries,
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              disallow: [
                "application",
                "components",
                "infrastructure",
                "lib",
                "pages",
                "server",
              ],
              from: "domain",
            },
            {
              disallow: ["components", "infrastructure", "pages"],
              from: "application",
            },
            {
              disallow: ["domain", "infrastructure", "server"],
              from: "components",
            },
            {
              disallow: ["domain"],
              from: "pages",
            },
          ],
        },
      ],
      "boundaries/no-unknown-files": "error",
    },
    settings: {
      "boundaries/root-path": process.cwd(),
      "boundaries/elements": [
        { mode: "full", pattern: "src/pages/*", type: "pages" },
        { mode: "full", pattern: "src/pages/**/*", type: "pages" },
        { mode: "full", pattern: "src/components/*", type: "components" },
        { mode: "full", pattern: "src/components/**/*", type: "components" },
        { mode: "full", pattern: "src/lib/*", type: "lib" },
        { mode: "full", pattern: "src/lib/**/*", type: "lib" },
        { mode: "full", pattern: "src/server/*", type: "server" },
        { mode: "full", pattern: "src/server/**/*", type: "server" },
        {
          mode: "full",
          pattern: "src/modules/*/application/*",
          type: "application",
        },
        {
          mode: "full",
          pattern: "src/modules/*/application/**/*",
          type: "application",
        },
        { mode: "full", pattern: "src/modules/*/domain/*", type: "domain" },
        {
          mode: "full",
          pattern: "src/modules/*/domain/**/*",
          type: "domain",
        },
        {
          mode: "full",
          pattern: "src/modules/*/infrastructure/*",
          type: "infrastructure",
        },
        {
          mode: "full",
          pattern: "src/modules/*/infrastructure/**/*",
          type: "infrastructure",
        },
        { mode: "full", pattern: "src/tests/*", type: "tests" },
        { mode: "full", pattern: "src/tests/**/*", type: "tests" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
