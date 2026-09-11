# Beta 2 update

The sample collection uses `0.1.0-beta.2` of `TXTextControl.AI`,
`TXTextControl.AI.LlamaServer`, `TXTextControl.AI.Mcp`,
`TXTextControl.AI.Knowledge`, and `TXTextControl.AI.AspNetCore`.
The independent `TXTextControl.AI.McpServer` package remains `0.1.0-beta.1`.

## What's included

- Host-configured OpenAI and compatible inference profiles alongside local GGUF models.
- The same Chat, Document Studio, streaming and editor integration APIs across providers.
- Profile selection and connection testing in the full Web sample, with external-processing disclosures.
- Per-profile `ReasoningEffort` and opt-in sampling controls, plus safer provider error messages.
- Updated public API/settings references, JavaScript declarations, runtime maintenance and patched native SQLite dependency.

## Upgrade

1. Restore the versions pinned in `Directory.Packages.props`, then rebuild the samples.
2. If using a separate AI.Service, update and restart it as well as the website. The service owns provider credentials, model configuration and Knowledge in this mode.
3. Merge the example profile into the AI host's configuration; example JSON files are not loaded automatically.
4. Store API keys in user secrets for local Development testing or environment variables/a secret store for deployment. User secrets are local developer storage, not an encrypted production vault, and are not included in publish output.
5. For `gpt-5.6-luna` using the built-in Chat Completions provider, set `"ReasoningEffort": "None"`. Restart the AI host and select/apply the profile in Runtime. A successful text-only connection test does not by itself prove model compatibility with document tools.

See the [complete provider guide](inference-providers.md) and
[full Web sample](../samples/WebDocumentAssistant/README.md). Other models retain their
provider-default reasoning effort unless explicitly configured. Local model behavior is unchanged.

## Release availability

The repository pins candidate package versions. Package creation does not publish them to NuGet.org.
Public-feed restore is a release gate: publish all five beta.2 packages before distributing
this sample revision. Local validation may use a private feed through git-ignored build settings;
public consumers do not need those settings once the packages are available on NuGet.org.
