export const REVIEW_HISTORY_MODES = ["QUICK", "STANDARD", "DEEP"] as const;
export type ReviewHistoryMode = (typeof REVIEW_HISTORY_MODES)[number];

export const REVIEW_HISTORY_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ReviewHistoryStatus = (typeof REVIEW_HISTORY_STATUSES)[number];

export const REVIEW_HISTORY_SORTS = ["asc", "desc"] as const;
export type ReviewHistorySort = (typeof REVIEW_HISTORY_SORTS)[number];

export interface ReviewHistoryItem {
  readonly id: string;
  readonly language: string;
  readonly mode: ReviewHistoryMode;
  readonly learnerLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  readonly title?: string;
  readonly context?: string;
  readonly status: ReviewHistoryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReviewHistoryMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export interface ReviewHistoryData {
  readonly items: readonly ReviewHistoryItem[];
  readonly meta: ReviewHistoryMeta;
}

export interface ReviewHistoryRequest {
  readonly page: number;
  readonly limit: number;
  readonly title?: string;
  readonly language?: string;
  readonly mode?: ReviewHistoryMode;
  readonly status?: ReviewHistoryStatus;
  readonly sort: ReviewHistorySort;
}

export interface ReviewHistoryDeleteData {
  readonly deletedCount: number;
}

export interface ReviewHistoryTransport {
  readonly list: (request: ReviewHistoryRequest) => Promise<ReviewHistoryData>;
  readonly deleteMany: (ids: readonly string[]) => Promise<ReviewHistoryDeleteData>;
}
