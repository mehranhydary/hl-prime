/**
 * Output formatting for CLI commands.
 */

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const sep = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]))
    .join(" | ");
  const dataLines = rows
    .map((r) =>
      r.map((c, i) => (c ?? "").padEnd(colWidths[i])).join(" | "),
    )
    .join("\n");

  return `${headerLine}\n${sep}\n${dataLines}`;
}

export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(formatJson(data));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(formatJson(data));
  }
}
