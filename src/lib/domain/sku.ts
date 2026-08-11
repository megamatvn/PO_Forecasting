export function canonicalizeSku(
  rawSku: string,
  aliases: ReadonlyMap<string, string>,
): string {
  const normalized = rawSku.trim().toUpperCase();

  return aliases.get(normalized) ?? normalized;
}
