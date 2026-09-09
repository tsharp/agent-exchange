# Geist skills

Both Geist plugin manifests load this directory. Add each skill once so Codex and Copilot use the same source. Other plugins keep their skills in their own plugin directories.

Use this layout within `plugins/geist/`:

```text
skills/
  engineering/
    skill-name/
      SKILL.md
      agents/openai.yaml
      references/         # Optional supporting documentation
      scripts/            # Optional automation
      assets/             # Optional templates
  productivity/
    skill-name/
      SKILL.md
      agents/openai.yaml
```

Each `SKILL.md` needs YAML frontmatter with a `name` matching its directory and a `description` explaining when to use it, followed by the skill's instructions. Use `agents/openai.yaml` for Codex display and invocation metadata.

No skills are included in the initial scaffold. Create category directories when adding their first skill.
