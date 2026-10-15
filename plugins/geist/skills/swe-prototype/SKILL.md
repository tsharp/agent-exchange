---
name: swe-prototype
description: Build a small disposable experiment to answer a concrete engineering, state-model, integration, or UI design question. Use when an experiment would resolve uncertainty faster than discussion; ordinary implementation does not require a prototype.
metadata:
  version: 1.0.1
  updated: 2026-10-15
  status: stable
---

# Prototype an engineering decision

## Overview

Resolve one useful uncertainty with the smallest runnable experiment. Read the
applicable communication, general engineering, and language styles selected by
the active instructions and their task-relevant references. Apply them to the
decision and any production change; keep personal rules in their owning packages.

A prototype earns its cost by answering a question. Keep supporting work limited
to what makes the result useful and credible. Do not add production architecture,
polish, or documentation machinery to a disposable experiment.

## Steps

1. **Name the decision.** State the question, what observation would answer it,
   and what decision depends on the answer. Use supplied requirements and local
   evidence. Ask only if competing interpretations would change the experiment.
   If a small direct check can settle the question, run it without constructing
   a larger demonstration.

2. **Choose the cheapest faithful form.** Use a CLI fixture, language example,
   state simulation, benchmark, integration harness, sketch, or UI according to
   the question. Use existing project tools. An HTML demo is useful when someone
   needs to manipulate state visually; it is not the default for backend logic.
   Add multiple alternatives only when comparison is the point of the exercise.

3. **Keep it disposable and isolated.** Clearly mark the experiment and place it
   in an established scratch location or a nearby clearly named prototype file.
   Keep state in memory unless storage behavior is being tested. Use isolated
   fixtures or scratch storage for persistence experiments. Make it easy to run
   and expose the inputs and resulting state needed to judge the question.
   Preserve unrelated work and avoid changing production entry points just to
   host a demonstration.

4. **Run and assess it.** Exercise the deciding scenario and a relevant exception
   or competing case. Add assertions or measurements when they make the answer
   more reliable; skip test scaffolding that only tests the disposable harness.
   Distinguish a simulation from evidence about the real integration, workload,
   host, or platform. State assumptions and measure actual performance when
   performance is the question. Stop when the observation supports a decision
   or identifies a specific next experiment.

5. **Preserve the finding.** Record the question, method, result, and limits in
   the existing issue, decision note, or task report. Keep the artifact only when
   it supports review or repeatability; a separate branch or new document is
   optional. Report retained artifact paths and run instructions. Clean up
   disposable files that no longer help, without deleting unrelated material.

   When implementation is already authorized, carry the supported decision into
   production code and run its required checks. A successful prototype does not
   by itself establish production readiness or expand the user's requested scope.

## Completion checks

- The experiment answers a named question at an appropriate cost.
- The relevant scenarios were run and their observable results recorded.
- Assumptions, simulated behavior, and unverified production conditions are clear.
- The finding is retained in an appropriate existing place; retained artifacts
  are clearly marked and runnable.
- Any resulting production change follows applicable styles and project checks.
