# Agent Exchange contributor instructions

## Incremental commits

Make a Conventional Commit whenever a coherent increment of progress is complete. Run the checks relevant to that increment first, then stage only its intended files and commit before starting the next increment. Use messages such as `docs(rag): define the v1 retrieval contract`, `feat(geist): add the document cache`, and `fix(geist): refresh deleted records`. Keep unfinished work and unrelated user changes outside each commit. Record material verification limits in the commit body when needed.

## Project boundaries

Agent Exchange is the marketplace. Each plugin owns its implementation and documentation under `plugins/<name>/`. Keep marketplace setup in the root README and plugin configuration and usage in the plugin README.

When implementing or changing Geist RAG, read [the public v1 plan](docs/plans/rag_v1.plan.md). Keep that plan and the relevant usage documentation aligned with the implemented contract. Plans under `docs/plans/` are intentional public project history.

When changing hook source, rebuild the committed runtime and run the plugin tests. Preserve instruction-file ordering from TOML and keep retrieved reference material distinct from trusted workspace instructions. Conversation logging is outside Geist's scope.
