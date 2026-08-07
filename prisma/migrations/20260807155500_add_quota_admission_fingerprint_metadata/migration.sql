ALTER TABLE "quota_admissions"
    ADD COLUMN "request_fingerprint_hash" CHAR(64),
    ADD COLUMN "fingerprint_version" INTEGER;
