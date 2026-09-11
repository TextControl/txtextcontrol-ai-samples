# Release readiness

This collection is prepared for package-only consumption. It does not build or publish library packages itself and requires no private signing key. The five AI integration packages are pinned to `0.1.0-beta.2`; the independent `TXTextControl.AI.McpServer` remains `0.1.0-beta.1`. Its C# namespaces and assembly identity are unchanged. See [beta.2 upgrade notes](release-beta-2.md).

## Beta 2 validation (2026-09-11)

All five newly versioned packages passed strong-name signature, license, icon and README-content checks. All 59 ASP.NET integration tests passed. Using the git-ignored local feed with the public beta.2 version pins, all ten samples built without warnings and the Web, AI.Service and MCP publish-output checks passed with `-ReleaseGate`. The full Web provider UI passed desktop and mobile browser checks against a fake local provider. No public NuGet publication or GitHub push was performed; the remaining gates below still apply.

The Web sample's Luna profile explicitly disables reasoning for Chat Completions tool use. Real API keys must not be present in publishable JSON. The publication check rejects non-empty `ApiKey` fields; use local user secrets or deployment secret configuration instead.

## Unresolved release gates

- Publish the required AI/MCP package versions and verify clean restore from the committed public feeds. Local candidate validation is not proof of public availability.
- Audit runtime-specific dependency graphs too. The Linux web cross-publish additionally reported `System.Private.Uri` 4.3.0 advisories. No standalone System.Private.Uri.dll was present in the inspected framework-dependent publish; determine whether these legacy graph entries are supplied/replaced by the current shared framework before deciding applicability. Do not silently suppress them.
- Run the full browser/model/MCP workflows on supported native targets. Cross-publishing does not verify Apple Silicon inference, Docker emulation, licensing or native dependencies.
- Confirm sample/license scope, exact third-party notices and redistribution permissions before shipping prebuilt deployment bundles. The source-available license does not grant rights to redistribute all dependency binaries or model weights.

## Validation commands

```sh
pwsh -File scripts/verify-samples.ps1 -ReleaseGate
bash scripts/verify-samples.sh --release-gate
pwsh -File scripts/New-MacBookBundle.ps1 -ReleaseGate
```

The scripts validate the publication boundary, restore/build all projects, publish the full web/MCP/service consumers, and check packaged browser/font assets and the native SQLite dependency baseline. Runtime tests remain a separate manual gate. GitHub Actions uses the release gate; success requires publicly available packages and a passing dependency audit.

## SQLite security update (2026-09-09)

The rebuilt `TXTextControl.AI.Knowledge` `0.1.0-beta.1` candidate explicitly depends on `SQLitePCLRaw.bundle_e_sqlite3` 3.0.5, which brings in `SQLite` 3.53.4. Original beta.1 packages still present in NuGet caches lack this dependency. Therefore MinimalWeb, AiService and WebDocumentAssistant also reference the patched bundle explicitly, with its version centralized in `Directory.Packages.props`. This protects normal restores of either beta.1 package without requiring a private feed or clearing a machine-wide cache. The old `SQLitePCLRaw.lib.e_sqlite3` dependency affected by [GHSA-2m69-gcr7-jv3q](https://github.com/advisories/GHSA-2m69-gcr7-jv3q) is absent from the resolved sample graphs. No audit warning was suppressed. Keep these sample references until the minimum supported Knowledge release guarantees the patched bundle.

Validation: 18 Knowledge tests (including the loaded native version and FTS5) and 34 ASP.NET Core tests passed on Windows. All ten sample builds and web/service/MCP publish checks passed with `-ReleaseGate`. The AI service also cross-published for `linux-x64` and `osx-arm64` with their native SQLite binaries present and security warnings treated as errors. Cross-publishing is not a native execution test.

Initial sample validation used rebuilt local candidate packages in an isolated cache, which missed the original beta.1 package in the normal cache. After adding the explicit sample dependencies, all ten builds and web/service/MCP publish checks passed `scripts/verify-samples.ps1 -ReleaseGate` using the committed NuGet.Config and normal cache, including the original beta.1 Knowledge package. This does not prove empty-cache public-feed restore or resolve the separate Linux web `System.Private.Uri` gate above.

Redeploy the complete updated application and restart the process hosting Knowledge (AiService in remote mode). Back up private data first; this dependency update requires no Knowledge schema migration or reindexing. Previously cached copies of the same unpublished beta candidate may still contain the old dependency: verify the resolved graph or validate with a fresh package cache. If a version has already been published, ship the fix under a new package version rather than attempting to replace it.

## Full web acceptance checklist

- Runtime: install/select/load a compatible model; change generation settings; verify explicit runtime installation behavior.
- Chat: create a document, follow-up edit, attach a document, stream progress and download the current document as PDF/DOCX.
- Answer export: export a generated Markdown answer without replacing/exporting the current document by mistake.
- Document Studio: load each included RTF, read a selection, rephrase text and apply an MCP edit back into the editor.
- Styles: modify a named style and convert paragraph formatting to reusable styles; confirm editor reload reflects changes.
- Knowledge: create/rename/delete a collection, upload a reference, inspect indexing failures/retry, retrieve approved sources, configure embeddings and restart/reindex.
- Remote mode: configure an allowed AI URL and service key; restart web; repeat Chat/Studio/Runtime/Knowledge workflows; confirm state/models reside on AiService.
- Authentication: non-loopback Development access is rejected; production fails without required credentials; wrong keys and invalid certificates are rejected.

Publish the packages first, then tag the samples against exact versions. Build source ZIPs from the reviewed repository/tag, not by zipping a working tree with ignored files. No private repository history, native models, generated state or signing keys should be in the public repository.
