/** Generate the UUID used to deduplicate mutating V2 API requests. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
