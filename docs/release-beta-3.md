# Beta 3 sample upgrade

All ten samples consume centrally pinned version `0.1.0-beta.3` of the AI integration packages and MCP server. Update the website, any separate AI service, and the MCP host together, then rebuild and restart those processes.

## Included improvements

- JSON invoice templates use native merge fields and a repeating line-item block. The web/editor routes validate template creation and preserve the reusable source across preview/export.
- The packaged editor SDK captures caret anchors and rejects stale selection/document results.
- Text, fields and tables support explicit insertion targets, including table boundaries; selection replacement resolves native matches atomically.
- Header/footer text has explicit append, prepend and replace modes, with section isolation. The full MCP sample enables the new `insert_text` operation used by these tools.

The Web sample consumes `client.js` and `editor.js` from the ASP.NET package, so refresh the deployed static assets with the application. For OpenAI profile configuration, the [beta.2 notes](release-beta-2.md) still apply.

## Local candidate packages

This upgrade was requested against packages in `C:\Data\Projects\NuGetPackages\Release`. Local testing uses the existing git-ignored `.codex-build` override for a temporary NuGet.Config and a fresh package cache. The committed NuGet.Config keeps its public feeds. Package creation and this sample update do not publish packages to a feed; public availability of all six versions remains required for an ordinary clean public restore.

The beta.3 candidate was rebuilt under the same version. A consumer's earlier cached copy can therefore differ from the current Release archive. Use a fresh, isolated RestorePackagesPath for candidate validation and compare the restored DLLs to the package archives. Avoid clearing unrelated machine-wide caches.

## Verification

Run `scripts/verify-samples.ps1 -ReleaseGate` with the intended local config/cache to restore and compile all ten samples, publish the full Web, AI service and MCP host, and check browser assets, SDK fonts and the SQLite baseline. Native MCP and browser smoke tests supplement these build checks. Existing local credentials and branding customizations are not part of the package upgrade commit.

## Validated on Windows (2026-09-15)

- All ten sample projects restored the six current beta.3 package archives from the local Release feed into an isolated cache and rebuilt in Release with zero warnings/errors.
- The release verification script passed with NuGet security advisories treated as errors. WebDocumentAssistant, AiService and McpServer publish outputs passed browser asset, SDK font and SQLite dependency checks.
- MinimalMcpHost and the published full McpServer each exposed 62 tools. Native header edits, invoice templates with a repeating LineItems block, deep merge validation, PDF download and worker shutdown passed on both hosts.
- The published WebDocumentAssistant passed its mouse/keyboard toggle regression at 1920x1080, 1366x768 and 390x844. Its served editor SDK includes the beta.3 caret-anchor implementation.

The licensed TX feed returned HTTP 401 during fresh restore, so validation reused the already installed licensed SDK/Web dependency archives. All AI packages still came exclusively from the requested local Release feed. This does not establish public-feed availability or replace inference-provider acceptance tests. Local credentials and branding edits were excluded from the commit candidate.
