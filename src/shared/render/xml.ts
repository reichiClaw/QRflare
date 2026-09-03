/** Escapes text for safe insertion into XML/SVG text nodes and attribute values. */
export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

/** Formats a number with at most three decimals and no trailing zeros. */
export function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/^(-?)0\./, '$1.');
}
