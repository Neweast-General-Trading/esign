/**
 * When a middle signatory field is removed (e.g. fields #1 and #3 remain),
 * remap data-signer-order values to a dense 1..n sequence so they match
 * the send queue (Signatory #1, #2, ...).
 */
export function compactSignerOrdersInHtml(html: string): string {
  if (!html || !/data-signer-order/i.test(html)) return html;

  const found = new Set<number>();
  const orderAttr = /data-signer-order\s*=\s*(["']?)(\d+)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = orderAttr.exec(html)) !== null) {
    const n = Number(match[2]);
    if (n > 0) found.add(n);
  }

  const unique = [...found].sort((a, b) => a - b);
  if (unique.length === 0) return html;

  const alreadyDense = unique.every((n, index) => n === index + 1);
  if (alreadyDense) return html;

  const map = new Map(unique.map((old, index) => [old, index + 1]));

  return html.replace(
    /data-signer-order\s*=\s*(["']?)(\d+)\1/gi,
    (_full, quote: string, raw: string) => {
      const n = Number(raw);
      if (n <= 0) return `data-signer-order=${quote || ""}${n}${quote || ""}`;
      const next = map.get(n) ?? n;
      const q = quote || "";
      return `data-signer-order=${q}${next}${q}`;
    },
  );
}

/** Unique positive signer orders present in document HTML (sorted). */
export function listSignerOrdersInHtml(html: string): number[] {
  if (!html) return [];
  const found = new Set<number>();
  const orderAttr = /data-signer-order\s*=\s*(["']?)(\d+)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = orderAttr.exec(html)) !== null) {
    const n = Number(match[2]);
    if (n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}
