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
  authSessionAction: readTrackedSource("features/auth/components/AuthSessionAction.tsx"),
  authField: readTrackedSource("features/auth/components/AuthField.tsx"),
  passwordField: readTrackedSource("features/auth/components/PasswordField.tsx"),
  authClient: readTrackedSource("features/auth/api/authClient.ts"),
  authSession: readTrackedSource("features/auth/authSession.tsx"),
  authHook: readTrackedSource("features/auth/hooks/useAuthForm.ts"),
  authTypes: readTrackedSource("features/auth/types/index.ts"),
  validation: readTrackedSource("features/auth/helpers/validation.ts"),
  reviewPage: readTrackedSource("app/reviews/new/page.tsx"),
  reviewWorkspace: readTrackedSource("features/review/components/ReviewWorkspace.tsx"),
  reviewSourceEditor: readTrackedSource("features/review/components/ReviewSourceEditor.tsx"),
  reviewResultPanel: readTrackedSource("features/review/components/ReviewResultPanel.tsx"),
  reviewResultActions: readTrackedSource("features/review/components/ReviewResultActions.tsx"),
  reviewOptionalViews: readTrackedSource(
    "features/review/components/ReviewOptionalResultViews.tsx",
  ),
  reviewExports: readTrackedSource("features/review/helpers/reviewExports.ts"),
  reviewApi: readTrackedSource("features/review/api/reviewApi.ts"),
  reviewDemoTransport: readTrackedSource("features/review/api/demoReviewTransport.ts"),
  reviewHelpers: readTrackedSource("features/review/helpers/reviewHelpers.ts"),
  reviewHook: readTrackedSource("features/review/hooks/useReviewWorkspace.ts"),
  reviewPolling: readTrackedSource("features/review/helpers/reviewPolling.ts"),
  reviewTypes: readTrackedSource("features/review/types/index.ts"),
  dashboardPage: readTrackedSource("app/dashboard/page.tsx"),
  historyPage: readTrackedSource("app/history/page.tsx"),
  usagePage: readTrackedSource("app/usage/page.tsx"),
  usageDashboard: readTrackedSource("features/usage/components/UsageDashboard.tsx"),
  usageHistory: readTrackedSource("features/usage/components/UsageHistory.tsx"),
  usageOverview: readTrackedSource("features/usage/components/UsageOverview.tsx"),
  usageTransport: readTrackedSource("features/usage/hooks/useUsageTransport.ts"),
  usageQuotaGrid: readTrackedSource("features/usage/components/UsageQuotaGrid.tsx"),
  usageSourceNote: readTrackedSource("features/usage/components/UsageSourceNote.tsx"),
  usageStatePanel: readTrackedSource("features/usage/components/UsageStatePanel.tsx"),
  usageApi: readTrackedSource("features/usage/api/usageApi.ts"),
  demoUsageTransport: readTrackedSource("features/usage/api/demoUsageTransport.ts"),
  usageHelpers: readTrackedSource("features/usage/helpers/usageHelpers.ts"),
  usageTypes: readTrackedSource("features/usage/types/index.ts"),
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

const reviewApiRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.reviewApi, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const reviewPollingRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.reviewPolling, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const reviewHelpersRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.reviewHelpers, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const reviewExportsRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.reviewExports, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const usageApiRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.usageApi, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const demoUsageRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.demoUsageTransport, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText,
  )}`
);

const usageHelpersRuntime = import(
  `data:text/javascript,${encodeURIComponent(
    typescript.transpileModule(source.usageHelpers, {
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

const createStreamResponse = (
  chunks,
  status = 200,
  contentType = "text/event-stream; charset=utf-8",
) => {
  let index = 0;
  let cancelled = false;

  return {
    body: {
      getReader: () => ({
        cancel: async () => {
          cancelled = true;
        },
        read: async () => {
          if (index < chunks.length) {
            const value = new globalThis.TextEncoder().encode(chunks[index]);
            index += 1;
            return { done: false, value };
          }

          return { done: true, value: undefined };
        },
      }),
    },
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    ok: status >= 200 && status < 300,
    status,
    get cancelled() {
      return cancelled;
    },
  };
};

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

const createReviewResultResponse = () => ({
  execution: {
    attempts: 1,
    completedAt: "2026-08-06T00:00:00.000Z",
    durationMs: 12,
    model: "gpt-5.6-luna",
    provider: "luna",
    reasoningEffort: "max",
    usage: {
      cachedInputTokens: 4,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  },
  id: "review-1",
  result: {
    education: {
      diff: "@@ -1 +1 @@\n-const answer = 41;\n+const answer = 42;",
      generatedTests: ['test("answer", () => assert.equal(answer, 42));'],
      improvedSource: "const answer = 42;",
      learningQuestions: ["Which invariant makes this value safe to change?"],
    },
    findings: [],
    schemaVersion: "v1",
    summary: "The fixture is valid.",
  },
  status: "COMPLETED",
});

const shellTsxSources = Object.freeze({
  "app/layout.tsx": source.layout,
  "app/page.tsx": source.page,
  "app/error.tsx": source.error,
  "app/loading.tsx": source.loading,
  "app/not-found.tsx": source.notFound,
  "components/review-preview.tsx": source.preview,
  "features/auth/components/AuthSessionAction.tsx": source.authSessionAction,
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
  assert.match(source.layout, /<AuthSessionAction\s*\/>/u);
  assert.match(source.authSessionAction, /authClient\.logout\(\)/u);
  assert.match(source.authSessionAction, /aria-busy=\{status === "loading"\}/u);
  assert.match(source.authSessionAction, /role="alert"/u);
  assert.match(source.authClient, /credentials:\s*"include"/u);
  assert.match(source.authClient, /validates the response envelope/u);
  assert.match(source.authClient, /\/api\/v1\/auth\/\$\{endpoint\}/u);
  assert.doesNotMatch(source.authClient, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source.authClient, /never writes access or refresh tokens to browser storage/u);
  assert.match(source.authClient, /setAccessToken\(response\.accessToken\)/u);
  assert.match(source.authClient, /refreshAccessToken/u);
  assert.match(source.authClient, /\/api\/v1\/auth\/refresh/u);
  assert.match(source.authSession, /useSyncExternalStore/u);
  assert.match(source.authSession, /subscribeAuthSession/u);
});

test("auth client matches the integrated response envelopes and token boundary", () => {
  assert.match(source.authTypes, /interface RegisterResponse[\s\S]*accepted:\s*true/u);
  assert.match(source.authTypes, /interface LogoutResponse[\s\S]*loggedOut:\s*true/u);
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
  assert.match(source.authClient, /hasExactKeys\(value,\s*\["loggedOut"\]\)/u);
  assert.match(source.authClient, /!parseData\(body\.data\)/u);
  assert.match(source.authClient, /value\.tokenType\s*===\s*"Bearer"/u);
  assert.match(source.authClient, /Number\.isInteger\(value\.expiresInSeconds\)/u);
  assert.match(source.authClient, /value\.expiresInSeconds\s*<=\s*3_600/u);
  assert.match(source.authClient, /!hasOwn\(value,\s*"refreshToken"\)/u);
  assert.doesNotMatch(source.authClient, /as\s+TResponse/u);
  assert.doesNotMatch(source.authTypes, /refreshToken/u);
  assert.doesNotMatch(source.authClient, /localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(source.authHook, /localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(source.authSession, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source.authHook, /Registration does not sign you in automatically\./u);
  assert.match(source.authPage, /does not write access or\s+refresh tokens to browser storage/u);
});

test("auth client restores one memory-only session through the refresh cookie boundary", async () => {
  const { clearAccessToken, getAccessToken, refreshAccessToken } = await authClientRuntime;
  const originalFetch = globalThis.fetch;
  let request;

  try {
    clearAccessToken();
    globalThis.fetch = async (url, init) => {
      request = { init, url };
      return createJsonResponse(201, { data: validLoginData });
    };

    await refreshAccessToken();

    assert.equal(getAccessToken(), validLoginData.accessToken);
    assert.equal(request.url, "/api/v1/auth/refresh");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.credentials, "include");
  } finally {
    clearAccessToken();
    globalThis.fetch = originalFetch;
  }
});

test("auth client accepts valid metadata and rejects extra envelope keys at runtime", async () => {
  const { authClient, AuthClientError, clearAccessToken, getAccessToken } = await authClientRuntime;
  const originalFetch = globalThis.fetch;

  try {
    clearAccessToken();
    globalThis.fetch = async () =>
      createJsonResponse(201, {
        data: validLoginData,
        meta: { requestId: "request-1", page: 1, pageSize: 20, total: 1 },
      });

    await assert.doesNotReject(() => authClient.login(authRequest));
    assert.equal(getAccessToken(), validLoginData.accessToken);

    globalThis.fetch = async () =>
      createJsonResponse(201, { data: validLoginData, trace: "unexpected" });

    await assert.rejects(
      () => authClient.login(authRequest),
      (error) => error instanceof AuthClientError && error.status === 201,
    );
  } finally {
    clearAccessToken();
    globalThis.fetch = originalFetch;
  }
});

test("auth client logs out through the refresh-cookie boundary and clears memory", async () => {
  const { authClient, AuthClientError, clearAccessToken, getAccessToken, setAccessToken } =
    await authClientRuntime;
  const originalFetch = globalThis.fetch;
  let request;

  try {
    clearAccessToken();
    setAccessToken(validLoginData.accessToken);
    globalThis.fetch = async (url, init) => {
      request = { init, url };
      return createJsonResponse(201, { data: { loggedOut: true } });
    };

    await assert.deepEqual(await authClient.logout(), { loggedOut: true });
    assert.equal(request.url, "/api/v1/auth/logout");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.credentials, "include");
    assert.equal(request.init.headers, undefined);
    assert.equal(getAccessToken(), undefined);

    setAccessToken(validLoginData.accessToken);
    globalThis.fetch = async () =>
      createJsonResponse(201, { data: { loggedOut: true, unexpected: true } });
    await assert.rejects(
      () => authClient.logout(),
      (error) => error instanceof AuthClientError && error.status === 201,
    );
    assert.equal(getAccessToken(), validLoginData.accessToken);
  } finally {
    clearAccessToken();
    globalThis.fetch = originalFetch;
  }
});

test("auth client rejects invalid success metadata at runtime", async () => {
  const { authClient, AuthClientError, clearAccessToken } = await authClientRuntime;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      createJsonResponse(201, { data: validLoginData, meta: { page: 0, unknown: true } });

    await assert.rejects(
      () => authClient.login(authRequest),
      (error) => error instanceof AuthClientError && error.status === 201,
    );
  } finally {
    clearAccessToken();
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

test("review route exposes an operable editor and honest transport label", () => {
  assert.match(source.reviewPage, /<ReviewWorkspace\s*\/>/u);
  assert.match(source.reviewWorkspace, /<main\s+id="main-content"/u);
  assert.match(source.reviewWorkspace, /<ReviewSourceEditor[\s\S]*value=\{draft\.source\}/u);
  assert.match(source.reviewWorkspace, /name="title"/u);
  assert.match(source.reviewWorkspace, /name="context"/u);
  assert.match(source.reviewWorkspace, /value=\{draft\.language\}/u);
  assert.match(source.reviewWorkspace, /value=\{draft\.learnerLevel\}/u);
  assert.match(source.reviewWorkspace, /value=\{draft\.mode\}/u);
  assert.match(source.reviewWorkspace, /Start demo review/u);
  assert.match(source.reviewWorkspace, /Start API review/u);
  assert.match(source.reviewWorkspace, /Cancel run/u);
  assert.match(source.reviewWorkspace, /data-transport-mode=\{transportMode\}/u);
  assert.match(source.reviewWorkspace, /Authenticated API transport active\./u);
  assert.match(source.reviewWorkspace, /Sign in to use the authenticated API bridge\./u);
  assert.match(source.reviewWorkspace, /server-owned review/u);
  assert.match(source.reviewWorkspace, /does not save review data/u);
});

test("review source input uses a real SSR-safe Monaco seam with accessible states", () => {
  assert.match(source.reviewSourceEditor, /dynamic<EditorProps>/u);
  assert.match(source.reviewSourceEditor, /ssr:\s*false/u);
  assert.match(source.reviewSourceEditor, /data-editor-engine="monaco"/u);
  assert.match(source.reviewSourceEditor, /ariaLabel:\s*"Source code to review"/u);
  assert.match(source.reviewSourceEditor, /"aria-describedby": describedBy/u);
  assert.match(source.reviewSourceEditor, /role:\s*"textbox"/u);
  assert.match(source.reviewSourceEditor, /MonacoLoadingState/u);
  assert.match(source.reviewSourceEditor, /MonacoUnavailableState/u);
  assert.match(source.reviewSourceEditor, /ReviewSourceTextareaFallback/u);
  assert.match(source.reviewSourceEditor, /data-editor-fallback="textarea"/u);
  assert.match(source.reviewSourceEditor, /<textarea\b/u);
  assert.match(source.reviewSourceEditor, /aria-describedby=\{describedBy\}/u);
  assert.match(source.reviewSourceEditor, /aria-labelledby=\{labelId\}/u);
  assert.match(source.reviewSourceEditor, /aria-invalid=\{invalid \? "true" : undefined\}/u);
  assert.match(source.reviewSourceEditor, /disabled=\{disabled\}/u);
  assert.match(
    source.reviewSourceEditor,
    /onChange=\{\(event\) =>[\s\S]*TextareaValueTarget[\s\S]*\.value\)\}/u,
  );
  assert.match(source.reviewSourceEditor, /value=\{value\}/u);
  assert.match(source.reviewSourceEditor, /required/u);
  assert.match(source.reviewWorkspace, /review-source-hint review-source-metrics/u);
  assert.match(source.reviewWorkspace, /review-source-error/u);
});

test("review editor maps the complete language set to Monaco identifiers", async () => {
  const { getMonacoLanguage } = await reviewHelpersRuntime;
  const languageMap = {
    csharp: "csharp",
    cpp: "cpp",
    go: "go",
    java: "java",
    javascript: "javascript",
    other: "plaintext",
    python: "python",
    rust: "rust",
    sql: "sql",
    typescript: "typescript",
  };

  for (const [reviewLanguage, monacoLanguage] of Object.entries(languageMap)) {
    assert.equal(getMonacoLanguage(reviewLanguage), monacoLanguage);
  }
});

test("review transport preserves the accepted process and result endpoints", () => {
  assert.match(source.reviewApi, /\/api\/v1\/reviews["`]/u);
  assert.match(source.reviewApi, /Idempotency-Key/u);
  assert.match(source.reviewApi, /JSON\.stringify\(\{[\s\S]*draft\.language/u);
  assert.match(source.reviewApi, /isReviewAdmissionResponse/u);
  assert.match(source.reviewApi, /isReviewCancelResponse/u);
  assert.match(
    source.reviewApi,
    /\/api\/v1\/reviews\/\$\{encodeURIComponent\(reviewId\)\}\/process/u,
  );
  assert.match(
    source.reviewApi,
    /\/api\/v1\/reviews\/\$\{encodeURIComponent\(reviewId\)\}\/result/u,
  );
  assert.match(source.reviewApi, /method:\s*"POST"/u);
  assert.match(source.reviewApi, /body:\s*"\{\}"/u);
  assert.match(source.reviewApi, /credentials:\s*"include"/u);
  assert.match(source.reviewApi, /isReviewProcessResponse/u);
  assert.match(source.reviewApi, /isReviewResultResponse/u);
  assert.match(source.reviewApi, /ReviewApiError/u);
  assert.doesNotMatch(source.reviewApi, /DEEPSEEK|api[_-]?key|secret/iu);
});

test("review API admission uses a bounded idempotency key and forwards draft metadata", async () => {
  const { createReviewApiTransport } = await reviewApiRuntime;
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const admission = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "review-created-1",
    language: "typescript",
    learnerLevel: "ADVANCED",
    mode: "STANDARD",
    title: "Boundary review",
    context: "Keep the review grounded in the source.",
    status: "PENDING",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  try {
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ init, url });
      return createJsonResponse(201, { data: admission });
    };

    const transport = createReviewApiTransport({
      apiOrigin: "https://api.example.test",
      getAccessToken: () => "access-token-fixture",
    });
    assert.ok(transport.create);
    const created = await transport.create({
      context: "Keep the review grounded in the source.",
      language: "typescript",
      learnerLevel: "advanced",
      mode: "STANDARD",
      source: "const answer = 42;",
      title: "Boundary review",
    });

    assert.deepEqual(created, admission);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://api.example.test/api/v1/reviews");
    assert.equal(fetchCalls[0].init.method, "POST");
    assert.equal(fetchCalls[0].init.credentials, "include");
    assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer access-token-fixture");
    assert.match(fetchCalls[0].init.headers["Idempotency-Key"], /^web-review-[A-Za-z0-9-]+$/u);
    assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
      context: "Keep the review grounded in the source.",
      language: "typescript",
      learnerLevel: "ADVANCED",
      mode: "STANDARD",
      source: "const answer = 42;",
      title: "Boundary review",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review API admission rejects missing or blank metadata in the response", async () => {
  const { ReviewApiError, createReviewApiTransport } = await reviewApiRuntime;
  const originalFetch = globalThis.fetch;
  const base = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "review-created-1",
    language: "typescript",
    mode: "STANDARD",
    status: "PENDING",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const draft = {
    context: "Context",
    language: "typescript",
    learnerLevel: "intermediate",
    mode: "STANDARD",
    source: "const answer = 42;",
    title: "Title",
  };

  try {
    const transport = createReviewApiTransport({ apiOrigin: "https://api.example.test" });
    assert.ok(transport.create);

    for (const response of [
      { data: base },
      { data: { ...base, learnerLevel: "INTERMEDIATE", title: " " } },
    ]) {
      globalThis.fetch = async () => createJsonResponse(201, response);
      await assert.rejects(
        () => transport.create(draft),
        (error) => error instanceof ReviewApiError && error.status === 201,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review API cancellation is authenticated, source-free, and status-strict", async () => {
  const { ReviewApiError, createReviewApiTransport } = await reviewApiRuntime;
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const cancellation = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "review-cancel-1",
    language: "typescript",
    learnerLevel: "INTERMEDIATE",
    mode: "STANDARD",
    status: "CANCELLED",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  try {
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ init, url });
      return createJsonResponse(201, { data: cancellation });
    };

    const transport = createReviewApiTransport({
      apiOrigin: "https://api.example.test",
      getAccessToken: () => "access-token-fixture",
    });
    assert.ok(transport.cancel);
    const cancelled = await transport.cancel("review/1");

    assert.deepEqual(cancelled, cancellation);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://api.example.test/api/v1/reviews/review%2F1/cancel");
    assert.equal(fetchCalls[0].init.method, "POST");
    assert.equal(fetchCalls[0].init.credentials, "include");
    assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer access-token-fixture");
    assert.equal(fetchCalls[0].init.body, undefined);

    globalThis.fetch = async () =>
      createJsonResponse(201, {
        data: { ...cancellation, status: "PROCESSING" },
      });
    await assert.rejects(
      () => transport.cancel("review-1"),
      (error) => error instanceof ReviewApiError && error.status === 201,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review lifecycle transport uses authenticated fetch SSE without query credentials", async () => {
  assert.match(source.reviewApi, /getReader\(\)/u);
  assert.match(source.reviewApi, /text\/event-stream/u);
  assert.match(source.reviewApi, /Last-Event-ID/u);
  assert.match(source.reviewApi, /Authorization/u);
  assert.doesNotMatch(source.reviewApi, /EventSource/u);
  assert.doesNotMatch(source.reviewApi, /events\?[^`]*token/iu);
  assert.match(source.reviewHook, /transport\.stream/u);
  assert.match(source.reviewHook, /transport\.cancel/u);
  assert.match(source.reviewHook, /requestActiveCancellation/u);
  assert.match(source.reviewHook, /transport\.create/u);
  assert.match(source.reviewHook, /const reviewId =/u);
  assert.match(source.reviewHook, /getReviewResultWithPolling/u);
  assert.match(source.reviewHook, /AbortController/u);

  const { ReviewApiError, createReviewApiTransport } = await reviewApiRuntime;
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const snapshot = {
    generation: 0,
    id: "1",
    replay: "current",
    resultAvailable: false,
    reviewId: "review-1",
    schemaVersion: "v1",
    status: "PENDING",
    type: "snapshot",
  };
  const heartbeat = {
    generation: 0,
    id: "1",
    resultAvailable: false,
    reviewId: "review-1",
    schemaVersion: "v1",
    status: "PENDING",
    type: "heartbeat",
  };
  const completed = {
    generation: 1,
    id: "2",
    resultAvailable: true,
    reviewId: "review-1",
    schemaVersion: "v1",
    status: "COMPLETED",
    type: "completed",
  };
  const frame = (event) =>
    `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

  try {
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ init, url });
      return createStreamResponse([
        `${frame(snapshot)}${frame(heartbeat)}`.slice(0, 180),
        `${frame(snapshot)}${frame(heartbeat)}`.slice(180) + frame(completed),
      ]);
    };

    const events = [];
    const transport = createReviewApiTransport({
      apiOrigin: "https://api.example.test",
      getAccessToken: () => "access-token-fixture",
    });
    const outcome = await transport.stream("review/1", {
      lastEventId: "7",
      onEvent: (event) => events.push(event),
    });

    assert.equal(outcome.kind, "terminal");
    assert.deepEqual(
      events.map((event) => event.type),
      ["snapshot", "heartbeat", "completed"],
    );
    assert.equal(fetchCalls.length, 1, "stream reconnect must not submit process");
    assert.equal(fetchCalls[0].url, "https://api.example.test/api/v1/reviews/review%2F1/events");
    assert.equal(fetchCalls[0].url.includes("?"), false);
    assert.equal(fetchCalls[0].init.method, "GET");
    assert.equal(fetchCalls[0].init.credentials, "include");
    assert.equal(fetchCalls[0].init.headers.Accept, "text/event-stream");
    assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer access-token-fixture");
    assert.equal(fetchCalls[0].init.headers["Last-Event-ID"], "7");
    assert.equal(fetchCalls[0].init.body, undefined);

    globalThis.fetch = async () =>
      createStreamResponse([
        `id: 3\nevent: completed\ndata: ${JSON.stringify({ ...completed, id: "3", source: "secret" })}\n\n`,
      ]);
    await assert.rejects(
      () => transport.stream("review-1"),
      (error) => error instanceof ReviewApiError && error.code === "INVALID_EVENT",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review result polling is bounded, cancellable, and conflict-specific at runtime", async () => {
  const { getReviewResultWithPolling, isExpectedResultNotReadyError } = await reviewPollingRuntime;
  const notReadyError = { code: "CONFLICT", status: 409 };
  const resultResponse = createReviewResultResponse();

  assert.equal(isExpectedResultNotReadyError(notReadyError), true);
  assert.equal(isExpectedResultNotReadyError({ code: "FORBIDDEN", status: 409 }), false);
  assert.equal(isExpectedResultNotReadyError({ code: "CONFLICT", status: 500 }), false);

  let readyCalls = 0;
  const readyOutcome = await getReviewResultWithPolling(
    {
      getResult: async () => {
        readyCalls += 1;

        if (readyCalls < 3) {
          throw notReadyError;
        }

        return resultResponse;
      },
    },
    "review-1",
    { delayMs: 0, isCurrent: () => true, maxChecks: 3, sleep: async () => {} },
  );

  assert.deepEqual(readyOutcome, { kind: "ready", response: resultResponse });
  assert.equal(readyCalls, 3, "expected 409 conflicts may be checked until the bounded limit");

  let exhaustedCalls = 0;
  const exhaustedOutcome = await getReviewResultWithPolling(
    {
      getResult: async () => {
        exhaustedCalls += 1;
        throw notReadyError;
      },
    },
    "review-1",
    { delayMs: 0, isCurrent: () => true, maxChecks: 2, sleep: async () => {} },
  );

  assert.deepEqual(exhaustedOutcome, { kind: "processing" });
  assert.equal(exhaustedCalls, 2, "polling must stop at its finite attempt limit");

  let unexpectedCalls = 0;
  await assert.rejects(() =>
    getReviewResultWithPolling(
      {
        getResult: async () => {
          unexpectedCalls += 1;
          throw { code: "FORBIDDEN", status: 409 };
        },
      },
      "review-1",
      { delayMs: 0, isCurrent: () => true, maxChecks: 4, sleep: async () => {} },
    ),
  );
  assert.equal(unexpectedCalls, 1, "unexpected conflicts must not be retried");

  let isCurrent = true;
  let cancelledCalls = 0;
  const cancelledOutcome = await getReviewResultWithPolling(
    {
      getResult: async () => {
        cancelledCalls += 1;
        throw notReadyError;
      },
    },
    "review-1",
    {
      delayMs: 0,
      isCurrent: () => isCurrent,
      maxChecks: 4,
      sleep: async () => {
        isCurrent = false;
      },
    },
  );

  assert.deepEqual(cancelledOutcome, { kind: "cancelled" });
  assert.equal(cancelledCalls, 1, "request-version cancellation must prevent the next GET");
});

test("review result runtime validation enforces ISO timestamps, usage invariants, metadata, and strict keys", async () => {
  const { ReviewApiError, reviewApi } = await reviewApiRuntime;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => createJsonResponse(200, { data: createReviewResultResponse() });
    await assert.doesNotReject(() => reviewApi.getResult("review-1"));

    globalThis.fetch = async () =>
      createJsonResponse(200, {
        data: createReviewResultResponse(),
        meta: { page: 1, pageSize: 100, requestId: "review-request-1", total: 0 },
      });
    await assert.doesNotReject(() => reviewApi.getResult("review-1"));

    const invalidMetadata = [
      "malformed",
      { page: 1, pageSize: 20, requestId: "review-request-1", total: 0, unknown: true },
      { page: 0, pageSize: 20, requestId: "review-request-1", total: 0 },
      { page: 1, pageSize: 101, requestId: "review-request-1", total: 0 },
      { page: 1, pageSize: 20, requestId: "review-request-1", total: -1 },
      { page: 1, pageSize: 20, requestId: " ", total: 0 },
      { page: 1, pageSize: 20, requestId: "x".repeat(129), total: 0 },
    ];

    for (const meta of invalidMetadata) {
      globalThis.fetch = async () =>
        createJsonResponse(200, { data: createReviewResultResponse(), meta });

      await assert.rejects(
        () => reviewApi.getResult("review-1"),
        (error) => error instanceof ReviewApiError && error.status === 200,
      );
    }

    const invalidResponses = [
      (() => {
        const response = createReviewResultResponse();
        response.execution.completedAt = "not-a-date";
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.execution.usage.inputTokens = -1;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.execution.usage.totalTokens = 99;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.execution.usage.cachedInputTokens = 11;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.execution.usage.unexpected = 1;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.execution.unexpected = true;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        const legacyResult = Object.fromEntries(
          Object.entries(response.result).filter(([key]) => key !== "education"),
        );
        response.result = legacyResult;
        return response;
      })(),
      (() => {
        const response = createReviewResultResponse();
        response.result.education.unexpected = true;
        return response;
      })(),
    ];

    for (const response of invalidResponses) {
      globalThis.fetch = async () => createJsonResponse(200, { data: response });

      await assert.rejects(
        () => reviewApi.getResult("review-1"),
        (error) => error instanceof ReviewApiError && error.status === 200,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review result renders safe boundaries, issue selection, and learning notes", () => {
  assert.match(source.reviewResultPanel, /status === "loading"/u);
  assert.match(source.reviewResultPanel, /status === "processing"/u);
  assert.match(source.reviewResultPanel, /status === "error"/u);
  assert.match(source.reviewResultPanel, /status === "empty"/u);
  assert.match(source.reviewResultPanel, />\s*Score\s*<\/h3>/u);
  assert.match(source.reviewResultPanel, />\s*Summary\s*<\/h3>/u);
  assert.match(source.reviewResultPanel, />\s*Issue signals\s*<\/h3>/u);
  assert.match(source.reviewResultPanel, /Learning note/u);
  assert.match(source.reviewResultPanel, /Filter issue signals/u);
  assert.match(source.reviewResultPanel, /aria-live="polite"/u);
  assert.match(source.reviewResultPanel, /No score is invented/u);
  assert.match(source.reviewResultPanel, /Check for result/u);
  assert.match(source.reviewResultPanel, /learningNoteId/u);
  assert.match(source.reviewResultPanel, /readonly findingIndex: number/u);
  assert.match(source.reviewResultPanel, /aria-pressed=\{isSelected\}/u);
  assert.match(source.reviewResultPanel, /review-code-context-line-selected/u);
  assert.match(source.reviewResultPanel, /data-transport-mode=\{transportMode\}/u);
  assert.match(source.reviewResultPanel, /Authenticated API result/u);
  assert.match(source.reviewResultPanel, /result\.result\.education/u);
  assert.match(source.reviewResultPanel, /education\.generatedTests/u);
  assert.match(source.reviewWorkspace, /transportMode=\{transportMode\}/u);
  assert.doesNotMatch(
    source.reviewResultPanel,
    /result\.execution\.(provider|model|reasoningEffort|durationMs)/u,
  );
});

test("review optional views expose real data seams and explicit unavailable states", () => {
  assert.match(source.reviewWorkspace, /optionalData\?: ReviewOptionalResultData/u);
  assert.match(source.reviewOptionalViews, /Improved code/u);
  assert.match(source.reviewOptionalViews, /Generated test/u);
  assert.match(source.reviewOptionalViews, /Learning question/u);
  assert.match(source.reviewOptionalViews, /Original versus improved/u);
  assert.match(source.reviewOptionalViews, /Generated tests/u);
  assert.match(source.reviewOptionalViews, /Learning questions/u);
  assert.match(source.reviewOptionalViews, /Unified diff/u);
  assert.match(source.reviewOptionalViews, /Not supplied/u);
  assert.match(source.reviewOptionalViews, /ReviewDiffEditor/u);
  assert.match(source.reviewOptionalViews, /optionalData\?\.improvedCode/u);
  assert.match(source.reviewSourceEditor, /dynamic<DiffEditorProps>/u);
  assert.match(source.reviewSourceEditor, /data-editor-engine="monaco-diff"/u);
});

test("review result actions use browser APIs only after a user action", () => {
  assert.match(source.reviewResultActions, /Copy improved code/u);
  assert.match(source.reviewResultActions, /Copy test case/u);
  assert.match(source.reviewResultActions, /Copy diff/u);
  assert.match(source.reviewResultActions, /Download Markdown/u);
  assert.match(source.reviewResultActions, /Download JSON/u);
  assert.match(source.reviewResultActions, /navigator\?\.clipboard/u);
  assert.match(source.reviewResultActions, /new browser\.Blob/u);
  assert.match(source.reviewResultActions, /createObjectURL/u);
  assert.match(source.reviewResultActions, /role="status"/u);
  assert.match(source.reviewResultActions, /disabled=\{!improvedCode\}/u);
  assert.match(source.reviewResultActions, /disabled=\{!generatedTest\}/u);
});

test("review exports remain source-free by default and include optional data only when supplied", async () => {
  const { createReviewExportPayload, formatReviewJson, formatReviewMarkdown } =
    await reviewExportsRuntime;
  const result = createReviewResultResponse();
  const payload = createReviewExportPayload(result);

  assert.equal(payload.id, "review-1");
  assert.equal(Object.hasOwn(payload, "optional"), false);
  assert.equal(JSON.stringify(payload).includes("execution"), false);
  assert.equal(JSON.stringify(payload).includes("source"), false);
  assert.match(formatReviewMarkdown(result), /# Review result/u);
  assert.match(formatReviewJson(result), /"schemaVersion": "v1"/u);

  const optionalData = {
    diff: "@@ -1 +1 @@\n-const original = true;\n+const improved = true;",
    generatedTests: ['test("array", () => expect(true).toBe(true));'],
    generatedTest: 'test("guard", () => expect(true).toBe(true));',
    improvedCode: "return fallback;",
    improvedSource: "const improved = true;",
    learningQuestions: ["Which invariant does the array example preserve?"],
    learningQuestion: "Which boundary is easiest to explain?",
    originalSource: "const original = true;",
  };
  const optionalPayload = createReviewExportPayload(result, optionalData);

  assert.deepEqual(optionalPayload.optional, optionalData);
  const markdown = formatReviewMarkdown(result, optionalData);
  assert.match(markdown, /## Original source[\s\S]*const original = true;/u);
  assert.match(markdown, /## Improved source[\s\S]*const improved = true;/u);
  assert.match(markdown, /## Improved code[\s\S]*return fallback;/u);
  assert.match(markdown, /## Unified diff[\s\S]*const improved = true;/u);
  assert.match(markdown, /## Generated test 1[\s\S]*test\("array"/u);
  assert.match(markdown, /## Generated test[\s\S]*test\("guard"/u);
  assert.match(markdown, /## Learning question 1[\s\S]*Which invariant/u);
  assert.match(markdown, /## Learning question[\s\S]*Which boundary/u);
  assert.deepEqual(JSON.parse(formatReviewJson(result, optionalData)).optional, optionalData);
});

test("review fixture remains deterministic and has an explicit empty-result path", () => {
  assert.match(source.reviewDemoTransport, /createDeterministicFixtureResult\(draft\)/u);
  assert.match(source.reviewDemoTransport, /gpt-5\.6-luna/u);
  assert.match(source.reviewDemoTransport, /reasoningEffort: "max"/u);
  assert.match(source.reviewDemoTransport, /usage: null/u);
  assert.match(source.reviewHelpers, /no findings/iu);
  assert.match(source.reviewHelpers, /findings:\s*\[\]/u);
  assert.match(source.reviewHook, /safeErrorMessage/u);
  assert.match(source.reviewHook, /setStatus\("loading"\)/u);
  assert.match(source.reviewHook, /setStatus\("processing"\)/u);
  assert.match(source.reviewHook, /useEffect/u);
  assert.match(source.reviewHook, /requestVersion\.current \+= 1/u);
  assert.match(source.reviewHook, /getReviewResultWithPolling/u);
  assert.match(source.reviewHook, /processResponse\.resultAvailable/u);
  assert.match(
    source.reviewHook,
    /setStatus\(resultResponse\.result\.findings\.length === 0 \? "empty" : "success"\)/u,
  );
});

test("review editor exposes the full initial language set and fixture extensions", () => {
  const languageOptions = [
    ["JavaScript", "javascript"],
    ["TypeScript", "typescript"],
    ["Java", "java"],
    ["Python", "python"],
    ["Go", "go"],
    ["SQL", "sql"],
    ["C#", "csharp"],
    ["C++", "cpp"],
    ["Rust", "rust"],
    ["Other", "other"],
  ];

  for (const [label, value] of languageOptions) {
    assert.match(
      source.reviewWorkspace,
      new RegExp(`label: "${escapeRegExp(label)}", value: "${value}"`, "u"),
    );
    assert.match(source.reviewTypes, new RegExp(`"${value}"`, "u"));
  }

  for (const extension of ["js", "ts", "java", "py", "go", "sql", "cs", "cpp", "rs", "txt"]) {
    assert.match(source.reviewHelpers, new RegExp(`return "${extension}"`, "u"));
  }
});

test("review CSS preserves product accessibility and responsive contracts", () => {
  assert.match(source.styles, /\.review-input\s*\{[\s\S]*min-height:\s*var\(--touch-target\)/u);
  assert.match(source.styles, /\.review-input:focus-visible\s*\{[\s\S]*outline:/u);
  assert.match(source.styles, /\.review-input:disabled\s*\{[\s\S]*cursor:\s*not-allowed/u);
  assert.match(source.styles, /\.review-monaco-viewport:focus-within\s*,[\s\S]*outline:/u);
  assert.match(source.styles, /\.review-monaco-fallback\s*\{/u);
  assert.match(source.styles, /\.review-source-fallback\s*\{/u);
  assert.match(source.styles, /\.review-finding-jump:focus-visible\s*\{[\s\S]*outline:/u);
  const findingJumpActiveBlock = extractBalancedBlock(
    source.styles,
    /\.review-finding-jump:active\s*/u,
    "review finding active styles",
  );
  assert.match(findingJumpActiveBlock, /translateY\(var\(--space-1\)\)/u);
  assert.doesNotMatch(findingJumpActiveBlock, /translateY\(1px\)/u);
  assert.match(source.styles, /\.review-finding-jump\[aria-pressed="true"\]/u);
  assert.match(source.styles, /\.review-code-context-line-selected\s*\{/u);
  assert.match(source.styles, /\.review-workspace-grid\s*\{[\s\S]*grid-template-columns:/u);
  assert.match(source.styles, /@media\s*\(max-width:\s*62rem\)[\s\S]*\.review-workspace-grid/u);
  assert.match(source.styles, /@media\s*\(max-width:\s*50rem\)[\s\S]*\.review-optional-grid/u);
  assert.match(source.styles, /@media\s*\(max-width:\s*30rem\)[\s\S]*\.review-field-grid/u);
  assert.match(
    source.styles,
    /@media\s*\(max-width:\s*30rem\)[\s\S]*\.review-result-action-buttons/u,
  );
  assert.match(source.styles, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\s*\)/u);
  assert.doesNotMatch(source.styles, /transition:\s*all/u);
  assert.doesNotMatch(source.styles, /overflow-x:\s*hidden/u);
});

test("review source copy contains no em dash, emoji, or banned marketing language", () => {
  const reviewSources = [
    source.reviewPage,
    source.reviewWorkspace,
    source.reviewSourceEditor,
    source.reviewResultPanel,
    source.reviewResultActions,
    source.reviewOptionalViews,
    source.reviewApi,
    source.reviewDemoTransport,
    source.reviewHelpers,
    source.reviewExports,
    source.reviewPolling,
  ];

  for (const reviewSource of reviewSources) {
    assert.doesNotMatch(reviewSource, /—/u);
    assert.doesNotMatch(reviewSource, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(
      reviewSource,
      /Elevate|Seamless|Unleash|Empower|Supercharge|Next-Gen|Game-changer/iu,
    );
  }
});

test("usage routes are linked from the shell and keep the existing review and auth routes", () => {
  for (const href of [
    "/reviews/new",
    "/dashboard",
    "/history",
    "/usage",
    "/#learning-loop",
    "/#status",
  ]) {
    assert.match(source.layout, new RegExp(`href\\s*=\\s*["']${escapeRegExp(href)}["']`, "u"));
  }

  assert.match(source.dashboardPage, /<UsageDashboard\s*\/>/u);
  assert.match(source.historyPage, /<UsageHistory\s*\/>/u);
  assert.match(source.usagePage, /<UsageOverview\s*\/>/u);
  assert.match(source.usageDashboard, /id="main-content"/u);
  assert.match(source.usageHistory, /id="main-content"/u);
  assert.match(source.usageOverview, /id="main-content"/u);
  assert.match(source.usageDashboard, /useUsageTransport/u);
  assert.match(source.usageHistory, /useUsageTransport/u);
  assert.match(source.usageOverview, /useUsageTransport/u);
  assert.match(source.usageTransport, /useInitializeAuthSession/u);
  assert.match(source.usageTransport, /createUsageApiTransport\(\{ getAccessToken \}\)/u);
  assert.match(source.usageTransport, /createDemoUsageTransport\(\)/u);
  assert.doesNotMatch(source.usageTransport, /localStorage|sessionStorage/u);
});

test("usage API validates strict summary, history, quota, and envelope shapes", async () => {
  const { UsageApiError, createUsageApiTransport, usageApi } = await usageApiRuntime;
  const originalFetch = globalThis.fetch;
  const validSummary = {
    asOf: "2026-08-06T00:00:00.000Z",
    completedReviews: 1,
    deepReviews: 0,
    inputTokens: 10,
    languageDistribution: [{ count: 1, language: "typescript" }],
    outputTokens: 5,
    reviewsByStatus: { CANCELLED: 0, COMPLETED: 1, FAILED: 0, PENDING: 0, PROCESSING: 0 },
    totalReviews: 1,
    totalTokens: 15,
  };
  const validHistory = {
    items: [
      {
        createdAt: "2026-08-06T00:00:00.000Z",
        durationMs: 42,
        inputTokens: 10,
        language: "typescript",
        mode: "STANDARD",
        outputTokens: 5,
        reviewId: "review-1",
        status: "COMPLETED",
        totalTokens: 15,
      },
    ],
    meta: { hasNext: false, hasPrevious: false, limit: 20, page: 1, total: 1, totalPages: 1 },
  };
  const validQuota = {
    asOf: "2026-08-06T00:00:00.000Z",
    modes: {
      DEEP: { limit: 3, remaining: 3, used: 0 },
      QUICK: { limit: 20, remaining: 19, used: 1 },
      STANDARD: { limit: 10, remaining: 10, used: 0 },
    },
    utcDay: "2026-08-06",
  };
  const validEnvelopeMeta = {
    page: 1,
    pageSize: 20,
    requestId: "usage-request-1",
    total: 1,
  };
  const seenRequests = [];

  try {
    globalThis.fetch = async (input, init) => {
      seenRequests.push({ init, input });
      const path = String(input);

      if (path.includes("/summary")) {
        return createJsonResponse(200, { data: validSummary, meta: validEnvelopeMeta });
      }

      if (path.includes("/history")) {
        return createJsonResponse(200, { data: validHistory });
      }

      return createJsonResponse(200, { data: validQuota });
    };

    await assert.doesNotReject(() => usageApi.getSummary());
    await assert.doesNotReject(() => usageApi.getHistory({ limit: 20, page: 1 }));
    await assert.doesNotReject(() => usageApi.getQuota());
    assert.match(String(seenRequests[0].input), /\/api\/v1\/usage\/summary/u);
    assert.match(String(seenRequests[1].input), /\/api\/v1\/usage\/history\?page=1&limit=20/u);
    assert.match(String(seenRequests[2].input), /\/api\/v1\/usage\/quota/u);
    for (const request of seenRequests) {
      assert.equal(request.init.credentials, "include");
      assert.equal(request.init.method, "GET");
      assert.equal(request.init.headers, undefined);
    }

    let accessToken;
    const authenticatedTransport = createUsageApiTransport({
      getAccessToken: () => accessToken,
    });
    seenRequests.length = 0;
    globalThis.fetch = async (input, init) => {
      seenRequests.push({ init, input });
      return createJsonResponse(200, { data: validSummary });
    };

    await assert.doesNotReject(() => authenticatedTransport.getSummary());
    assert.equal(seenRequests[0].init.headers, undefined);
    accessToken = "memory-only-access-token";
    await assert.doesNotReject(() => authenticatedTransport.getSummary());
    assert.deepEqual(seenRequests[1].init.headers, {
      Authorization: "Bearer memory-only-access-token",
    });

    globalThis.fetch = async () =>
      createJsonResponse(200, { data: { ...validSummary, totalTokens: 99 } });
    await assert.rejects(
      () => usageApi.getSummary(),
      (error) => error instanceof UsageApiError && error.status === 200,
    );

    globalThis.fetch = async () => createJsonResponse(200, { data: validHistory, trace: "extra" });
    await assert.rejects(
      () => usageApi.getHistory({ limit: 20, page: 1 }),
      (error) => error instanceof UsageApiError && error.status === 200,
    );

    globalThis.fetch = async () =>
      createJsonResponse(200, {
        data: {
          ...validQuota,
          modes: { ...validQuota.modes, QUICK: { limit: 20, remaining: 0, used: 1 } },
        },
      });
    await assert.rejects(
      () => usageApi.getQuota(),
      (error) => error instanceof UsageApiError && error.status === 200,
    );

    globalThis.fetch = async () => createJsonResponse(200, { data: validSummary, meta: {} });
    await assert.doesNotReject(() => usageApi.getSummary());

    globalThis.fetch = async () =>
      createJsonResponse(200, {
        data: validSummary,
        meta: { ...validEnvelopeMeta, pageSize: 101 },
      });
    await assert.rejects(
      () => usageApi.getSummary(),
      (error) => error instanceof UsageApiError && error.status === 200,
    );

    globalThis.fetch = async () =>
      createJsonResponse(200, {
        data: validSummary,
        meta: { ...validEnvelopeMeta, unexpected: true },
      });
    await assert.rejects(
      () => usageApi.getSummary(),
      (error) => error instanceof UsageApiError && error.status === 200,
    );

    await assert.rejects(
      () => usageApi.getHistory({ limit: 51, page: 1 }),
      (error) => error instanceof UsageApiError && error.status === 0,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usage fixture reconciles summary, history pagination, quota, and owner-safe row shape", async () => {
  const { createDemoUsageTransport, DEMO_USAGE_HISTORY } = await demoUsageRuntime;
  const transport = createDemoUsageTransport();
  const [summary, history, quota] = await Promise.all([
    transport.getSummary(),
    transport.getHistory({ limit: 4, page: 1 }),
    transport.getQuota(),
  ]);

  assert.equal(transport.source, "demo");
  assert.equal(summary.totalReviews, DEMO_USAGE_HISTORY.length);
  assert.equal(summary.totalTokens, summary.inputTokens + summary.outputTokens);
  assert.equal(history.meta.total, DEMO_USAGE_HISTORY.length);
  assert.equal(history.meta.totalPages, 2);
  assert.equal(history.meta.hasNext, true);
  assert.equal(quota.utcDay, "2026-08-06");
  assert.deepEqual(quota.modes.DEEP, { limit: 3, remaining: 1, used: 2 });
  assert.equal(
    DEMO_USAGE_HISTORY.some((item) => Object.hasOwn(item, "source")),
    false,
  );
  assert.equal(JSON.stringify(history).includes("source"), false);
});

test("usage demo filters and pagination are explicit client-only semantics", async () => {
  const { createDemoUsageTransport, DEMO_USAGE_HISTORY } = await demoUsageRuntime;
  const { clampPage, createHistoryMeta, filterUsageHistory } = await usageHelpersRuntime;
  const transport = createDemoUsageTransport();
  const completed = filterUsageHistory(DEMO_USAGE_HISTORY, {
    language: "ALL",
    mode: "ALL",
    status: "COMPLETED",
  });
  const typescript = filterUsageHistory(DEMO_USAGE_HISTORY, {
    language: "typescript",
    mode: "ALL",
    status: "ALL",
  });

  assert.equal(transport.source, "demo");
  assert.equal(completed.length, 5);
  assert.equal(typescript.length, 2);
  assert.deepEqual(createHistoryMeta(2, 1, 1), {
    hasNext: true,
    hasPrevious: false,
    limit: 1,
    page: 1,
    total: 2,
    totalPages: 2,
  });
  assert.equal(clampPage(4, 2), 2);
  assert.match(source.usageHistory, /Demo-only filters/u);
  assert.match(source.usageHistory, /page and limit only/u);
  assert.doesNotMatch(source.usageApi, /status=.*[?&]|mode=.*[?&]|language=.*[?&]/u);
});

test("usage quota progress semantics clamp assistive values and preserve overage truth", () => {
  assert.match(source.usageQuotaGrid, /const overage = Math\.max\(0, used - limit\)/u);
  assert.match(source.usageQuotaGrid, /aria-valuenow=\{Math\.min\(used, limit\)\}/u);
  assert.match(source.usageQuotaGrid, /aria-valuetext=\{quotaValueText\}/u);
  assert.match(source.usageQuotaGrid, /overage \$\{formatCount\(overage\)\}/u);
});

test("usage states, responsive records, focus targets, and reduced motion are explicit", () => {
  assert.match(source.usageDashboard, /status === "loading"/u);
  assert.match(source.usageDashboard, /status === "error"/u);
  assert.match(source.usageDashboard, /No reviews yet/u);
  assert.match(source.usageHistory, /status === "loading"/u);
  assert.match(source.usageHistory, /Empty result/u);
  assert.match(source.usageHistory, /aria-label="Review history pagination"/u);
  assert.match(source.usageHistory, /disabled=\{disabled \|\| !hasPrevious\}/u);
  assert.match(source.usageStatePanel, /aria-busy=\{tone === "loading"\}/u);
  assert.match(source.usageSourceNote, /data-transport-mode=\{source\}/u);
  assert.match(source.usageOverview, /Unavailable/u);
  assert.match(source.usageOverview, /Deferred/u);
  assert.match(
    source.styles,
    /\.usage-filter-input\s*\{[\s\S]*min-height:\s*var\(--touch-target\)/u,
  );
  assert.match(source.styles, /\.usage-filter-input:focus-visible\s*\{[\s\S]*outline:/u);
  assert.match(source.styles, /\.usage-filter-input:disabled\s*\{[\s\S]*cursor:\s*not-allowed/u);
  assert.match(source.styles, /\.usage-history-table\s*\{[\s\S]*table-layout:\s*fixed/u);
  assert.match(
    source.styles,
    /@media\s*\(max-width:\s*50rem\)[\s\S]*\.usage-history-table-shell\s*\{[\s\S]*display:\s*none/u,
  );
  assert.match(
    source.styles,
    /@media\s*\(max-width:\s*50rem\)[\s\S]*\.usage-history-mobile-list\s*\{[\s\S]*display:\s*grid/u,
  );
  assert.match(
    source.styles,
    /@media\s*\(max-width:\s*30rem\)[\s\S]*\.usage-pagination\s*\{[\s\S]*flex-direction:\s*column/u,
  );
  assert.match(source.styles, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\s*\)/u);
  assert.doesNotMatch(source.styles, /transition:\s*all/u);
  assert.doesNotMatch(source.styles, /overflow-x:\s*hidden/u);
});

test("usage UI is source-free, secret-free, and avoids banned visible copy", () => {
  assert.doesNotMatch(source.usageHistory, /item\.source|<th[^>]*>\s*Source\s*</u);

  const usageSources = [
    source.dashboardPage,
    source.historyPage,
    source.usagePage,
    source.usageDashboard,
    source.usageHistory,
    source.usageOverview,
    source.usageTransport,
    source.usageQuotaGrid,
    source.usageSourceNote,
    source.usageStatePanel,
    source.usageApi,
    source.demoUsageTransport,
    source.usageHelpers,
  ];

  for (const usageSource of usageSources) {
    assert.doesNotMatch(usageSource, /—/u);
    assert.doesNotMatch(usageSource, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(
      usageSource,
      /Elevate|Seamless|Unleash|Empower|Supercharge|Next-Gen|Game-changer/iu,
    );
    assert.doesNotMatch(usageSource, /DEEPSEEK|sk-[A-Za-z0-9]{20,}|api[_-]?key/iu);
  }
});
