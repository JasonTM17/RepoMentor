import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import type { CookieOptions } from "express";

import { isAuthIdentifier } from "./auth-id.js";

export { AUTH_IDENTIFIER_PATTERN, isAuthIdentifier } from "./auth-id.js";

export function isAuthTokenId(value: unknown): value is string {
  return typeof value === "string" && AUTH_TOKEN_ID_PATTERN.test(value);
}

export const AUTH_TOKEN_CONFIG = Symbol("AUTH_TOKEN_CONFIG");
export const REFRESH_COOKIE_NAME = "repomentor_refresh_token";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
export const AUTH_TOKEN_ISSUER = "repomentor-api";
export const AUTH_TOKEN_AUDIENCE = "repomentor-web";
export const AUTH_TOKEN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_SECRET_BYTES = 32;
const MIN_ACCESS_TTL_SECONDS = 60;
const MAX_ACCESS_TTL_SECONDS = 60 * 60;
const MIN_REFRESH_TTL_SECONDS = 60 * 60;
const MAX_REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 30;

export type CookieSameSite = "strict" | "lax" | "none";

export interface AuthTokenConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly cookieSecure: boolean;
  readonly cookieSameSite: CookieSameSite;
}

export interface IssuedToken {
  readonly value: string;
  readonly expiresAt: Date;
  readonly expiresInSeconds: number;
}

export interface AccessTokenClaims {
  readonly subject: string;
  readonly sessionId: string;
  readonly tokenId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export type RefreshTokenClaims = AccessTokenClaims;

interface JwtHeader {
  readonly alg: "HS256";
  readonly typ: "JWT";
}

interface JwtPayload {
  readonly aud: typeof AUTH_TOKEN_AUDIENCE;
  readonly exp: number;
  readonly iat: number;
  readonly iss: typeof AUTH_TOKEN_ISSUER;
  readonly jti: string;
  readonly sid: string;
  readonly sub: string;
  readonly typ: "access" | "refresh";
}

export class AuthTokenConfigError extends Error {
  constructor() {
    super("Authentication token configuration is invalid.");
    this.name = "AuthTokenConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSecret(variableName: string, environment: NodeJS.ProcessEnv): string {
  const value = environment[variableName]?.trim();

  if (!value || Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES) {
    throw new AuthTokenConfigError();
  }

  return value;
}

function parseBoundedSeconds(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(rawValue.trim())) {
    throw new AuthTokenConfigError();
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AuthTokenConfigError();
  }

