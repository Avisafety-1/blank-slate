#!/usr/bin/env -S node --experimental-strip-types
/**
 * i18n-scan – statisk skanner for hardkodet norsk tekst.
 *
 * Kjøres manuelt:
 *   bun scripts/i18n-scan.ts
 *   # eller
 *   node --experimental-strip-types scripts/i18n-scan.ts
 *
 * Output: `i18n-scan-report.md` i prosjektroten med en heatmap over filer
 * som sannsynligvis inneholder hardkodet norsk tekst – sortert etter antall
 * treff. Brukes som arbeidsliste for inkrementell i18n-migrasjon.
 *
 * Heuristikk:
 *   - Plukker strenger som inneholder æ/ø/å i koden.
 *   - Plukker JSX-tekstnoder (mellom > og <) med æ/ø/å.
 *   - Ekskluderer i18n-filer, autogenererte Supabase-typer, mock-data, tester.
 *
 * Falske positiver er forventet – dette er en arbeidsliste, ikke et fasit.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".turbo", ".git",
]);
const SKIP_FILE_PATTERNS = [
  /\/i18n\//,
  /\/integrations\/supabase\/types\.ts$/,
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\/__tests__\//,
];

interface Hit {
  file: string;
  count: number;
  samples: { line: number; text: string }[];
}

const NORWEGIAN_CHAR = /[æøåÆØÅ]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      const rel = relative(ROOT, full);
      if (SKIP_FILE_PATTERNS.some((p) => p.test(rel))) continue;
      out.push(full);
    }
  }
  return out;
}

function scanFile(path: string): Hit | null {
  const content = readFileSync(path, "utf8");
  if (!NORWEGIAN_CHAR.test(content)) return null;

  const lines = content.split("\n");
  const samples: Hit["samples"] = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!NORWEGIAN_CHAR.test(line)) continue;
    // Hopp over kommentarlinjer
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    count++;
    if (samples.length < 3) {
      samples.push({ line: i + 1, text: trimmed.slice(0, 140) });
    }
  }

  if (count === 0) return null;
  return { file: relative(ROOT, path), count, samples };
}

function main() {
  const files = walk(SRC);
  const hits: Hit[] = [];
  for (const f of files) {
    const h = scanFile(f);
    if (h) hits.push(h);
  }
  hits.sort((a, b) => b.count - a.count);

  const total = hits.reduce((s, h) => s + h.count, 0);
  const lines: string[] = [];
  lines.push(`# i18n-scan – hardkodet norsk i src/`);
  lines.push("");
  lines.push(`Generert: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`**${hits.length}** filer, **${total}** linjer med sannsynlig norsk tekst.`);
  lines.push("");
  lines.push(`Heuristikk: linjer med æ/ø/å (utenom kommentarer). Falske positiver er forventet.`);
  lines.push("");
  lines.push(`## Heatmap`);
  lines.push("");
  lines.push("| # | Fil | Treff |");
  lines.push("|--:|-----|------:|");
  hits.slice(0, 100).forEach((h, idx) => {
    lines.push(`| ${idx + 1} | \`${h.file}\` | ${h.count} |`);
  });

  lines.push("");
  lines.push(`## Topp 20 – med eksempler`);
  lines.push("");
  hits.slice(0, 20).forEach((h) => {
    lines.push(`### ${h.file} (${h.count})`);
    h.samples.forEach((s) => {
      lines.push(`- L${s.line}: \`${s.text.replace(/`/g, "\\`")}\``);
    });
    lines.push("");
  });

  const outPath = join(ROOT, "i18n-scan-report.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Skrev ${outPath} – ${hits.length} filer, ${total} treff.`);
}

main();
