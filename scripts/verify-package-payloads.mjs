import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const CONTRACTS_PACKAGE_NAME = "@repomentor/contracts";
const CONTRACTS_DIRECTORY = path.join(REPOSITORY_ROOT, "packages", "contracts");
const CONTRACTS_MANIFEST_PATH = path.join(CONTRACTS_DIRECTORY, "package.json");
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const SECRET_FIELD_NAMES = String.raw`password|passphrase|secret|token|api[-_]?key|credential`;
const SECRET_FIELD_PREFIX_PATTERN = String.raw`["']?\b(?:${SECRET_FIELD_NAMES})\b["']?\s*[:=]\s*`;
const AUTHORIZATION_PREFIX_PATTERN = String.raw`["']?\bauthorization\b["']?\s*[:=]\s*`;
const AUTHORIZATION_DOUBLE_QUOTED_BEARER_PATTERN = new RegExp(
  `(${AUTHORIZATION_PREFIX_PATTERN})"(Bearer\\s+)([^"\\r\\n]*)"`,
  "gi",
);
const AUTHORIZATION_SINGLE_QUOTED_BEARER_PATTERN = new RegExp(
  `(${AUTHORIZATION_PREFIX_PATTERN})'(Bearer\\s+)([^'\\r\\n]*)'`,
  "gi",
);
const AUTHORIZATION_UNQUOTED_BEARER_PATTERN = new RegExp(
  `(${AUTHORIZATION_PREFIX_PATTERN})(Bearer\\s+)([^\\s"'\\r\\n,;}\\]]+)`,
  "gi",
);
const QUOTED_SECRET_FIELD_PATTERN = new RegExp(
  `(${SECRET_FIELD_PREFIX_PATTERN})(["'])((?:\\\\.|(?!\\2)[^\\r\\n])*)\\2`,
  "gi",
);
const AUTHORIZATION_QUOTED_SECRET_FIELD_PATTERN = new RegExp(
  `(${AUTHORIZATION_PREFIX_PATTERN})(["'])(?!Bearer\\s)((?:\\\\.|(?!\\2)[^\\r\\n])*)\\2`,
  "gi",
);
const UNQUOTED_SECRET_FIELD_PATTERN = new RegExp(
  `(${SECRET_FIELD_PREFIX_PATTERN})([^\\s"'\\r\\n,;}\\]]+)`,
  "gi",
);
const AUTHORIZATION_UNQUOTED_SECRET_FIELD_PATTERN = new RegExp(
  `(${AUTHORIZATION_PREFIX_PATTERN})(?!Bearer\\s)([^\\s"'\\r\\n,;}\\]]+)`,
  "gi",
);
const BEARER_CREDENTIAL_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]{8,}\b/gi;
const KEY_SHAPED_CREDENTIAL_PATTERN =
  /\b(?:ghp_|github_pat_|sk-|sk_|xox[baprs]_)[A-Za-z0-9_-]{8,}\b/gi;

const PRODUCTION_MODULES = ["auth", "envelopes", "health", "index", "problem"];
const EXPECTED_PAYLOAD = [
  "package.json",
  ...PRODUCTION_MODULES.flatMap((moduleName) => [
    `dist/${moduleName}.d.ts`,
    `dist/${moduleName}.d.ts.map`,
    `dist/${moduleName}.js`,
    `dist/${moduleName}.js.map`,
  ]),
].sort();

function manifestPathLabel(manifestPath) {
  return path.relative(REPOSITORY_ROOT, manifestPath).replaceAll(path.sep, "/");
}

