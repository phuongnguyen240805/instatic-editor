/**
 * scripts/lcov-to-istanbul.ts
 *
 * Convert Bun's LCOV coverage output (`.coverage/lcov.info`) into the Istanbul
 * `coverage-final.json` format that `fallow health --coverage <path>` expects.
 *
 * Bun emits LCOV via `bun test --coverage --coverage-reporter=lcov`, but
 * fallow's CRAP scorer wants Istanbul JSON. The two formats overlap enough
 * that a focused converter (function map + statement map keyed by line)
 * gives fallow a strict superset of what it needs to compute coverage:
 *   - `f` / `fnMap` from LCOV's `FN` / `FNDA` records — fallow's primary
 *     signal for per-function coverage.
 *   - `s` / `statementMap` from LCOV's `DA` records — used as a fallback
 *     line-coverage signal.
 *   - `b` / `branchMap` left empty: LCOV's `BRDA` data uses block IDs that
 *     don't translate to Istanbul's branch shape without source-map context.
 *     CRAP is dominated by function coverage in practice, so this is fine.
 *
 * Run with `bun run scripts/lcov-to-istanbul.ts [in.lcov] [out.json]`.
 * Defaults to `.coverage/lcov.info` → `.coverage/coverage-final.json`.
 *
 * The `wired:coverage` script in package.json composes
 *   `bun test --coverage` → this converter → `npx fallow health --coverage`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface IstanbulRange {
  start: { line: number; column: number }
  end: { line: number; column: number }
}

interface IstanbulFunction {
  name: string
  decl: IstanbulRange
  loc: IstanbulRange
  line: number
}

interface IstanbulFileCoverage {
  path: string
  statementMap: Record<string, IstanbulRange>
  fnMap: Record<string, IstanbulFunction>
  branchMap: Record<string, never>
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, never>
}

type IstanbulCoverage = Record<string, IstanbulFileCoverage>

interface LcovFunction {
  line: number
  name: string
  hits: number
}

interface LcovFileRecord {
  path: string
  functions: LcovFunction[]
  /** line number → hit count */
  lineHits: Map<number, number>
}

/**
 * Parse an LCOV file into a list of per-file records.
 *
 * LCOV is line-oriented; the records we care about:
 *   SF:<path>                — file path (start of a record)
 *   FN:<line>,<name>         — function declaration at <line>
 *   FNDA:<hits>,<name>       — function hit count
 *   DA:<line>,<hits>         — line hit count
 *   end_of_record            — terminator
 */
function parseLcov(lcov: string): LcovFileRecord[] {
  const records: LcovFileRecord[] = []
  let current: LcovFileRecord | null = null
  // FN comes before FNDA — buffer FNs by name so FNDA can backfill the hit count.
  const fnByName = new Map<string, LcovFunction>()

  for (const rawLine of lcov.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('SF:')) {
      current = { path: line.slice(3), functions: [], lineHits: new Map() }
      fnByName.clear()
      continue
    }
    if (!current) continue

    if (line.startsWith('FN:')) {
      const [lineNumber, ...nameParts] = line.slice(3).split(',')
      const name = nameParts.join(',')
      const fn: LcovFunction = { line: Number(lineNumber), name, hits: 0 }
      current.functions.push(fn)
      fnByName.set(name, fn)
      continue
    }

    if (line.startsWith('FNDA:')) {
      const [hits, ...nameParts] = line.slice(5).split(',')
      const name = nameParts.join(',')
      const fn = fnByName.get(name)
      if (fn) fn.hits = Number(hits)
      continue
    }

    if (line.startsWith('DA:')) {
      const [lineNumber, hits] = line.slice(3).split(',')
      current.lineHits.set(Number(lineNumber), Number(hits))
      continue
    }

    if (line === 'end_of_record') {
      records.push(current)
      current = null
      fnByName.clear()
    }
  }

  if (current) records.push(current)
  return records
}

/** Build a single-line range — fallow only needs the line number for CRAP. */
function lineRange(line: number): IstanbulRange {
  return {
    start: { line, column: 0 },
    end: { line, column: 0 },
  }
}

function toIstanbul(records: LcovFileRecord[]): IstanbulCoverage {
  const out: IstanbulCoverage = {}
  for (const record of records) {
    const absolutePath = isAbsolute(record.path)
      ? record.path
      : resolve(PROJECT_ROOT, record.path)

    const fnMap: Record<string, IstanbulFunction> = {}
    const f: Record<string, number> = {}
    record.functions.forEach((fn, idx) => {
      const id = String(idx)
      const range = lineRange(fn.line)
      fnMap[id] = {
        name: fn.name,
        decl: range,
        loc: range,
        line: fn.line,
      }
      f[id] = fn.hits
    })

    const statementMap: Record<string, IstanbulRange> = {}
    const s: Record<string, number> = {}
    let stmtIdx = 0
    for (const [line, hits] of record.lineHits) {
      const id = String(stmtIdx++)
      statementMap[id] = lineRange(line)
      s[id] = hits
    }

    out[absolutePath] = {
      path: absolutePath,
      statementMap,
      fnMap,
      branchMap: {},
      s,
      f,
      b: {},
    }
  }
  return out
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2)
  const inputPath = resolve(PROJECT_ROOT, inputArg ?? '.coverage/lcov.info')
  const outputPath = resolve(PROJECT_ROOT, outputArg ?? '.coverage/coverage-final.json')

  const lcov = await readFile(inputPath, 'utf-8')
  const records = parseLcov(lcov)
  const istanbul = toIstanbul(records)

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(istanbul), 'utf-8')

  const fileCount = Object.keys(istanbul).length
  const fnCount = Object.values(istanbul).reduce(
    (sum, file) => sum + Object.keys(file.f).length,
    0,
  )
  console.log(
    `[lcov-to-istanbul] ${inputPath} → ${outputPath}\n` +
      `  ${fileCount} files, ${fnCount} functions`,
  )
}

main().catch((err) => {
  console.error('[lcov-to-istanbul]', err)
  process.exit(1)
})
