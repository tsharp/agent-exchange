---
name: swe-diagnose
description: Diagnose and fix a reported software failure or performance regression using a reproduction, targeted investigation, and verification of the original symptom. Use for debugging; an obvious local correction does not require a full investigation.
metadata:
  version: 1.0.0
  updated: 2026-10-15
  status: stable
---

# Diagnose software failures

## Overview

Find the cause of the reported behavior and verify a correction. Read the
applicable communication, general engineering, and language styles selected by
the active instructions, including their task-relevant references. Those styles
and explicit project requirements govern terminology, construction, testing,
and reporting. Keep personal prescriptions in their canonical packages.

Scale the investigation to the uncertainty. For an obvious local defect, use
the smallest reproduction and relevant check, then fix it. Expand investigation
when the cause is uncertain, the failure crosses components, or a previous fix
did not hold. Do not add phases, documents, or approval steps solely for process.

## Steps

1. **Establish the failure.** Identify expected and observed behavior, the
   affected version or configuration, and a concrete trigger. Read relevant
   code, logs, tests, and project terms. Find accessible facts independently;
   ask only for missing information that changes the investigation.

2. **Build a useful reproduction.** Prefer an existing test, fixture-driven
   command, captured-input replay, or small harness that detects the user's
   actual symptom. Run it and retain the result. A successful startup alone
   does not verify a failing user operation. Reduce irrelevant setup while
   preserving the failure; stop reducing when the example is useful for diagnosis.
   For intermittent failures, record attempts, failures, and conditions. For
   performance, measure a repeatable baseline before changing behavior.

   Reading code may be necessary to build the reproduction. If reproduction is
   unavailable, state what was tried and what the evidence does support. Continue
   useful read-only analysis, labeling hypotheses and verification limits. Ask
   for the smallest missing access or artifact when progress depends on it;
   do not present an unverified change as a confirmed fix.

3. **Investigate the uncertainty.** Form plausible causes and the observations
   that distinguish them. Use as many hypotheses as the evidence warrants.
   Inspect state, bisect versions, or add focused temporary instrumentation.
   Change one relevant factor at a time where practical. Keep credentials and
   sensitive payloads out of displayed commands and captured output. Summarize
   meaningful findings without requiring a checkpoint for every probe.

4. **Correct and verify.** Fix the demonstrated cause through the owning
   abstraction, preserving invariants and caller-visible error distinctions.
   Choose regression coverage at an existing interface that reaches the real
   failure. Establish the failing assertion before applying the correction when
   practical. Do not create a shallow test merely to claim coverage, or add a
   new abstraction solely to control test internals. A focused regression test
   does not require routine owner confirmation.

   Rerun the original scenario and relevant project checks. Verify performance
   against comparable measurements; intermittent failures need enough attempts
   to explain confidence and remaining uncertainty. Broaden checks when the
   change or failures justify it, and honor mandatory repository validation.

5. **Clean up and report.** Remove investigation-only instrumentation and
   temporary artifacts created for this task, preserving useful regression
   fixtures and unrelated user work. Report the cause, correction, evidence,
   and remaining limits. Update authoritative documentation when the corrected
   contract changes, and follow the repository's commit requirements.

## Completion checks

- The reproduction exercises the reported symptom, or its absence and resulting
  limits are explicit.
- The correction addresses an evidenced cause; speculation is labeled.
- Verification covers the original trigger and meaningful regression behavior.
- Applicable styles and required project checks were followed; temporary
  instrumentation is removed.
- The report states the outcome and evidence without unsupported certainty.

## Provenance

Adapted from Matt Pocock's `diagnosing-bugs` at upstream revision `49dd158`.
The upstream [MIT notice](LICENSE) is retained with this independent package.
