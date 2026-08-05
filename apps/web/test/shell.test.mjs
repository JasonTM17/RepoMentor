import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
});

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
