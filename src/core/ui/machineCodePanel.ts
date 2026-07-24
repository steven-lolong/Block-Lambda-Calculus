import type * as Blockly from 'blockly';
import { encode, decode, wordHex } from '../ir/encode';
import { injectVm, runVm, formatVmValue, type VmState } from '../ir/vm';
import { asmInstrText, asmFuncKind } from '../ir/prettyPrinters';
import { computeReductionRun, type ReductionKind } from '../semantics/lambdaReduction';
import type { VmProgram } from '../ir/isa';

/*
 * The Machine-code tab (Lowering pane, step 3.6): the hex word stream
 * (`encode`, one row per instruction, decoded mnemonic alongside so the hex is
 * legible rather than opaque) plus a Run button and a correctness badge. Run
 * decodes the very words shown (`decode(encode(prog))`, not `prog` directly)
 * and executes that through the real `stepVm`/`runVm` — so a click genuinely
 * exercises hex -> decode -> execute, not just "run the pre-encoded program" —
 * then compares the result against the substitution stepper, the same
 * reference every earlier stage's tests were checked against. This is the
 * live, single-program version of the invariant 3.7 turns into a property
 * test; unlike the CFG/Assembly stages, nothing here is pre-computed on
 * render — the badge starts "Not run yet" and only Run populates it, so the
 * Lowering tab's per-keystroke re-render never pays for a VM execution nobody
 * asked to see.
 */

function renderResult(badge: HTMLElement, final: VmState, block: Blockly.Block | null, strategy: ReductionKind, elapsedMs: number): void {
  if (final.status === 'error') {
    badge.dataset.state = 'error';
    badge.textContent = `✗ stuck — ${final.error ?? 'unknown error'}`;
    return;
  }
  const vmValue = final.result ? formatVmValue(final.result) : '—';
  if (!block) {
    badge.dataset.state = 'unknown';
    badge.textContent = `done · ${vmValue} · ${final.stepCount} steps (no source term to check against)`;
    return;
  }
  // The substitution reference has a much smaller step budget than the VM, so a
  // deep-recursion program can leave the reference truncated (finalValue is a
  // `not a value: …` marker) while the VM completes correctly. Comparing against
  // a non-value would show a false MISMATCH ("the compiler is wrong") when the
  // reference simply produced nothing to compare — so surface that honestly.
  const run = computeReductionRun(block, strategy);
  const referenceReachedValue = run.normalForm && !run.finalValue.startsWith('not a value');
  if (!referenceReachedValue) {
    badge.dataset.state = 'unknown';
    badge.textContent = `done · ${vmValue} · ${final.stepCount} steps — substitution reference did not reach a value, nothing to compare`;
    return;
  }
  const match = vmValue === run.finalValue;
  badge.dataset.state = match ? 'match' : 'mismatch';
  badge.textContent = match
    ? `✓ matches substitution — ${vmValue} (${final.stepCount} steps, ${final.syncCount} salient, ${elapsedMs.toFixed(2)} ms)`
    : `✗ MISMATCH — VM got ${vmValue}, substitution expected ${run.finalValue}`;
}

/** Render the Machine-code tab into `host`: hex + mnemonic listing, Run
 *  button, correctness badge. `block`/`strategy` are the source term and
 *  strategy the badge checks the VM's result against; `block` is null only in
 *  the degenerate case of blocks present but no valid top-level term, in
 *  which case the badge still runs but skips the correctness comparison. */
export function renderMachineCodeInto(host: HTMLElement, prog: VmProgram, block: Blockly.Block | null, strategy: ReductionKind): void {
  host.replaceChildren();

  const summary = document.createElement('div');
  summary.className = 'closures-summary';
  summary.textContent =
    `${prog.code.length} word${prog.code.length === 1 ? '' : 's'} · ` +
    `${prog.functions.length} function${prog.functions.length === 1 ? '' : 's'} · ` +
    `${prog.constants.length} constant${prog.constants.length === 1 ? '' : 's'}`;
  host.appendChild(summary);

  const controls = document.createElement('div');
  controls.className = 'machine-code-controls';

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'small-button machine-code-run';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'app-icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#icon-play');
  icon.appendChild(use);
  const runLabel = document.createElement('span');
  runLabel.textContent = 'Run';
  runButton.append(icon, runLabel);

  const badge = document.createElement('span');
  badge.className = 'machine-code-badge';
  badge.setAttribute('aria-live', 'polite');
  badge.textContent = 'Not run yet';
  badge.dataset.state = 'idle';

  controls.append(runButton, badge);
  host.appendChild(controls);

  const encoded = encode(prog);
  runButton.addEventListener('click', () => {
    const decoded = decode(encoded);
    const start = performance.now();
    const final = runVm(decoded, injectVm(decoded));
    const elapsedMs = performance.now() - start;
    renderResult(badge, final, block, strategy, elapsedMs);
  });

  const byEntry = new Map(prog.functions.map((f) => [f.entry, f]));
  const lines: string[] = [];
  prog.code.forEach((ins, i) => {
    const entry = byEntry.get(i);
    if (entry) {
      lines.push(`${entry.label}:  ; ${asmFuncKind(entry.label, entry.arity)}, regs=${entry.regCount}, slots=${entry.slotCount}`);
    }
    lines.push(`  ${String(i).padStart(3, ' ')}  ${wordHex(encoded.words[i])}   ${asmInstrText(ins, i, prog)}`);
  });
  const listing = document.createElement('code');
  listing.className = 'ir-listing machine-code-hex';
  listing.textContent = lines.join('\n');
  host.appendChild(listing);
}