function readJson(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ${manifestPathLabel(manifestPath)}: ${reason}`, { cause: error });
  }
}

function discoverPackageManifests() {
  const manifestPaths = [path.join(REPOSITORY_ROOT, "package.json")];

  for (const workspaceRootName of ["apps", "packages"]) {
    const workspaceRoot = path.join(REPOSITORY_ROOT, workspaceRootName);
    const entries = readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const manifestPath = path.join(workspaceRoot, entry.name, "package.json");
      if (existsSync(manifestPath)) {
        manifestPaths.push(manifestPath);
      }
    }
  }

  return manifestPaths;
}

export function redactDiagnostics(value) {
  return String(value)
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(
      AUTHORIZATION_DOUBLE_QUOTED_BEARER_PATTERN,
      (_match, prefix, bearerPrefix) => `${prefix}"${bearerPrefix}[REDACTED]"`,
    )
    .replace(
      AUTHORIZATION_SINGLE_QUOTED_BEARER_PATTERN,
      (_match, prefix, bearerPrefix) => `${prefix}'${bearerPrefix}[REDACTED]'`,
    )
    .replace(
      AUTHORIZATION_UNQUOTED_BEARER_PATTERN,
      (_match, prefix, bearerPrefix) => `${prefix}${bearerPrefix}[REDACTED]`,
    )
    .replace(UNQUOTED_SECRET_FIELD_PATTERN, "$1[REDACTED]")
    .replace(AUTHORIZATION_UNQUOTED_SECRET_FIELD_PATTERN, "$1[REDACTED]")
    .replace(
      QUOTED_SECRET_FIELD_PATTERN,
      (_match, prefix, quote) => `${prefix}${quote}[REDACTED]${quote}`,
    )
    .replace(
      AUTHORIZATION_QUOTED_SECRET_FIELD_PATTERN,
      (_match, prefix, quote) => `${prefix}${quote}[REDACTED]${quote}`,
    )
    .replace(BEARER_CREDENTIAL_PATTERN, "Bearer [REDACTED]")
    .replace(KEY_SHAPED_CREDENTIAL_PATTERN, "[REDACTED]")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join("\n");
}

function runPnpm(args, label) {
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandOptions = {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };

  try {
    if (process.platform === "win32") {
      // Windows exposes pnpm as a .cmd shim; this command line uses fixed literals only.
      return execFileSync([pnpmCommand, ...args].join(" "), {
        ...commandOptions,
        shell: true,
      });
    }
    return execFileSync(pnpmCommand, args, commandOptions);
  } catch (error) {
    const stdout = error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr = error && typeof error.stderr === "string" ? error.stderr : "";
    const details = redactDiagnostics(stderr || stdout);
    throw new Error(`${label} failed${details ? `:\n${details}` : "."}`, { cause: error });
  }
}

function parsePackJson(output) {
  const cleanOutput = output.replace(ANSI_ESCAPE_PATTERN, "").trim();
  const candidates = [cleanOutput];

  for (const [opening, closing] of [
    ["{", "}"],
    ["[", "]"],
  ]) {
    const start = cleanOutput.indexOf(opening);
    const end = cleanOutput.lastIndexOf(closing);
    if (start >= 0 && end > start) {
      candidates.push(cleanOutput.slice(start, end + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = Array.isArray(parsed) ? parsed.at(-1) : parsed;
      if (result && Array.isArray(result.files)) {
        return result;
      }
    } catch {
      // Try the next bounded JSON candidate.
    }
  }

  throw new Error("contracts pack dry-run did not return a JSON file list");
}

function normalizePayloadPath(payloadPath) {
  let normalized = String(payloadPath).replaceAll("\\", "/");
  normalized = normalized.replace(/^\.\//, "");
  if (normalized.startsWith("package/")) {
    normalized = normalized.slice("package/".length);
  }
  return normalized;
}

function payloadEntryLabel(entry) {
  if (entry && typeof entry === "object" && typeof entry.path === "string") {
    return normalizePayloadPath(entry.path);
  }
  if (typeof entry === "string") {
    return normalizePayloadPath(entry);
  }
  return "<invalid pack entry>";
}

function classifyForbiddenPayload(payloadPath) {
  if (
    /(^|\/)(?:test|tests|__tests__|\.test-dist|test-dist)(?:\/|$)/i.test(payloadPath) ||
    /(?:\.test|\.spec)\.[^/]+$/i.test(payloadPath)
  ) {
    return "test artifact";
  }
  if (
    /(^|\/)src(?:\/|$)/i.test(payloadPath) ||
    /\.(?:tsx|mts|cts)$/i.test(payloadPath) ||
    (/\.ts$/i.test(payloadPath) && !/\.d\.ts$/i.test(payloadPath))
  ) {
    return "source file";
  }
  if (
    /(^|\/)(?:tsconfig(?:\.[^/]+)?\.json|eslint(?:\.[^/]+)?|\.prettierignore|\.env(?:\..*)?|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock)$/i.test(
      payloadPath,
    )
  ) {
    return "configuration or credential file";
  }
  return null;
}

function verifyPrivateManifests() {
  const manifestPaths = discoverPackageManifests();
  const violations = [];

  for (const manifestPath of manifestPaths) {
    const manifest = readJson(manifestPath);
    const label = manifestPathLabel(manifestPath);

    if (manifest.private !== true) {
      violations.push(`${label} must set private: true`);
    }
    if (Object.prototype.hasOwnProperty.call(manifest, "publishConfig")) {
      violations.push(`${label} must not define publishConfig`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`private package boundary violation:\n- ${violations.join("\n- ")}`);
  }

  return manifestPaths;
}

function verifyContractsManifest() {
  const manifest = readJson(CONTRACTS_MANIFEST_PATH);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const expectedFiles = ["dist", "package.json"];

  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `packages/contracts/package.json must keep files exactly ${JSON.stringify(expectedFiles)}`,
    );
  }
}

function verifyPayload() {
  const packResult = parsePackJson(
    runPnpm(
      ["--filter", CONTRACTS_PACKAGE_NAME, "pack", "--dry-run", "--json"],
      "contracts pack dry-run",
    ),
  );
  const entries = packResult.files.map((entry) => ({
    entry,
    path: payloadEntryLabel(entry),
  }));
  const actualPayload = entries.map(({ path: payloadPath }) => payloadPath).sort();
  const expectedPayload = [...EXPECTED_PAYLOAD];
  const expectedSet = new Set(expectedPayload);
  const actualSet = new Set(actualPayload);
  const missing = expectedPayload.filter((payloadPath) => !actualSet.has(payloadPath));
  const unexpected = actualPayload.filter((payloadPath) => !expectedSet.has(payloadPath));
  const duplicates = actualPayload.filter(
    (payloadPath, index) => actualPayload.indexOf(payloadPath) !== index,
  );
  const forbidden = actualPayload
    .map((payloadPath) => ({ path: payloadPath, kind: classifyForbiddenPayload(payloadPath) }))
    .filter((entry) => entry.kind !== null);

  if (
    missing.length > 0 ||
    unexpected.length > 0 ||
    duplicates.length > 0 ||
    forbidden.length > 0
  ) {
    const diagnostics = ["contracts package payload violation:"];
    if (missing.length > 0) {
      diagnostics.push(`missing: ${missing.join(", ")}`);
    }
    if (unexpected.length > 0) {
      diagnostics.push(`unexpected: ${unexpected.join(", ")}`);
    }
    if (duplicates.length > 0) {
      diagnostics.push(`duplicates: ${[...new Set(duplicates)].join(", ")}`);
    }
    if (forbidden.length > 0) {
      diagnostics.push(
        `forbidden: ${forbidden.map((entry) => `${entry.path} (${entry.kind})`).join(", ")}`,
      );
    }
    throw new Error(diagnostics.join("\n"));
  }

  const payload = entries
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ entry, path: payloadPath }) => {
      const summary = { path: payloadPath };
      if (entry && typeof entry === "object") {
        if (typeof entry.size === "number") {
          summary.size = entry.size;
        }
        if (typeof entry.mode === "number") {
          summary.mode = entry.mode;
        }
      }
      return summary;
    });

  return payload;
}

function runPackageCheck() {
  try {
    const manifestPaths = verifyPrivateManifests();
    verifyContractsManifest();
    runPnpm(["--filter", CONTRACTS_PACKAGE_NAME, "build"], "contracts build");
    const payload = verifyPayload();

    process.stdout.write(
      JSON.stringify(
        {
          privateManifests: manifestPaths.map(manifestPathLabel),
          package: CONTRACTS_PACKAGE_NAME,
          payload,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`package:check failed:\n${redactDiagnostics(message)}\n`);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  runPackageCheck();
}
