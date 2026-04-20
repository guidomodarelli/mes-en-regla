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
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "domain" },
              disallow: {
                to: {
                  type: [
                    "application",
                    "client-adapters",
                    "components",
                    "infrastructure",
                    "lib",
                    "pages",
                    "shared",
                  ],
                },
              },
            },
            {
              from: { type: "application" },
              disallow: {
                to: {
                  type: [
                    "client-adapters",
                    "components",
                    "infrastructure",
                    "lib",
                    "pages",
                    "shared",
                  ],
                },
              },
            },
            {
              from: { type: "components" },
              disallow: {
                to: {
                  type: [
                    "application",
                    "client-adapters",
                    "domain",
                    "infrastructure",
                    "pages",
                  ],
                },
              },
            },
            {
              from: { type: "pages" },
              disallow: { to: { type: ["domain", "lib"] } },
            },
            {
              from: { type: "infrastructure" },
              disallow: {
                to: { type: ["client-adapters", "components", "lib", "pages"] },
              },
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
        { mode: "full", pattern: "src/hooks/*", type: "hooks" },
        { mode: "full", pattern: "src/hooks/**/*", type: "hooks" },
        { mode: "full", pattern: "src/lib/**/*api*", type: "client-adapters" },
        {
          mode: "full",
          pattern: "src/lib/**/*client*",
          type: "client-adapters",
        },
        {
          mode: "full",
          pattern: "src/lib/**/*adapter*",
          type: "client-adapters",
        },
        { mode: "full", pattern: "src/lib/*", type: "lib" },
        { mode: "full", pattern: "src/lib/**/*", type: "lib" },
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
        { mode: "full", pattern: "src/modules/*/shared/*", type: "shared" },
        {
          mode: "full",
          pattern: "src/modules/*/shared/**/*",
          type: "shared",
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
