export type RedisOperation =
  | "connect"
  | "command"
  | "quota-reservation"
  | "quota-admission-reservation"
  | "quota-admission-compensation"
  | "lock-acquisition"
  | "lock-renewal"
  | "lock-release"
  | "stream-acquisition"
  | "stream-release";

export class RedisUnavailableError extends Error {
  readonly code = "REDIS_UNAVAILABLE" as const;
  readonly operation: RedisOperation;

  constructor(operation: RedisOperation) {
    super("Redis is unavailable.");
    this.name = "RedisUnavailableError";
    this.operation = operation;
  }
}

export class RedisCommandError extends Error {
  readonly code = "REDIS_COMMAND_FAILED" as const;
  readonly operation: RedisOperation;

  constructor(operation: RedisOperation) {
    super("Redis command failed.");
    this.name = "RedisCommandError";
    this.operation = operation;
  }
}

export class RedisConfigurationError extends Error {
  readonly code = "REDIS_CONFIGURATION_INVALID" as const;
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Invalid Redis configuration: ${variableName}.`);
    this.name = "RedisConfigurationError";
    this.variableName = variableName;
  }
}

export class RedisInputError extends Error {
  readonly code = "REDIS_INPUT_INVALID" as const;
  readonly field: string;

  constructor(field: string) {
    super(`Invalid Redis primitive input: ${field}.`);
    this.name = "RedisInputError";
    this.field = field;
  }
}
