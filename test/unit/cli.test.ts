import { describe, it, expect } from "vitest";
import { formatJson, formatTable, output } from "../../src/cli/output.js";
import { createProgram } from "../../src/cli/program.js";

// ── Output formatting ─────────────────────────────────────────────────

describe("formatJson", () => {
  it("formats object as pretty JSON", () => {
    const result = formatJson({ foo: "bar", num: 42 });
    expect(result).toBe('{\n  "foo": "bar",\n  "num": 42\n}');
  });

  it("formats array", () => {
    const result = formatJson([1, 2, 3]);
    expect(result).toBe("[\n  1,\n  2,\n  3\n]");
  });

  it("formats null", () => {
    expect(formatJson(null)).toBe("null");
  });
});

describe("formatTable", () => {
  it("formats headers and rows with alignment", () => {
    const result = formatTable(
      ["Name", "Value"],
      [["BTC", "42000"], ["ETH", "3200"]],
    );
    const lines = result.split("\n");
    expect(lines).toHaveLength(4); // header + separator + 2 rows
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Value");
    expect(lines[2]).toContain("BTC");
    expect(lines[3]).toContain("ETH");
  });

  it("pads columns to longest value", () => {
    const result = formatTable(
      ["Col"],
      [["short"], ["a very long value"]],
    );
    const lines = result.split("\n");
    // Header should be padded to match longest value
    expect(lines[0].length).toBeGreaterThanOrEqual("a very long value".length);
  });

  it("handles empty rows", () => {
    const result = formatTable(["A", "B"], []);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3); // header + separator + empty data line
  });
});

describe("output", () => {
  it("outputs JSON when json=true", () => {
    const spy = vi.fn();
    const origLog = console.log;
    console.log = spy;
    output({ test: true }, true);
    console.log = origLog;
    expect(spy).toHaveBeenCalledWith('{\n  "test": true\n}');
  });

  it("outputs string directly when json=false and data is string", () => {
    const spy = vi.fn();
    const origLog = console.log;
    console.log = spy;
    output("hello world", false);
    console.log = origLog;
    expect(spy).toHaveBeenCalledWith("hello world");
  });
});

// ── Program structure ─────────────────────────────────────────────────

describe("createProgram", () => {
  it("creates a program with expected commands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("markets");
    expect(commandNames).toContain("book");
    expect(commandNames).toContain("funding");
    expect(commandNames).toContain("quote");
    expect(commandNames).toContain("long");
    expect(commandNames).toContain("short");
    expect(commandNames).toContain("positions");
    expect(commandNames).toContain("balance");
  });

  it("sets program name and version", () => {
    const program = createProgram();
    expect(program.name()).toBe("hp");
    expect(program.version()).toBe("0.1.0");
  });

  it("has global options", () => {
    const program = createProgram();
    const optionFlags = program.options.map((o) => o.long);
    expect(optionFlags).toContain("--testnet");
    expect(optionFlags).toContain("--key");
    expect(optionFlags).toContain("--key-env");
    expect(optionFlags).toContain("--log-level");
    expect(optionFlags).toContain("--json");
  });
});

// ── We need vi for the output spy tests ───────────────────────────────
import { vi } from "vitest";
