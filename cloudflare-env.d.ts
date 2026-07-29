declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare type D1Database = any;

declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}
