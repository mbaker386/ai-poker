// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS, decodeSettings, encodeSettings, loadSettings, saveSettings, sanitizeSettings,
  type Settings,
} from "../src/settings";
import { CHASED, type Card } from "../src/stacks";

const sample: Settings = {
  stackId: "custom",
  customStack: CHASED,
  customName: "Test stack",
  forceConfigs: [["AC", "4H", "7S", "10D", "KC"], ["2C", "3D", "4S", "5H", "6C"]] as Card[][],
  jokerEnabled: false,
  doubleTap: true,
  suitOrder: "shocked",
  diagnostics: true,
};

describe("localStorage persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("loads defaults when nothing stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("round-trips settings", () => {
    saveSettings(sample);
    expect(loadSettings()).toEqual(sample);
  });
  it("survives corrupted storage", () => {
    window.localStorage.setItem("ai-poker:v1", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("sanitizes an invalid custom stack back to defaults", () => {
    const s = sanitizeSettings({ stackId: "custom", customStack: ["AS", "AS"], jokerEnabled: true });
    expect(s.customStack).toBeNull();
    expect(s.stackId).toBe("aronson"); // custom without a valid stack falls back
  });
  it("sanitizes unknown stackId to default", () => {
    expect(sanitizeSettings({ stackId: "nope" }).stackId).toBe("aronson");
  });
});

describe("backup codes", () => {
  it("encodes and decodes a full setup", () => {
    const code = encodeSettings(sample);
    expect(code.startsWith("AIP1.")).toBe(true);
    const decoded = decodeSettings(code);
    expect("settings" in decoded).toBe(true);
    if ("settings" in decoded) {
      expect(decoded.settings.stackId).toBe("custom");
      expect(decoded.settings.customStack).toEqual(CHASED);
      expect(decoded.settings.customName).toBe("Test stack");
      expect(decoded.settings.forceConfigs).toEqual(sample.forceConfigs);
      expect(decoded.settings.jokerEnabled).toBe(false);
      expect(decoded.settings.doubleTap).toBe(true);
      expect(decoded.settings.suitOrder).toBe("shocked");
    }
  });
  it("older codes without the new fields fall back to defaults", () => {
    // A v1.0 code carried only s,n,c,f,j — no t/o.
    const legacy = "AIP1." + btoa(JSON.stringify({ v: 1, s: "mnemonica", n: "X", c: null, f: "", j: true }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const decoded = decodeSettings(legacy);
    if ("settings" in decoded) {
      expect(decoded.settings.stackId).toBe("mnemonica");
      expect(decoded.settings.doubleTap).toBe(false);
      expect(decoded.settings.suitOrder).toBe("chased");
    } else {
      throw new Error("decode failed");
    }
  });
  it("encodes defaults compactly", () => {
    const code = encodeSettings(DEFAULT_SETTINGS);
    const decoded = decodeSettings(code);
    if ("settings" in decoded) {
      expect(decoded.settings.stackId).toBe("aronson");
      expect(decoded.settings.forceConfigs).toEqual(DEFAULT_SETTINGS.forceConfigs);
    } else {
      throw new Error("decode failed");
    }
  });
  it("rejects garbage, wrong prefix, and truncated codes", () => {
    expect("error" in decodeSettings("hello")).toBe(true);
    expect("error" in decodeSettings("XYZ1.abcdef")).toBe(true);
    const code = encodeSettings(sample);
    expect("error" in decodeSettings(code.slice(0, 12))).toBe(true);
  });
  it("tolerates surrounding whitespace", () => {
    const code = "  " + encodeSettings(DEFAULT_SETTINGS) + "\n";
    expect("settings" in decodeSettings(code)).toBe(true);
  });
  it("handles unicode custom names", () => {
    const s = { ...sample, customName: "Grüße ♦ stack" };
    const decoded = decodeSettings(encodeSettings(s));
    if ("settings" in decoded) expect(decoded.settings.customName).toBe("Grüße ♦ stack");
    else throw new Error("decode failed");
  });
});
