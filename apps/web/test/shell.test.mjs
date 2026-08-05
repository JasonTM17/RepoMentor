import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import typescript from "typescript";

/*
 * This is a structural smoke gate: it reads tracked shell source files directly
 * to catch accessibility and responsive contract regressions without a browser.
 * Browser E2E coverage belongs to Phase 12.
 */

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readTrackedSource = (relativePath) => readFileSync(resolve(webRoot, relativePath), "utf8");

const source = Object.freeze({
  layout: readTrackedSource("app/layout.tsx"),
  page: readTrackedSource("app/page.tsx"),
  error: readTrackedSource("app/error.tsx"),
  loading: readTrackedSource("app/loading.tsx"),
  notFound: readTrackedSource("app/not-found.tsx"),
  styles: readTrackedSource("app/globals.css"),
  icons: readTrackedSource("components/line-icon.tsx"),
  preview: readTrackedSource("components/review-preview.tsx"),
  login: readTrackedSource("app/login/page.tsx"),
  register: readTrackedSource("app/register/page.tsx"),
  authPage: readTrackedSource("features/auth/components/AuthPage.tsx"),
  authField: readTrackedSource("features/auth/components/AuthField.tsx"),
  passwordField: readTrackedSource("features/auth/components/PasswordField.tsx"),
  authClient: readTrackedSource("features/auth/api/authClient.ts"),
  authHook: readTrackedSource("features/auth/hooks/useAuthForm.ts"),
  authTypes: readTrackedSource("features/auth/types/index.ts"),
  validation: readTrackedSource("features/auth/helpers/validation.ts"),
});

const authClientRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.authClient, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const createJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const validLoginData = Object.freeze({
  accessToken: "t",
  tokenType: "Bearer",
  expiresInSeconds: 900,
  user: Object.freeze({
    id: "user-1",
    email: "user@example.com",
    displayName: "Test User",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
});

const authRequest = Object.freeze({ email: "user@example.com", password: "x" });

const shellTsxSources = Object.freeze({
  "app/layout.tsx": source.layout,
  "app/page.tsx": source.page,
  "app/error.tsx": source.error,
  "app/loading.tsx": source.loading,
  "app/not-found.tsx": source.notFound,
  "components/review-preview.tsx": source.preview,
});

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const visibleSpanPattern = (className, label) => {
  const classPattern = escapeRegExp(className);
  const labelPattern = label.trim().split(/\s+/u).map(escapeRegExp).join("\\s+");

  return new RegExp(
    `<span\\b[^>]*className\\s*=\\s*["'][^"']*\\b${classPattern}\\b[^"']*["'][^>]*>\\s*${labelPattern}\\s*<\\/span>`,
    "su",
  );
};

const extractBalancedBlock = (text, marker, description) => {
  const markerMatch = text.match(marker);
  assert.ok(markerMatch, `Missing ${description}.`);

  const openingBrace = text.indexOf("{", markerMatch.index);
  assert.notEqual(openingBrace, -1, `Missing opening brace for ${description}.`);

  let depth = 0;

  for (let index = openingBrace; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(openingBrace + 1, index);
      }
    }
  }

  assert.fail(`Unclosed CSS block for ${description}.`);
};

