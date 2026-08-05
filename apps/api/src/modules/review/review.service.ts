import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { allowedSourceStatuses } from "./review.policy.js";
import {
  REVIEW_MAX_LANGUAGE_LENGTH,
  REVIEW_MAX_SOURCE_LENGTH,
  REVIEW_REPOSITORY,
  type ReviewListQuery,
  type ReviewMode,
  type ReviewRecord,
  type ReviewRepository,
  type ReviewStatus,
} from "./review.types.js";

export interface ReviewSummary {
  readonly id: string;
  readonly language: string;
  readonly mode: ReviewMode;
  readonly status: ReviewStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReviewDetail extends ReviewSummary {
  readonly source: string;
}

export interface ReviewListResponse {
  readonly items: readonly ReviewSummary[];
  readonly meta: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasNext: boolean;
    readonly hasPrevious: boolean;
  };
}

function notFound(): NotFoundException {
  return new NotFoundException();
}

function invalidTransition(): ConflictException {
  return new ConflictException();
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase();
}

function assertCreateInput(source: string, language: string): void {
  if (
    source.length < 1 ||
    source.length > REVIEW_MAX_SOURCE_LENGTH ||
    !/\S/u.test(source) ||
    language.length < 1 ||
    language.length > REVIEW_MAX_LANGUAGE_LENGTH ||
    !/^[a-z0-9#+._-]+$/u.test(language)
  ) {
    throw new BadRequestException();
  }
}

function toSummary(review: ReviewRecord): ReviewSummary {
  return {
    createdAt: review.createdAt,
    id: review.id,
    language: review.language,
    mode: review.mode,
    status: review.status,
    updatedAt: review.updatedAt,
  };
}

function toDetail(review: ReviewRecord): ReviewDetail {
  return {
    ...toSummary(review),
    source: review.source,
  };
}

@Injectable()
export class ReviewService {
  constructor(@Inject(REVIEW_REPOSITORY) private readonly repository: ReviewRepository) {}

  async create(
    userId: string,
    input: { readonly source: string; readonly language: string; readonly mode?: ReviewMode },
  ): Promise<ReviewSummary> {
    const language = normalizeLanguage(input.language);
    assertCreateInput(input.source, language);

    const review = await this.repository.create({
      language,
      mode: input.mode ?? "STANDARD",
      source: input.source,
      userId,
    });

    return toSummary(review);
  }

  async list(userId: string, input: ReviewListQuery): Promise<ReviewListResponse> {
    const result = await this.repository.listForUser({ ...input, userId });
    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / input.limit);

    return {
      items: result.items.map(toSummary),
      meta: {
        hasNext: input.page < totalPages,
        hasPrevious: input.page > 1 && totalPages > 0,
        limit: input.limit,
        page: input.page,
        total: result.total,
        totalPages,
      },
    };
  }

  async detail(userId: string, id: string): Promise<ReviewDetail> {
    const review = await this.repository.findByIdForUser(userId, id);

    if (!review) {
      throw notFound();
    }

    return toDetail(review);
  }

  async remove(userId: string, id: string, now = new Date()): Promise<void> {
    const deleted = await this.repository.softDeleteForUser(userId, id, now);

    if (!deleted) {
      throw notFound();
    }
  }

  async retry(userId: string, id: string, now = new Date()): Promise<ReviewSummary> {
    return this.transition(userId, id, "PENDING", now);
  }

  async cancel(userId: string, id: string, now = new Date()): Promise<ReviewSummary> {
    return this.transition(userId, id, "CANCELLED", now);
  }

  private async transition(
    userId: string,
    id: string,
    toStatus: ReviewStatus,
    now: Date,
  ): Promise<ReviewSummary> {
    const review = await this.repository.transitionForUser(userId, id, {
      fromStatuses: allowedSourceStatuses(toStatus),
      now,
      toStatus,
    });

    if (review) {
      return toSummary(review);
    }

    const current = await this.repository.findByIdForUser(userId, id);

    if (!current) {
      throw notFound();
    }

    throw invalidTransition();
  }
}
