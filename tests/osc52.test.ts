// OSC 52 payload 解析的純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/osc52.test.ts
import assert from "node:assert";
import { test } from "node:test";
import { decodeOsc52 } from "../src/components/Terminal/osc52.ts";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

test("decodes a plain ASCII copy payload", () => {
  assert.strictEqual(decodeOsc52(`c;${b64("hello")}`), "hello");
});

test("decodes multi-byte UTF-8 text", () => {
  assert.strictEqual(decodeOsc52(`c;${b64("helm osc52 測試")}`), "helm osc52 測試");
});

test("accepts an empty selection part", () => {
  assert.strictEqual(decodeOsc52(`;${b64("x")}`), "x");
});

test("accepts multi-char selection parts", () => {
  assert.strictEqual(decodeOsc52(`pc0;${b64("multi")}`), "multi");
});

test("returns null for clipboard read queries", () => {
  assert.strictEqual(decodeOsc52("c;?"), null);
});

test("returns null for malformed base64", () => {
  assert.strictEqual(decodeOsc52("c;***not-base64***"), null);
});

test("returns null when the separator is missing", () => {
  assert.strictEqual(decodeOsc52("bm9zZXA="), null);
});
