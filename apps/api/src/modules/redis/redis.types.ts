export interface RedisEvalOptions {
  readonly keys: readonly string[];
  readonly arguments: readonly string[];
}

export interface RedisSetOptions {
  readonly NX: true;
  readonly PX: number;
}

export interface RedisCommandExecutor {
  eval(script: string, options: RedisEvalOptions): Promise<unknown>;
  set(key: string, value: string, options: RedisSetOptions): Promise<"OK" | null>;
}

export interface RedisClientLike extends RedisCommandExecutor {
  readonly isOpen: boolean;
  connect(): Promise<void>;
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export type RedisClientFactory = (url: string) => RedisClientLike;
