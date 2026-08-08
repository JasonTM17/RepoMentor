DO $$
BEGIN
    CREATE TYPE "AuditAction" AS ENUM (
        'AUTH_REGISTER',
        'AUTH_LOGIN',
        'SESSION_REFRESH',
        'SESSION_LOGOUT',
        'SESSION_LOGOUT_ALL',
        'AUTH_ME',
        'AUTH_PASSWORD_CHANGE',
        'REVIEW_CREATE',
        'REVIEW_LIST',
        'REVIEW_READ',
        'REVIEW_BULK_DELETE',
        'REVIEW_DELETE',
        'REVIEW_RETRY',
        'REVIEW_CANCEL',
        'REVIEW_PROCESS',
        'REVIEW_EVENTS_READ',
        'REVIEW_RESULT_READ'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "AuditActorType" AS ENUM ('ANONYMOUS', 'AUTHENTICATED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" VARCHAR(25) NOT NULL,
    "action" "AuditAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "user_id" VARCHAR(64),
    "session_id" VARCHAR(64),
    "request_id" VARCHAR(128) NOT NULL,
    "route" VARCHAR(128) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "target_id" VARCHAR(64),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_status_code_check" CHECK ("status_code" BETWEEN 100 AND 599)
);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_occurred_at_idx"
    ON "audit_logs"("user_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "audit_logs_session_id_occurred_at_idx"
    ON "audit_logs"("session_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "audit_logs_action_occurred_at_idx"
    ON "audit_logs"("action", "occurred_at");

CREATE INDEX IF NOT EXISTS "audit_logs_request_id_idx"
    ON "audit_logs"("request_id");
