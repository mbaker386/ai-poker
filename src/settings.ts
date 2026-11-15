// Settings persistence (localStorage) and portable backup codes.
//
// Backup code format: "AIP1." + base64url(UTF-8 JSON payload)
// The payload carries stack selection, custom stack, force list, and the
// joker-button toggle — everything needed to clone a setup onto another
// device or share it with another performer.

import { parseForceText, parseStackText, forceTextFrom } from "./logic";
import { DEFAULT_FORCE, STACKS, type Card, type SuitOrder } from "./stacks";

export type { SuitOrder };

export interface Settings {
  stackId: string;               // one of STACKS ids, or "custom"
  customStack: Card[] | null;
  customName: string;
  forceConfigs: Card[][];
  jokerEnabled: boolean;
  doubleTap: boolean;            // single tap = lower candidate, double tap = higher
  suitOrder: SuitOrder;          // suit-button order AND the coded suit encoding
  diagnostics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  stackId: "aronson",
  customStack: null,
  customName: "Custom stack",
  forceConfigs: DEFAULT_FORCE,
  jokerEnabled: true,
  doubleTap: false,
  suitOrder: "chased",
  diagnostics: false,
};

const STORAGE_KEY = "ai-poker:v1";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // private mode / storage disabled
  }
}

/** Validate an arbitrary parsed object into safe Settings (falls back per-field). */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.customStack)) {
    const parsed = parseStackText((o.customStack as string[]).join(" "));
    if ("stack" in parsed) s.customStack = parsed.stack;
  }
  if (typeof o.customName === "string" && o.customName.trim()) {
    s.customName = o.customName.slice(0, 60);
  }
  if (typeof o.stackId === "string") {
    const valid = STACKS.some((st) => st.id === o.stackId) || (o.stackId === "custom" && s.customStack);
    if (valid) s.stackId = o.stackId;
  }
  if (Array.isArray(o.forceConfigs)) {
    const text = (o.forceConfigs as string[][]).map((c) => (Array.isArray(c) ? c.join(" ") : "")).join("\n");
    const parsed = parseForceText(text);
    if ("configs" in parsed) s.forceConfigs = parsed.configs;
  }
  if (typeof o.jokerEnabled === "boolean") s.jokerEnabled = o.jokerEnabled;
  if (typeof o.doubleTap === "boolean") s.doubleTap = o.doubleTap;
  if (o.suitOrder === "chased" || o.suitOrder === "shocked") s.suitOrder = o.suitOrder;
  if (typeof o.diagnostics === "boolean") s.diagnostics = o.diagnostics;
  return s;
}

export function loadSettings(): Settings {
  const st = storage();
  if (!st) return { ...DEFAULT_SETTINGS };
  try {
    const raw = st.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  const st = storage();
  if (!st) return;
  try {
    st.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

/* ---------------- backup codes ---------------- */

const CODE_PREFIX = "AIP1.";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeSettings(s: Settings): string {
  const payload = {
    v: 1,
    s: s.stackId,
    n: s.customName,
    c: s.customStack ? s.customStack.join(" ") : null,
    f: forceTextFrom(s.forceConfigs),
    j: s.jokerEnabled,
    t: s.doubleTap,
    o: s.suitOrder,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return CODE_PREFIX + toBase64Url(bytes);
}

export function decodeSettings(code: string): { settings: Settings } | { error: string } {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return { error: "That doesn't look like a backup code." };
  let payload: Record<string, unknown>;
  try {
    const json = new TextDecoder().decode(fromBase64Url(trimmed.slice(CODE_PREFIX.length)));
    payload = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { error: "That code couldn't be read — check that it was copied completely." };
  }

  let customStack: Card[] | null = null;
  if (typeof payload.c === "string" && payload.c.trim()) {
    const parsed = parseStackText(payload.c);
    if ("error" in parsed) return { error: `Custom stack in code: ${parsed.error}` };
    customStack = parsed.stack;
  }

  let forceConfigs = DEFAULT_FORCE;
  if (typeof payload.f === "string") {
    const parsed = parseForceText(payload.f);
    if ("error" in parsed) return { error: `Force list in code: ${parsed.error}` };
    forceConfigs = parsed.configs;
  }

  const settings = sanitizeSettings({
    stackId: payload.s,
    customStack,
    customName: payload.n,
    forceConfigs,
    jokerEnabled: payload.j,
    doubleTap: payload.t,
    suitOrder: payload.o,
  });
  return { settings };
}
