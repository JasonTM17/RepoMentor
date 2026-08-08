import { expect, test } from "@playwright/test";

const validUser = {
  createdAt: "2026-01-01T00:00:00.000Z",
  displayName: "Browser Tester",
  email: "browser@example.com",
  id: "user-browser-1",
  role: "USER",
  status: "ACTIVE",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const validLoginData = {
  accessToken: "browser-access-token",
  expiresInSeconds: 900,
  tokenType: "Bearer",
  user: validUser,
} as const;

const reviewId = "review-browser-1";

const admission = {
  createdAt: "2026-08-07T00:00:00.000Z",
  id: reviewId,
  language: "typescript",
  mode: "STANDARD",
  status: "PENDING",
  updatedAt: "2026-08-07T00:00:00.000Z",
} as const;

const result = {
  execution: {
    attempts: 1,
    completedAt: "2026-08-07T00:00:00.000Z",
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
  id: reviewId,
  result: {
    education: {
      diff: "@@ -1 +1 @@\n-const fallback = value;\n+const fallback = value ?? defaultValue;",
      generatedTests: ['test("fallback", () => expect(fallback).toBeDefined());'],
      improvedSource: "const fallback = value ?? defaultValue;",
      learningQuestions: ["Which boundary should keep the fallback invariant visible?"],
    },
    findings: [
      {
        category: "MAINTAINABILITY",
        description: "The branch hides the fallback path from the next reader.",
        endLine: 1,
        filePath: "review.ts",
        severity: "MEDIUM",
        startLine: 1,
        suggestion: "Name the fallback explicitly so the review intent remains visible.",
        title: "Name the fallback path",
      },
    ],
    schemaVersion: "v1",
    summary: "The authenticated review returned one bounded learning signal.",
  },
  status: "COMPLETED",
} as const;

const envelope = (data: unknown): string => JSON.stringify({ data });

interface CapturedRequest {
  readonly body?: unknown;
  readonly headers: Record<string, string>;
  readonly method: string;
}

const firstCapturedRequest = (requests: readonly CapturedRequest[]): CapturedRequest => {
  const request = requests.at(0);

  if (!request) {
    throw new Error("Expected a captured browser request.");
  }

  return request;
};

test("registers, signs in, and completes one authenticated review through the browser API seam", async ({
  page,
}) => {
  const registerRequests: CapturedRequest[] = [];
  const loginRequests: CapturedRequest[] = [];
  const refreshRequests: CapturedRequest[] = [];
  const admissionRequests: CapturedRequest[] = [];
  const processRequests: CapturedRequest[] = [];
  const eventRequests: CapturedRequest[] = [];
  const resultRequests: CapturedRequest[] = [];

  await page.route("**/api/v1/auth/register", async (route) => {
    const request = route.request();
    registerRequests.push({
      body: request.postDataJSON(),
      headers: request.headers(),
      method: request.method(),
    });
    await route.fulfill({
      body: envelope({ accepted: true }),
      contentType: "application/json",
      status: 202,
    });
  });

  await page.route("**/api/v1/auth/login", async (route) => {
    const request = route.request();
    loginRequests.push({
      body: request.postDataJSON(),
      headers: request.headers(),
      method: request.method(),
    });
    await route.fulfill({
      body: envelope(validLoginData),
      contentType: "application/json",
      status: 201,
    });
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    const request = route.request();
    refreshRequests.push({
      headers: request.headers(),
      method: request.method(),
    });
    await route.fulfill({
      body: envelope(validLoginData),
      contentType: "application/json",
      status: 201,
    });
  });

  await page.route("**/api/v1/reviews**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = request.headers();

    if (url.pathname === "/api/v1/reviews" && request.method() === "POST") {
      admissionRequests.push({ body: request.postDataJSON(), headers, method: request.method() });
      await route.fulfill({
        body: envelope(admission),
        contentType: "application/json",
        status: 201,
      });
      return;
    }

    if (url.pathname === `/api/v1/reviews/${reviewId}/process` && request.method() === "POST") {
      processRequests.push({ body: request.postDataJSON(), headers, method: request.method() });
      await route.fulfill({
        body: envelope({
          id: reviewId,
          outcome: "COMPLETED",
          resultAvailable: true,
          status: "COMPLETED",
        }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    if (url.pathname === `/api/v1/reviews/${reviewId}/events` && request.method() === "GET") {
      eventRequests.push({ headers, method: request.method() });
      await route.fulfill({
        body: [
          "id: 1",
          "event: completed",
          `data: ${JSON.stringify({
            generation: 1,
            id: "1",
            resultAvailable: true,
            reviewId,
            schemaVersion: "v1",
            status: "COMPLETED",
            type: "completed",
          })}`,
          "",
          "",
        ].join("\n"),
        headers: {
          "cache-control": "no-store",
          "content-type": "text/event-stream",
        },
        status: 200,
      });
      return;
    }

    if (url.pathname === `/api/v1/reviews/${reviewId}/result` && request.method() === "GET") {
      resultRequests.push({ headers, method: request.method() });
      await route.fulfill({
        body: envelope(result),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    await route.fallback();
  });

  await page.goto("/register");
  await page.getByLabel("Display name").fill("Browser Tester");
  await page.getByLabel("Email address").fill("browser@example.com");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByLabel("Confirm password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("status")).toContainText("Registration accepted");
  await expect(page.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
  await page.getByRole("link", { name: "Go to sign in" }).click();

  await page.getByLabel("Email address").fill("browser@example.com");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("status")).toContainText("The server accepted the credentials");
  await page.getByRole("link", { name: "Open review workspace" }).click();
  await expect(page).toHaveURL(/\/reviews\/new$/u);
  await expect(page.locator('[data-transport-mode="api"]')).toBeVisible();
  await expect(page.getByText("Authenticated API transport active.")).toBeVisible();

  const storage = await page.evaluate(() => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
  }));
  expect(storage).toEqual({ localStorage: [], sessionStorage: [] });

  const sourceEditor = page.getByRole("textbox", { name: "Source code to review" });
  await expect(sourceEditor).toBeVisible();
  await sourceEditor.fill("const fallback = value ?? defaultValue;");
  await page.getByRole("button", { name: "Start API review" }).click();

  await expect(page.locator('.review-results-panel[data-transport-mode="api"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The structured result is ready." }),
  ).toBeVisible();
  await expect(page.getByText("Authenticated API result")).toBeVisible();
  await expect(page.getByText("Name the fallback path")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Improved code" })).toBeVisible();
  await expect(page.getByText("Generated tests")).toBeVisible();
  await expect(
    page.getByText("Which boundary should keep the fallback invariant visible?"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diff and comparison" })).toBeVisible();
  await expect(page.getByText("provider-secret-fixture")).toHaveCount(0);

  await expect.poll(() => registerRequests.length).toBe(1);
  await expect.poll(() => loginRequests.length).toBe(1);
  await expect.poll(() => admissionRequests.length).toBe(1);
  await expect.poll(() => processRequests.length).toBe(1);
  await expect.poll(() => eventRequests.length).toBeGreaterThan(0);
  await expect.poll(() => resultRequests.length).toBe(1);

  const registerRequest = firstCapturedRequest(registerRequests);
  const loginRequest = firstCapturedRequest(loginRequests);
  const admissionRequest = firstCapturedRequest(admissionRequests);
  const processRequest = firstCapturedRequest(processRequests);
  const eventRequest = firstCapturedRequest(eventRequests);
  const resultRequest = firstCapturedRequest(resultRequests);

  expect(registerRequest).toMatchObject({
    body: {
      displayName: "Browser Tester",
      email: "browser@example.com",
      password: "correct horse battery staple",
    },
    method: "POST",
  });
  expect(loginRequest).toMatchObject({
    body: { email: "browser@example.com", password: "correct horse battery staple" },
    method: "POST",
  });
  expect(admissionRequest.body).toEqual({
    language: "typescript",
    mode: "STANDARD",
    source: "const fallback = value ?? defaultValue;",
  });
  expect(admissionRequest.headers).toMatchObject({
    authorization: "Bearer browser-access-token",
  });
  expect(admissionRequest.headers["idempotency-key"]).toMatch(/^web-review-[A-Za-z0-9-]+$/u);
  expect(processRequest).toMatchObject({
    body: {},
    headers: { authorization: "Bearer browser-access-token" },
    method: "POST",
  });
  expect(eventRequest.headers).toMatchObject({
    authorization: "Bearer browser-access-token",
  });
  expect(resultRequest).toMatchObject({
    headers: { authorization: "Bearer browser-access-token" },
    method: "GET",
  });

  if (refreshRequests.length > 0) {
    expect(firstCapturedRequest(refreshRequests)).toMatchObject({
      method: "POST",
    });
  }
});