  void variableName;
  return value;
}

function parseBoolean(
  variableName: string,
  rawValue: string | undefined,
  defaultValue: boolean,
): boolean {
  if (rawValue === undefined || rawValue.trim() === "") {
    return defaultValue;
  }

  const normalizedValue = rawValue.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  void variableName;
  throw new AuthTokenConfigError();
}

function parseSameSite(rawValue: string | undefined): CookieSameSite {
  const normalizedValue = rawValue?.trim().toLowerCase();

  if (normalizedValue === undefined || normalizedValue === "") {
    return "lax";
  }

  if (normalizedValue === "strict" || normalizedValue === "lax" || normalizedValue === "none") {
    return normalizedValue;
  }

  throw new AuthTokenConfigError();
}

export function parseAuthTokenConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AuthTokenConfig {
  const accessSecret = parseSecret("JWT_ACCESS_SECRET", environment);
  const refreshSecret = parseSecret("JWT_REFRESH_SECRET", environment);

  if (accessSecret === refreshSecret) {
    throw new AuthTokenConfigError();
  }

  const accessTtlSeconds = parseBoundedSeconds(
    "JWT_ACCESS_EXPIRES_IN",
    environment.JWT_ACCESS_EXPIRES_IN,
    DEFAULT_ACCESS_TTL_SECONDS,
    MIN_ACCESS_TTL_SECONDS,
    MAX_ACCESS_TTL_SECONDS,
  );
  const refreshTtlSeconds = parseBoundedSeconds(
    "JWT_REFRESH_EXPIRES_IN",
    environment.JWT_REFRESH_EXPIRES_IN,
    DEFAULT_REFRESH_TTL_SECONDS,
    MIN_REFRESH_TTL_SECONDS,
    MAX_REFRESH_TTL_SECONDS,
  );
  const cookieSecure = parseBoolean(
    "COOKIE_SECURE",
    environment.COOKIE_SECURE,
    environment.NODE_ENV === "production",
  );

  if (environment.NODE_ENV === "production" && !cookieSecure) {
    throw new AuthTokenConfigError();
  }

  const cookieSameSite = parseSameSite(environment.COOKIE_SAME_SITE);

  if (cookieSameSite === "none" && !cookieSecure) {
    throw new AuthTokenConfigError();
  }

  return {
    accessSecret,
    accessTtlSeconds,
    cookieSameSite,
    cookieSecure,
    refreshSecret,
    refreshTtlSeconds,
  };
}

export function tryParseAuthTokenConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AuthTokenConfig | undefined {
  const hasAuthConfiguration = [
    environment.JWT_ACCESS_SECRET,
    environment.JWT_REFRESH_SECRET,
    environment.JWT_ACCESS_EXPIRES_IN,
    environment.JWT_REFRESH_EXPIRES_IN,
    environment.COOKIE_SECURE,
    environment.COOKIE_SAME_SITE,
  ].some((value) => value !== undefined && value.trim() !== "");

  return hasAuthConfiguration ? parseAuthTokenConfig(environment) : undefined;
}

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value.");
  }

  const decoded = Buffer.from(value, "base64url");

  if (decoded.toString("base64url") !== value) {
    throw new Error("Non-canonical base64url value.");
  }

  return decoded;
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(JSON.stringify(value));
}

