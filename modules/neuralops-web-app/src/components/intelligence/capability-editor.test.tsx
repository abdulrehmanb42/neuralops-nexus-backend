import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CapabilityEditor } from "./capability-editor";
import { useState } from "react";
import { defaultCapabilityConfig, type CapabilityConfig } from "@/lib/mcp-capabilities";

function Host({ initial }: { initial: CapabilityConfig }) {
  const [value, setValue] = useState<CapabilityConfig>(initial);
  return (
    <>
      <CapabilityEditor idPrefix="t" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}
const current = () => JSON.parse(screen.getByTestId("value").textContent ?? "{}") as CapabilityConfig;

describe("CapabilityEditor — the checklist", () => {
  it("ticks the capabilities present in the value and counts them", () => {
    render(<CapabilityEditor idPrefix="t" value={defaultCapabilityConfig()} onChange={() => {}} />);
    expect(screen.getByLabelText(/^Filesystem/)).toBeChecked();
    expect(screen.getByLabelText(/^Shell/)).toBeChecked();
    expect(screen.getByLabelText(/^Web search/)).toBeChecked();
    expect(screen.getByLabelText(/^Web fetch/)).toBeChecked();
    expect(screen.getByLabelText(/^Thinking/)).not.toBeChecked();
    expect(screen.getByText("(4 on)")).toBeInTheDocument();
  });

  it("ticking adds the capability with the template's defaults; unticking removes the key", () => {
    const onChange = vi.fn();
    render(<CapabilityEditor idPrefix="t" value={{ planning: {} }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/^Thinking/));
    expect(onChange).toHaveBeenLastCalledWith({ planning: {}, thinking: { effort: "medium" } });
    fireEvent.click(screen.getByLabelText(/^Planning/));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("edits a capability's settings in place, keeping fields it does not know", () => {
    const onChange = vi.fn();
    render(<CapabilityEditor idPrefix="t" value={{ shell: { cwd: ".", allowed_commands: ["ls"], denied_commands: [], extra: 1 } }} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Allowed commands" })).getByRole("button", { name: "cat" }));
    expect(onChange).toHaveBeenLastCalledWith({ shell: { cwd: ".", allowed_commands: ["ls", "cat"], denied_commands: [], extra: 1 } });
    fireEvent.change(screen.getByLabelText("Working folder"), { target: { value: "src" } });
    expect(onChange).toHaveBeenLastCalledWith({ shell: { cwd: "src", allowed_commands: ["ls"], denied_commands: [], extra: 1 } });
  });

  it("collects globs as chips and reads the thinking effort from a select", () => {
    const onChange = vi.fn();
    render(<CapabilityEditor idPrefix="t" value={{ filesystem: { root_dir: ".", denied_patterns: ["*.pem"] }, thinking: { effort: "low" } }} onChange={onChange} />);
    const denied = screen.getByRole("textbox", { name: "Denied globs" });
    fireEvent.change(denied, { target: { value: "secrets/**" } });
    fireEvent.keyDown(denied, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filesystem: { root_dir: ".", denied_patterns: ["*.pem", "secrets/**"] } }));
    fireEvent.click(within(screen.getByRole("group", { name: "Denied globs" })).getByRole("button", { name: "Remove *.pem" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filesystem: { root_dir: ".", denied_patterns: [] } }));
    expect(screen.getByRole("group", { name: "Allowed globs" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Read-only globs" })).toBeInTheDocument();
    expect(screen.getByLabelText("Effort")).toHaveValue("low");
    fireEvent.change(screen.getByLabelText("Effort"), { target: { value: "high" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ thinking: { effort: "high" } }));
  });

  it("a glob typed but not yet entered survives an edit elsewhere in the row", () => {
    // The stored list has no room for a half-typed entry, so a value re-derived
    // from it on every parent render used to eat what was being typed.
    render(<Host initial={{ filesystem: { root_dir: "." } }} />);
    const denied = screen.getByRole("textbox", { name: "Denied globs" });
    fireEvent.change(denied, { target: { value: "*.pe" } });
    fireEvent.change(screen.getByLabelText("Root folder"), { target: { value: "src" } });
    expect(denied).toHaveValue("*.pe");
    expect(current()).toEqual({ filesystem: { root_dir: "src" } });
  });

  it("lists a capability the catalogue does not know and keeps it verbatim", () => {
    const onChange = vi.fn();
    render(<CapabilityEditor idPrefix="t" value={{ "Brand New": { a: 1 } }} onChange={onChange} />);
    expect(screen.getByLabelText(/^Brand New/)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/^Brand New/));
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});

describe("CapabilityEditor — JSON view", () => {
  it("shows the whole config, applies valid edits, and blocks on invalid text", () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    render(<CapabilityEditor idPrefix="t" value={{ web_fetch: { local: true } }} onChange={onChange} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: /edit as json/i }));
    const area = screen.getByLabelText("Capabilities JSON") as HTMLTextAreaElement;
    expect(area.value).toBe(JSON.stringify({ web_fetch: { local: true } }, null, 2));
    fireEvent.change(area, { target: { value: '{"web_fetch": {"local": false}, "memory": {}}' } });
    expect(onChange).toHaveBeenLastCalledWith({ web_fetch: { local: false }, memory: {} });
    expect(onError).toHaveBeenLastCalledWith(null);
    fireEvent.change(area, { target: { value: "{ broken" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/JSON object/);
    expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/JSON object/));
    // Cannot leave the JSON view on broken text — that would silently revert.
    fireEvent.click(screen.getByRole("button", { name: /back to the list/i }));
    expect(screen.getByLabelText("Capabilities JSON")).toBeInTheDocument();
  });
});
