import { HttpError } from "./errors.ts";

export interface HttpClient {
  request(path: string, init?: RequestInit): Promise<Response>;
  readonly baseUrl: string;
}

export function createHttpClient(options: {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
} = {}): HttpClient {
  const { baseUrl = "", headers: defaultHeaders = {}, timeout } = options;

  return {
    baseUrl,
    async request(path: string, init?: RequestInit): Promise<Response> {
      const url = /^https?:\/\//.test(path) ? path : `${baseUrl}${path}`;

      const mergedHeaders = { ...defaultHeaders, ...init?.headers as Record<string, string> };

      const signal = timeout ? AbortSignal.timeout(timeout) : undefined;

      const res = await fetch(url, {
        ...init,
        headers: mergedHeaders,
        signal: init?.signal ?? signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new HttpError(init?.method ?? "GET", url, res.status, res.statusText, body);
      }

      return res;
    },
  };
}
