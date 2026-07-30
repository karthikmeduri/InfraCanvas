declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Minimal shape of the D1 binding. The full type ships with
 * `@cloudflare/workers-types`; this project only needs enough for Drizzle's
 * `drizzle-orm/d1` adapter to typecheck without pulling in that dependency.
 */
declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
  raw<T = unknown>(): Promise<T[]>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & { DB?: D1Database };
}
