#!/usr/bin/env node
// OpenRouter contract check (brief C1). Run with `npm run contract:check`.
//
// It reads OpenRouter's public, keyless catalogue, captures the requests the app really builds
// (scenarios.mjs), and judges each one against what the live endpoints accept (rules.mjs). It
// catches the class of bug where unit tests pass against mocks and the device fails:
// incident 4 (sampling hints sent with require_parameters) and the PCM-only Gemini TTS.
//
// Usage: node scripts/contract/check.mjs [--json]
// Exit codes: 0 every check OK, 1 at least one FAIL, 2 could not reach OpenRouter,
//             3 the check itself could not run (a bug in the check or a moved app constant).
import { pathToFileURL } from 'node:url';

import {
  OpenRouterUnreachableError,
  createPublicReader,
  OPENROUTER_API_BASE,
} from './openrouter-live.mjs';
import * as rules from './rules.mjs';
import { captureRequests, planModels } from './scenarios.mjs';

export const EXIT = { OK: 0, FAIL: 1, UNREACHABLE: 2, INTERNAL: 3 };

/** The endpoint shape the rules read: its tag and the parameters it accepts. */
export function trimEndpoints(endpoints) {
  return endpoints.map((ep) => ({
    tag: String(ep.tag ?? ep.provider_name ?? 'unnamed endpoint'),
    supported: ep.supported_parameters ?? [],
  }));
}

/** Combines the verdicts of several requests for one call: any FAIL wins, else the first OK. */
function combine(verdicts) {
  const failed = verdicts.find((v) => v.status === 'FAIL');
  if (failed) return failed;
  return { ...verdicts[0], reason: `${verdicts[0].reason} (${verdicts.length} requests)` };
}

function textRows(plan, rawText, endpointsById, structured) {
  const rows = [];
  for (const modelId of plan.textModelIds) {
    const raw = rawText.find((m) => m.id === modelId);
    rows.push({
      model: modelId,
      call: 'catalog (text)',
      ...rules.textListedVerdict({ listed: raw !== undefined }),
    });
    rows.push({
      model: modelId,
      call: 'pricing',
      ...(raw === undefined
        ? { status: 'FAIL', reason: 'not listed, so no price' }
        : rules.pricingVerdict(raw)),
    });
  }
  for (const call of structured) {
    const endpoints = trimEndpoints(endpointsById.get(call.model) ?? []);
    const verdict = combine(
      call.bodies.map((body) => rules.structuredCallVerdict({ endpoints, body })),
    );
    rows.push({ model: call.model, call: `structured: ${call.call}`, ...verdict });
  }
  return rows;
}

function speechRows(plan, rawSpeech, endpointsById, speech) {
  const rows = [];
  for (const capture of speech) {
    const endpointCount = (endpointsById.get(capture.modelId) ?? []).length;
    rows.push({
      model: capture.modelId,
      call: `speech (${capture.lang})`,
      ...rules.speechCallVerdict({
        modelId: capture.modelId,
        listed: capture.listed && capture.narratable,
        endpointCount,
        voices: capture.voices,
        supportsStyle: capture.supportsStyle,
        body: capture.body,
      }),
    });
  }
  const speechIds = [...new Set(plan.speechTargets.map((target) => target.modelId))];
  for (const modelId of speechIds) {
    const raw = rawSpeech.find((m) => m.id === modelId);
    rows.push({
      model: modelId,
      call: 'pricing',
      ...(raw === undefined
        ? { status: 'FAIL', reason: 'not listed, so no price' }
        : rules.pricingVerdict(raw)),
    });
  }
  return rows;
}

/**
 * The verdict table: one row per (model, call). Pure given its inputs, so it is testable with
 * fixtures. `endpointsById` maps a model id to its raw endpoint list (empty when none).
 */
export function buildRows({ plan, rawText, rawSpeech, endpointsById, captured }) {
  return [
    ...textRows(plan, rawText, endpointsById, captured.structured),
    ...speechRows(plan, rawSpeech, endpointsById, captured.speech),
  ];
}

export function summarize(rows) {
  const failed = rows.filter((row) => row.status === 'FAIL').length;
  return { total: rows.length, failed, passed: rows.length - failed, ok: failed === 0 };
}

function formatTable(rows) {
  const headers = ['MODEL', 'CALL', 'RESULT', 'REASON'];
  const cells = rows.map((row) => [row.model, row.call, row.status, row.reason]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...cells.map((cell) => cell[i].length)),
  );
  const line = (values) =>
    values
      .map((value, i) => value.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

async function run(argv) {
  const asJson = argv.includes('--json');
  const reader = createPublicReader();
  let plan;
  let rawText;
  let rawSpeech;
  const endpointsById = new Map();
  try {
    rawText = await reader.listModels('text');
    rawSpeech = await reader.listModels('speech');
    plan = planModels({ rawSpeech });
    for (const modelId of [...plan.textModelIds, ...plan.speechTargets.map((t) => t.modelId)]) {
      if (!endpointsById.has(modelId)) {
        endpointsById.set(modelId, (await reader.listEndpoints(modelId)) ?? []);
      }
    }
  } catch (error) {
    if (error instanceof OpenRouterUnreachableError) {
      process.stderr.write(
        `contract:check could not reach OpenRouter (${error.message}). The contract is NOT verified.\n` +
          'Retry when the network is back. This is not a verdict on the app.\n',
      );
      return EXIT.UNREACHABLE;
    }
    throw error;
  }

  const captured = await captureRequests({ rawText, rawSpeech }, plan);
  const rows = buildRows({ plan, rawText, rawSpeech, endpointsById, captured });
  const summary = summarize(rows);
  const checkedAt = new Date().toISOString();

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ source: OPENROUTER_API_BASE, checkedAt, ...summary, rows }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `OpenRouter contract check, live from ${OPENROUTER_API_BASE} at ${checkedAt}\n` +
        `${formatTable(rows)}\n\n` +
        `${summary.passed} OK, ${summary.failed} FAIL of ${summary.total} checks\n`,
    );
  }
  return summary.ok ? EXIT.OK : EXIT.FAIL;
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(
        `contract:check could not run: ${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = EXIT.INTERNAL;
    },
  );
}
