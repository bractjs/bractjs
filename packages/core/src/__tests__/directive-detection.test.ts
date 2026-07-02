import { describe, expect, test } from "bun:test";
import { hasServerDirective, hasClientDirective } from "../shared/directives.ts";

// The action registry, module-registry codegen, and build plugins all share
// this detector. A module detected by one but not another either leaks server
// source to the browser or silently 404s its actions — so the edge cases here
// are the contract.

describe("hasServerDirective", () => {
  test("plain directive at file start", () => {
    expect(hasServerDirective(`"use server";\nexport function a() {}`)).toBe(true);
    expect(hasServerDirective(`'use server';\nexport function a() {}`)).toBe(true);
  });

  test("no directive", () => {
    expect(hasServerDirective(`export function a() {}`)).toBe(false);
    expect(hasServerDirective("")).toBe(false);
  });

  test("directive after leading line comment", () => {
    expect(hasServerDirective(`// server actions for the board\n"use server";\n`)).toBe(true);
  });

  test("directive after leading block comment", () => {
    expect(hasServerDirective(`/* copyright */\n"use server";\n`)).toBe(true);
    expect(hasServerDirective(`/**\n * actions\n */\n"use server";\n`)).toBe(true);
  });

  test("directive after mixed comments and blank lines", () => {
    expect(hasServerDirective(`\n// a\n\n/* b */\n  "use server";\n`)).toBe(true);
  });

  test("indented directive at file start", () => {
    expect(hasServerDirective(`  "use server";\n`)).toBe(true);
  });

  test("UTF-8 BOM before the directive", () => {
    expect(hasServerDirective(`﻿"use server";\n`)).toBe(true);
    expect(hasServerDirective(`﻿// hi\n"use server";\n`)).toBe(true);
  });

  test("CRLF line endings", () => {
    expect(hasServerDirective(`// a\r\n"use server";\r\n`)).toBe(true);
  });

  test("directive mid-file at a line start does NOT match", () => {
    // Previously the build plugin used /m, which matched here and replaced the
    // whole module's exports with fetch proxies.
    const src = `export const a = 1;\n"use server";\n`;
    expect(hasServerDirective(src)).toBe(false);
  });

  test("directive-looking string inside code does NOT match", () => {
    expect(hasServerDirective(`const s = [\n"use server",\n].join("");`)).toBe(false);
    expect(hasServerDirective(`export const tpl = \`\n"use server";\n\`;`)).toBe(false);
  });

  test("does not match the client directive", () => {
    expect(hasServerDirective(`"use client";\n`)).toBe(false);
  });
});

describe("hasClientDirective", () => {
  test("mirrors the server detector's prologue rules", () => {
    expect(hasClientDirective(`"use client";\n`)).toBe(true);
    expect(hasClientDirective(`// interactive island\n'use client';\n`)).toBe(true);
    expect(hasClientDirective(`﻿"use client";\n`)).toBe(true);
    expect(hasClientDirective(`export const a = 1;\n"use client";\n`)).toBe(false);
    expect(hasClientDirective(`"use server";\n`)).toBe(false);
  });
});
