import eslint from "@eslint/js";

export default [
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
];