function decodeJson(value: string): unknown {
  return JSON.parse(decodeBase64Url(value).toString("utf8")) as unknown;
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function invalidToken(): UnauthorizedException {
  return new UnauthorizedException();
}

function assertTokenIdentifier(value: unknown): asserts value is string {
  if (!isAuthIdentifier(value)) {
    throw invalidToken();
  }
}

function assertJwtPayload(value: unknown): asserts value is JwtPayload {
  if (!isRecord(value)) {
    throw invalidToken();
  }

  const issuedAt = value.iat;
  const expiresAt = value.exp;

  if (
    value.aud !== AUTH_TOKEN_AUDIENCE ||
    value.iss !== AUTH_TOKEN_ISSUER ||
    (value.typ !== "access" && value.typ !== "refresh") ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= issuedAt
  ) {
    throw invalidToken();
  }

  if (!isAuthTokenId(value.jti)) {
    throw invalidToken();
  }

  assertTokenIdentifier(value.sid);
  assertTokenIdentifier(value.sub);
}

@Injectable()
export class AuthTokenService {
  private readonly configuredOptions: AuthTokenConfig | undefined;

  constructor(@Optional() @Inject(AUTH_TOKEN_CONFIG) configuredOptions?: AuthTokenConfig) {
    this.configuredOptions = configuredOptions;
  }

  issueAccessToken(subject: string, sessionId: string, now = new Date()): IssuedToken {
    return this.issueToken("access", subject, sessionId, now);
  }

  issueRefreshToken(subject: string, sessionId: string, now = new Date()): IssuedToken {
    return this.issueToken("refresh", subject, sessionId, now);
  }

  verifyAccessToken(token: string, now = new Date()): AccessTokenClaims {
    const payload = this.verifyToken(token, "access", this.resolveConfig().accessSecret, now);
    return this.toClaims(payload);
  }

  verifyRefreshToken(token: string, now = new Date()): RefreshTokenClaims {
    const payload = this.verifyToken(token, "refresh", this.resolveConfig().refreshSecret, now);
    return this.toClaims(payload);
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.resolveConfig().refreshSecret)
      .update(token, "utf8")
      .digest("hex");
  }

  getRefreshCookieOptions(): CookieOptions {
    const config = this.resolveConfig();

    return {
      httpOnly: true,
      maxAge: config.refreshTtlSeconds * 1000,
      path: REFRESH_COOKIE_PATH,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
    };
  }

  getRefreshCookieClearOptions(): CookieOptions {
    const config = this.resolveConfig();

    return {
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
    };
  }

  hashIpAddress(ipAddress: string): string {
    return createHmac("sha256", this.resolveConfig().refreshSecret)
      .update(ipAddress, "utf8")
      .digest("hex");
  }

  private issueToken(
    type: JwtPayload["typ"],
    subject: string,
    sessionId: string,
    now: Date,
  ): IssuedToken {
    assertTokenIdentifier(subject);
    assertTokenIdentifier(sessionId);

    const config = this.resolveConfig();
    const issuedAtSeconds = this.toSeconds(now);
    const expiresInSeconds = type === "access" ? config.accessTtlSeconds : config.refreshTtlSeconds;
    const payload: JwtPayload = {
      aud: AUTH_TOKEN_AUDIENCE,
      exp: issuedAtSeconds + expiresInSeconds,
      iat: issuedAtSeconds,
      iss: AUTH_TOKEN_ISSUER,
      jti: encodeBase64Url(randomBytes(16)),
      sid: sessionId,
      sub: subject,
      typ: type,
    };
    const header: JwtHeader = { alg: "HS256", typ: "JWT" };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac("sha256", this.secretFor(type, config))
      .update(signingInput)
      .digest();

    return {
      expiresAt: new Date(payload.exp * 1000),
      expiresInSeconds,
      value: `${signingInput}.${encodeBase64Url(signature)}`,
    };
  }

  private verifyToken(
    token: string,
    expectedType: JwtPayload["typ"],
    secret: string,
    now: Date,
  ): JwtPayload {
    try {
      const segments = token.split(".");

      if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
        throw invalidToken();
      }

      const [encodedHeader, encodedPayload, encodedSignature] = segments;

      if (
        encodedHeader === undefined ||
        encodedPayload === undefined ||
        encodedSignature === undefined
      ) {
        throw invalidToken();
      }

      const header = decodeJson(encodedHeader);
      const payload = decodeJson(encodedPayload);

      if (
        !isRecord(header) ||
        header.alg !== "HS256" ||
        header.typ !== "JWT" ||
        typeof encodedSignature !== "string"
      ) {
        throw invalidToken();
      }

      const expectedSignature = createHmac("sha256", secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
      const receivedSignature = decodeBase64Url(encodedSignature);

      if (!safeEqual(expectedSignature, receivedSignature)) {
        throw invalidToken();
      }

      assertJwtPayload(payload);

      if (payload.typ !== expectedType) {
        throw invalidToken();
      }

      const nowSeconds = this.toSeconds(now);

      if (payload.exp <= nowSeconds || payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
        throw invalidToken();
      }

      return payload;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw invalidToken();
    }
  }

  private toClaims(payload: JwtPayload): AccessTokenClaims {
    return {
      expiresAt: new Date(payload.exp * 1000),
      issuedAt: new Date(payload.iat * 1000),
      sessionId: payload.sid,
      subject: payload.sub,
      tokenId: payload.jti,
    };
  }

  private resolveConfig(): AuthTokenConfig {
    return this.configuredOptions ?? parseAuthTokenConfig();
  }

  private secretFor(type: JwtPayload["typ"], config: AuthTokenConfig): string {
    return type === "access" ? config.accessSecret : config.refreshSecret;
  }

  private toSeconds(date: Date): number {
    const milliseconds = date.getTime();

    if (!Number.isFinite(milliseconds)) {
      throw new AuthTokenConfigError();
    }

    return Math.floor(milliseconds / 1000);
  }
}
