import type {
  UsageHistoryFilters,
  UsageHistoryItem,
  UsageHistoryMeta,
  UsageReviewMode,
  UsageReviewStatus,
} from "@/features/usage/types";

const microUsdPerUsd = 1_000_000;

const languageLabels: Readonly<Record<string, string>> = Object.freeze({
  cpp: "C++",
  csharp: "C#",
  go: "Go",
  java: "Java",
  javascript: "JavaScript",
  other: "Other",
  python: "Python",
  rust: "Rust",
  sql: "SQL",
  typescript: "TypeScript",
});

export const formatCount = (value: number): string => new Intl.NumberFormat("en-US").format(value);

export const formatLanguage = (language: string): string =>
  languageLabels[language] ??
  language.replace(
    /(^|[-_])([a-z])/gu,
    (_, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`,
  );

export const formatMode = (mode: UsageReviewMode): string =>
  mode.charAt(0) + mode.slice(1).toLowerCase();

export const formatStatus = (status: UsageReviewStatus): string =>
  status.charAt(0) + status.slice(1).toLowerCase();

export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

export const formatDuration = (durationMs: number | null): string => {
  if (durationMs === null) {
    return "Not available";
  }

  return durationMs < 1_000 ? `${durationMs} ms` : `${(durationMs / 1_000).toFixed(1)} s`;
};

export const formatTokens = (tokens: number | null): string =>
  tokens === null ? "Not recorded" : formatCount(tokens);

export const formatEstimatedCost = (estimatedCostMicros: number | null): string => {
  if (
    estimatedCostMicros === null ||
    !Number.isSafeInteger(estimatedCostMicros) ||
    estimatedCostMicros < 0
  ) {
    return "Unavailable";
  }

  const wholeUsd = Math.floor(estimatedCostMicros / microUsdPerUsd);
  const fractionalMicros = estimatedCostMicros % microUsdPerUsd;
  const fractionalUsd = String(fractionalMicros).padStart(6, "0").replace(/0+$/u, "");

  return fractionalUsd === "" ? `USD ${wholeUsd}` : `USD ${wholeUsd}.${fractionalUsd}`;
};

export const formatPricingVersion = (pricingVersion: string | null): string =>
  pricingVersion === null ? "No compatible pricing version" : `Pricing version ${pricingVersion}`;

export const filterUsageHistory = (
  items: readonly UsageHistoryItem[],
  filters: UsageHistoryFilters,
): readonly UsageHistoryItem[] =>
  items.filter(
    (item) =>
      (filters.status === "ALL" || item.status === filters.status) &&
      (filters.mode === "ALL" || item.mode === filters.mode) &&
      (filters.language === "ALL" || item.language === filters.language),
  );

export const createHistoryMeta = (total: number, page: number, limit: number): UsageHistoryMeta => {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    hasNext: page < totalPages,
    hasPrevious: page > 1 && totalPages > 0,
    limit,
    page,
    total,
    totalPages,
  };
};

export const clampPage = (page: number, totalPages: number): number =>
  totalPages === 0 ? 1 : Math.min(Math.max(page, 1), totalPages);

export const getUsageErrorCopy = (): string =>
  "Usage data is unavailable right now. Try again, or continue with the visible demo boundary.";
