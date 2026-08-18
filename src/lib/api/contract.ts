export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    retryable: boolean;
    correlationId: string;
  };
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  correlationId: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function apiError(
  status: number,
  code: string,
  message: string,
  correlationId: string,
  retryable = false,
  fieldErrors?: Record<string, string[]>,
): Response {
  const error: ApiFailure["error"] = { code, message, retryable, correlationId };
  if (fieldErrors) error.fieldErrors = fieldErrors;
  return Response.json({ ok: false, error } satisfies ApiFailure, { status });
}