test("shell exposes an accessible skip link and main landmark", () => {
  const skipLink = source.layout.match(/<a\b[^>]*className\s*=\s*["']skip-link["'][^>]*>/su);

  assert.ok(skipLink, "The shell must provide a skip link.");
  assert.match(skipLink[0], /\bhref\s*=\s*["']#main-content["']/u);
  assert.match(
    source.layout,
    /<a\b[^>]*className\s*=\s*["']skip-link["'][^>]*>\s*Skip\s+to\s+main\s+content\s*<\/a>/su,
    "The skip link must expose its visible purpose.",
  );
  assert.match(
    source.page,
    /<main\b[^>]*\bid\s*=\s*["']main-content["'][^>]*>/su,
    "The home page must expose the skip-link destination as its main landmark.",
  );
});

test("fragment anchors never claim the current page", () => {
  const fragmentAnchors = [];

  for (const [filePath, text] of Object.entries(shellTsxSources)) {
    for (const match of text.matchAll(/<a\b[^>]*>/gsu)) {
      if (/\bhref\s*=\s*["'][^"']*#[^"']*["']/su.test(match[0])) {
        fragmentAnchors.push(`${filePath}: ${match[0]}`);
      }
    }
  }

  assert.ok(fragmentAnchors.length > 0, "Expected at least one shell fragment anchor.");

  for (const anchor of fragmentAnchors) {
    assert.doesNotMatch(
      anchor,
      /\baria-current\s*=\s*(?:["']page["']|\{\s*["']page["']\s*\})/iu,
      `Fragment anchors must not use aria-current=page: ${anchor}`,
    );
  }
});

test("static shell states keep their honest visible labels", () => {
  assert.match(
    source.preview,
    visibleSpanPattern("status-label", "Static preview"),
    "The review preview must identify itself as static.",
  );
  assert.match(
    source.page,
    visibleSpanPattern("status-label", "No reviews yet"),
    "The empty review state must say that no reviews exist yet.",
  );
  assert.match(
    source.preview,
    visibleSpanPattern("review-file-status", "No repository connected"),
    "The preview must not imply that a repository is connected.",
  );
});

test("shell CSS preserves focus-visible and reduced-motion contracts", () => {
  const focusBlock = extractBalancedBlock(
    source.styles,
    /:where\s*\(\s*a\s*,\s*button\s*\)\s*:\s*focus-visible\s*/u,
    "focus-visible styles",
  );
  const reducedMotionBlock = extractBalancedBlock(
    source.styles,
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*/u,
    "reduced-motion styles",
  );

  assert.match(focusBlock, /\boutline\s*:/u);
  assert.match(focusBlock, /\boutline-offset\s*:/u);
  assert.match(reducedMotionBlock, /\bscroll-behavior\s*:\s*auto\s*;/u);
  assert.match(reducedMotionBlock, /\btransition-duration\s*:\s*0\.01ms\s*!important\s*;/u);
});

test("375px responsive shell hides primary nav and preserves a compact CTA", () => {
  const mobileShellBlock = extractBalancedBlock(
    source.styles,
    /@media\s*\(\s*max-width\s*:\s*47\.999rem\s*\)\s*/u,
    "mobile shell styles",
  );
  const compactHeaderBlock = extractBalancedBlock(
    source.styles,
    /@media\s*\(\s*max-width\s*:\s*30rem\s*\)\s*/u,
    "compact header styles",
  );

  assert.match(mobileShellBlock, /\.primary-nav\s*\{[^{}]*\bdisplay\s*:\s*none\s*;/su);
  assert.match(mobileShellBlock, /\.header-action\s*\{[^{}]*\bdisplay\s*:\s*inline-flex\s*;/su);
  assert.match(
    compactHeaderBlock,
    /\.header-action-label-full\s*\{[^{}]*\bdisplay\s*:\s*none\s*;/su,
  );
  assert.match(
    compactHeaderBlock,
    /\.header-action-label-compact\s*\{[^{}]*\bdisplay\s*:\s*inline\s*;/su,
  );
  assert.doesNotMatch(
    source.styles,
    /\boverflow-x\s*:\s*hidden\b/iu,
    "The mobile shell must not conceal horizontal overflow as a layout workaround.",
  );
});

test("shell icons use the single decorative LineIcon component", () => {
  const svgTags = [...source.icons.matchAll(/<svg\b[^>]*>/gsu)];

  assert.equal(svgTags.length, 1, "LineIcon should be the shell's only SVG implementation.");
  assert.match(svgTags[0][0], /\baria-hidden\s*=\s*["']true["']/u);

  for (const [filePath, text] of Object.entries(shellTsxSources)) {
    assert.doesNotMatch(
      text,
      /<svg\b/iu,
      `${filePath} must not add a second inline SVG implementation.`,
    );

    if (/<LineIcon\b/u.test(text)) {
      assert.match(
        text,
        /import\s+LineIcon[\s\S]*?from\s*["']@\/components\/line-icon["']/su,
        `${filePath} must use the shared LineIcon component.`,
      );
    }
  }
});

test("visible shell copy contains no em dash", () => {
  for (const [filePath, text] of Object.entries(shellTsxSources)) {
    assert.doesNotMatch(text, /—/u, `${filePath} contains an em dash in shell copy.`);
  }
});

test("auth routes expose the intended mode and API endpoint seam", () => {
  assert.match(source.login, /<AuthPage\s+mode="login"\s*\/>/u);
  assert.match(source.register, /<AuthPage\s+mode="register"\s*\/>/u);
  assert.match(source.authPage, /apiPath:\s*"POST \/api\/v1\/auth\/login"/u);
  assert.match(source.authPage, /apiPath:\s*"POST \/api\/v1\/auth\/register"/u);
  assert.match(source.authPage, /data-api-endpoint=\{copy\.apiPath\}/u);
  assert.match(source.authClient, /credentials:\s*"include"/u);
  assert.match(source.authClient, /validates the response envelope/u);
  assert.match(source.authClient, /\/api\/v1\/auth\/\$\{endpoint\}/u);
  assert.doesNotMatch(source.authClient, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source.authClient, /never writes access or refresh tokens to browser storage/u);
});

test("auth client matches the integrated response envelopes and token boundary", () => {
  assert.match(source.authTypes, /interface RegisterResponse[\s\S]*accepted:\s*true/u);
  assert.match(
    source.authTypes,
    /interface LoginResponse[\s\S]*accessToken:\s*string[\s\S]*tokenType:\s*"Bearer"[\s\S]*expiresInSeconds:\s*number[\s\S]*user:\s*AuthUser/u,
  );
  assert.match(source.authTypes, /status:\s*AuthUserStatus/u);
  assert.match(source.authTypes, /createdAt:\s*string/u);
  assert.match(source.authTypes, /updatedAt:\s*string/u);
  assert.match(
    source.authClient,
    /postAuth\("register",\s*payload,\s*202,\s*isRegisterResponse\)/u,
  );
  assert.match(source.authClient, /postAuth\("login",\s*payload,\s*201,\s*isLoginResponse\)/u);
  assert.match(source.authClient, /response\.status\s*!==\s*expectedStatus/u);
  assert.match(source.authClient, /hasOwn\(value,\s*"data"\)/u);
  assert.match(source.authClient, /const isApiMeta/u);
  assert.match(source.authClient, /const isSuccessEnvelope/u);
  assert.match(
    source.authClient,
    /hasOnlyKeys\(value,\s*\["requestId",\s*"page",\s*"pageSize",\s*"total"\]\)/u,
  );
  assert.match(source.authClient, /hasOnlyKeys\(value,\s*\["data",\s*"meta"\]\)/u);
  assert.match(source.authClient, /isApiMeta\(value\.meta\)/u);
  assert.match(source.authClient, /value\.pageSize\s*<=\s*maxPageSize/u);
  assert.match(source.authClient, /value\.total\s*>=\s*0/u);
  assert.match(source.authClient, /hasExactKeys\(value,\s*\[\s*"accessToken"/u);
  assert.match(source.authClient, /hasExactKeys\(value,\s*\["accepted"\]\)/u);
  assert.match(source.authClient, /!parseData\(body\.data\)/u);
  assert.match(source.authClient, /value\.tokenType\s*===\s*"Bearer"/u);
  assert.match(source.authClient, /Number\.isInteger\(value\.expiresInSeconds\)/u);
  assert.match(source.authClient, /value\.expiresInSeconds\s*<=\s*3_600/u);
  assert.match(source.authClient, /!hasOwn\(value,\s*"refreshToken"\)/u);
  assert.doesNotMatch(source.authClient, /as\s+TResponse/u);
  assert.doesNotMatch(source.authTypes, /refreshToken/u);
  assert.doesNotMatch(source.authClient, /localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(source.authHook, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source.authHook, /Registration does not sign you in automatically\./u);
  assert.match(source.authPage, /does not write access or\s+refresh tokens to browser storage/u);
});

test("auth client accepts valid metadata and rejects extra envelope keys at runtime", async () => {
  const { authClient, AuthClientError } = await authClientRuntime;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      createJsonResponse(201, {
        data: validLoginData,
        meta: { requestId: "request-1", page: 1, pageSize: 20, total: 1 },
      });

    await assert.doesNotReject(() => authClient.login(authRequest));

    globalThis.fetch = async () =>
      createJsonResponse(201, { data: validLoginData, trace: "unexpected" });

    await assert.rejects(
      () => authClient.login(authRequest),
      (error) => error instanceof AuthClientError && error.status === 201,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auth client rejects invalid success metadata at runtime", async () => {
  const { authClient, AuthClientError } = await authClientRuntime;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      createJsonResponse(201, { data: validLoginData, meta: { page: 0, unknown: true } });

    await assert.rejects(
      () => authClient.login(authRequest),
      (error) => error instanceof AuthClientError && error.status === 201,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auth form fields keep labels, descriptions, errors, and password controls associated", () => {
  assert.match(source.authField, /<label[^>]+htmlFor=\{fieldId\}/u);
  assert.match(source.authField, /aria-describedby=\{describedBy\}/u);
  assert.match(source.authField, /aria-invalid=\{error \? true : undefined\}/u);
  assert.match(source.authField, /role="alert"/u);
  assert.match(source.passwordField, /aria-controls=\{fieldId\}/u);
  assert.match(source.passwordField, /aria-pressed=\{isVisible\}/u);
  assert.match(source.passwordField, /type="button"/u);
  assert.match(source.authPage, /name="displayName"/u);
  assert.match(source.authPage, /name="email"/u);
  assert.match(source.authPage, /name="password"/u);
  assert.match(source.authPage, /name="passwordConfirmation"/u);
  assert.match(source.authPage, /<form[\s\S]*noValidate/u);
  assert.match(source.authPage, /aria-describedby="auth-api-note"/u);
});

test("auth form keeps validation and network states safe and visible", () => {
  assert.match(source.validation, /Passwords must match\./u);
  assert.match(source.validation, /Use at least/u);
  assert.match(source.authPage, /status === "error"/u);
  assert.match(source.authPage, /status === "success"/u);
  assert.match(source.authHook, /setStatus\("loading"\)/u);
  assert.match(source.authHook, /setStatus\("error"\)/u);
  assert.match(source.authPage, /aria-busy=\{isSubmitting\}/u);
  assert.match(source.authPage, /disabled=\{fieldsDisabled\}/u);
  assert.match(source.authPage, /role="alert"/u);
  assert.match(source.authPage, /role="status"/u);
  assert.match(
    source.authClient,
    /Authentication request failed\./u,
    "The client must keep low-level API failures out of visible form copy.",
  );
  assert.match(
    source.authTypes,
    /We could not complete that request\. Check your details and try again\./u,
    "The form must use generic safe error copy.",
  );
});

test("auth password validation matches the shared 12-character policy", () => {
  const minimumLengthMatch = source.validation.match(
    /const\s+minimumPasswordLength\s*=\s*(\d+)\s*;/u,
  );

  assert.ok(minimumLengthMatch, "The auth validator must declare a password minimum.");
  const minimumLength = Number(minimumLengthMatch[1]);

  assert.equal(minimumLength, 12);
  assert.match(source.validation, /value\.length\s*<\s*minimumPasswordLength/u);
  assert.equal("x".repeat(11).length < minimumLength, true, "11 characters must be rejected.");
  assert.equal("x".repeat(12).length < minimumLength, false, "12 characters must be accepted.");
  assert.match(source.authPage, /Use at least 12 characters for your account\./u);
});

test("auth CSS preserves 44px controls, focus-visible states, and narrow composition", () => {
  assert.match(source.styles, /\.auth-input(?:,|\s*\{)[\s\S]*min-height:\s*var\(--touch-target\)/u);
  assert.match(
    source.styles,
    /\.auth-password-toggle\s*\{[\s\S]*min-height:\s*var\(--touch-target\)/u,
  );
  assert.match(source.styles, /\.auth-input:focus-visible\s*\{[\s\S]*outline:/u);
  assert.match(source.styles, /\.auth-password-toggle:focus-visible\s*\{[\s\S]*outline:/u);
  assert.match(source.styles, /\.auth-layout\s*\{[\s\S]*grid-template-columns:/u);
  assert.match(source.styles, /@media\s*\(max-width:\s*62rem\)[\s\S]*\.auth-layout/u);
  assert.match(source.styles, /@media\s*\(max-width:\s*30rem\)[\s\S]*\.auth-panel/u);
  assert.doesNotMatch(source.styles, /transition:\s*all/u);
  assert.doesNotMatch(source.styles, /overflow-x:\s*hidden/u);
});

test("auth source contains no emoji or em dash in visible UI copy", () => {
  const authSources = [
    source.login,
    source.register,
    source.authPage,
    source.authField,
    source.passwordField,
  ];

  for (const authSource of authSources) {
    assert.doesNotMatch(authSource, /—/u);
    assert.doesNotMatch(authSource, /[\u{1F300}-\u{1FAFF}]/u);
  }
});
