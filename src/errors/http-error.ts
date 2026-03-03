import { KanarioError } from "./kanario-error.ts";

export type HttpErrorMeta = {
  method: string;
  url: string;
  status: number;
  statusText: string;
  body: string;
};

export class HttpError extends KanarioError<HttpErrorMeta> {
  static is(err: unknown): err is HttpError {
    return err instanceof HttpError;
  }

  constructor(method: string, url: string, status: number, statusText: string, body: string) {
    super(
      "http_error",
      `${method} ${url} failed: ${status} ${statusText}`,
      { method, url, status, statusText, body },
    );
  }
}
