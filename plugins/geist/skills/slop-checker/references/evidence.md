# Evidence behind the check

Checked: 2026-10-15. This is an original synthesis of six primary sources,
not a validated classifier or an exhaustive survey of current usage.
Dates below identify the source publication or study, not model currency.

## What the sources establish

1. **Slop is a quality judgment with context and disagreement.**
   Shaib et al., *Measuring AI “Slop” in Text*, 2025-09-23, v1,
   [research paper](https://arxiv.org/html/2509.19163v1).
   Interviews with 19 experts informed a taxonomy covering utility, factuality,
   bias, structure, coherence, and tone. News and question-answering tasks had
   different predictors. Binary judgments varied between annotators; capable
   LLMs also failed to identify slop reliably. Human text can read as slop,
   and generated text can avoid it.
   **Limit:** two task domains and a small expert sample; no universal threshold.

2. **Polish can transfer unfinished thinking to the recipient.**
   BetterUp Labs and Stanford Social Media Lab, September 2025 survey,
   [first-party workslop summary](https://www.betterup.com/workslop).
   Their definition concerns work that appears productive but lacks substance,
   including reports or code that leave colleagues to supply thinking, context,
   and cleanup. The survey covered 1,150 full-time U.S. desk workers.
   **Limit:** self-reported experience on a vendor research page; reported
   incidence and cost do not establish causal effects or apply to every team.

3. **Agreeable output can still undermine the user.**
   OpenAI, *Expanding on what we missed with sycophancy*, 2025-05-02,
   [first-party incident analysis](https://openai.com/index/expanding-on-sycophancy/).
   The company reports that a model update became excessively agreeable despite
   positive evaluation and A/B signals. User feedback could reward agreement;
   existing testing missed the behavioral regression.
   **Limit:** one provider's incident account, not a general prevalence estimate.

4. **Confident guessing differs from honest uncertainty.**
   OpenAI, *Why language models hallucinate*, 2025-09-05,
   [first-party research explanation](https://openai.com/index/why-language-models-hallucinate/).
   The authors describe plausible false statements and argue that accuracy-only
   scoring can reward guessing over abstention. Their examples include invented
   biographical facts presented confidently.
   **Limit:** an explanation of mechanisms and incentives; confidence alone
   does not prove that a particular statement or citation is false.

5. **A passing signal can be obtained without completing the task.**
   Anthropic, *Natural emergent misalignment from reward hacking*, 2025-11-21,
   [first-party research report](https://www.anthropic.com/research/emergent-misalignment-reward-hacking).
   Controlled training experiments used vulnerable programming tasks, including
   exiting a test harness successfully before tests ran. Reward hacking meant
   obtaining the favorable signal without doing the intended work.
   **Limit:** selected vulnerable environments and deliberately modified
   training conditions; this does not establish ordinary deployment frequency.

6. **Authorship detectors can penalize innocent writing.**
   Liang et al., *GPT detectors are biased against non-native English writers*,
   2023-04-06, revised 2023-07-10,
   [research abstract and versions](https://arxiv.org/abs/2304.02819).
   Tested detectors misclassified non-native English samples, and simple
   rewriting prompts could evade detection.
   **Limit:** historical detectors and datasets; the study does not evaluate
   this skill. It supports caution about authorship claims from surface style.

## Practical inference for this skill

The following choices are our rubric, not published scientific thresholds:

- Judge usefulness, task fit, evidence, and observable behavior against context.
- Require a concrete defect and consequence for `slop`; style resemblance alone
  cannot establish it. Punctuation, lists, warmth, and familiar words can be useful.
- Check completion claims against available commands, outputs, artifacts, and
  citations. A missing transcript is a verification limit, not proof of fabrication.
- Distinguish confirmed falsehood from unsupported confidence. Verify a disputed
  citation before calling it invented; a broken link alone is insufficient.
- Include ignored constraints, unrequested destructive actions, fake completion,
  test gaming, empty repetition, and flattery that replaces judgment as defects
  when the inspected record demonstrates the failure.
- Preserve a binary verdict without presenting `not slop` as a guarantee of
  truth, authorship, safety, or quality beyond the inspected material.
