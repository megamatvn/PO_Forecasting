/** Parse a JSON request body, returning null when the body is missing or malformed. */
export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}
