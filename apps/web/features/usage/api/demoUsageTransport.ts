import type {
  UsageHistoryData,
  UsageHistoryItem,
  UsageHistoryRequest,
  UsageQuotaData,
  UsageSummaryData,
  UsageTransport,
} from "@/features/usage/types";

export const DEMO_USAGE_AS_OF = "2026-08-06T00:00:00.000Z";
export const DEMO_USAGE_UTC_DAY = "2026-08-06";

export const DEMO_USAGE_HISTORY: readonly UsageHistoryItem[] = Object.freeze([
  {
    createdAt: "2026-08-05T15:40:00.000Z",
    durationMs: 840,
    inputTokens: 140,
    language: "typescript",
    mode: "STANDARD",
    outputTokens: 82,
    reviewId: "demo-review-2026-08-05-01",
    status: "COMPLETED",
    totalTokens: 222,
  },
  {
    createdAt: "2026-08-05T11:10:00.000Z",
    durationMs: 1_220,
    inputTokens: 260,
    language: "python",
    mode: "DEEP",
    outputTokens: 160,
    reviewId: "demo-review-2026-08-05-02",
    status: "COMPLETED",
    totalTokens: 420,
  },
  {
    createdAt: "2026-08-04T16:25:00.000Z",
    durationMs: 460,
    inputTokens: 88,
    language: "javascript",
    mode: "QUICK",
    outputTokens: 44,
    reviewId: "demo-review-2026-08-04-01",
    status: "COMPLETED",
    totalTokens: 132,
  },
  {
    createdAt: "2026-08-03T09:20:00.000Z",
    durationMs: null,
    inputTokens: null,
    language: "go",
    mode: "DEEP",
    outputTokens: null,
    reviewId: "demo-review-2026-08-03-01",
    status: "FAILED",
    totalTokens: null,
  },
  {
    createdAt: "2026-08-02T14:05:00.000Z",
    durationMs: 910,
    inputTokens: 190,
    language: "sql",
    mode: "STANDARD",
    outputTokens: 110,
    reviewId: "demo-review-2026-08-02-01",
    status: "COMPLETED",
    totalTokens: 300,
  },
  {
    createdAt: "2026-08-01T17:45:00.000Z",
    durationMs: null,
    inputTokens: null,
    language: "rust",
    mode: "QUICK",
    outputTokens: null,
    reviewId: "demo-review-2026-08-01-01",
    status: "PROCESSING",
    totalTokens: null,
  },
  {
    createdAt: "2026-07-31T12:15:00.000Z",
    durationMs: 720,
    inputTokens: 110,
    language: "typescript",
    mode: "STANDARD",
    outputTokens: 70,
    reviewId: "demo-review-2026-07-31-01",
    status: "COMPLETED",
    totalTokens: 180,
  },
  {
    createdAt: "2026-07-30T08:50:00.000Z",
    durationMs: null,
    inputTokens: null,
    language: "csharp",
    mode: "QUICK",
    outputTokens: null,
    reviewId: "demo-review-2026-07-30-01",
    status: "PENDING",
    totalTokens: null,
  },
]);

const demoSummary: UsageSummaryData = Object.freeze({
  asOf: DEMO_USAGE_AS_OF,
  completedReviews: 5,
  deepReviews: 2,
  inputTokens: 788,
  languageDistribution: Object.freeze([
    { count: 1, language: "csharp" },
    { count: 1, language: "go" },
    { count: 1, language: "javascript" },
    { count: 1, language: "python" },
    { count: 1, language: "rust" },
    { count: 1, language: "sql" },
    { count: 2, language: "typescript" },
  ]),
  outputTokens: 466,
  reviewsByStatus: Object.freeze({
    CANCELLED: 0,
    COMPLETED: 5,
    FAILED: 1,
    PENDING: 1,
    PROCESSING: 1,
  }),
  totalReviews: 8,
  totalTokens: 1_254,
});

const demoQuota: UsageQuotaData = Object.freeze({
  asOf: DEMO_USAGE_AS_OF,
  modes: Object.freeze({
    DEEP: Object.freeze({ limit: 3, remaining: 1, used: 2 }),
    QUICK: Object.freeze({ limit: 20, remaining: 17, used: 3 }),
    STANDARD: Object.freeze({ limit: 10, remaining: 7, used: 3 }),
  }),
  utcDay: DEMO_USAGE_UTC_DAY,
});

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const createHistoryPage = ({ page, limit }: UsageHistoryRequest): UsageHistoryData => {
  const total = DEMO_USAGE_HISTORY.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return {
    items: DEMO_USAGE_HISTORY.slice(start, start + limit),
    meta: {
      hasNext: page < totalPages,
      hasPrevious: page > 1 && totalPages > 0,
      limit,
      page,
      total,
      totalPages,
    },
  };
};

export const createDemoUsageTransport = (): UsageTransport =>
  Object.freeze({
    fixtureHistory: DEMO_USAGE_HISTORY,
    getHistory: async (request: UsageHistoryRequest): Promise<UsageHistoryData> => {
      await wait(120);
      return createHistoryPage(request);
    },
    getQuota: async (): Promise<UsageQuotaData> => {
      await wait(100);
      return demoQuota;
    },
    getSummary: async (): Promise<UsageSummaryData> => {
      await wait(140);
      return demoSummary;
    },
    source: "demo" as const,
  });
