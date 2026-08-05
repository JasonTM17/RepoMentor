import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const sharedConfig = [
  {
    ignores: [
      ".agentkit/**",
      ".claude/**",
      ".next/**",
      ".turbo/**",
      "coverage/**",
      "dist/**",
      "engineer/**",
      "node_modules/**",
      "plans/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];

export default sharedConfig;
