# TXTextControl.AI Web sample

Optional OpenAI and compatible inference providers are configured on the AI host.

### Beta 3: OpenAI document workflows

Use the beta.3 AI integration packages on both the website and any separate AI.Service.
For `gpt-5.6-luna`, add `"ReasoningEffort": "None"` to its `LocalAI:InferenceProfiles`
entry when using the built-in Chat Completions provider. This enables the supported
tool-calling configuration for document creation and edits; it leaves document tools enabled.
Without it, a plain-text request may succeed while a tool-enabled request returns HTTP 400.
Other models retain their default reasoning behavior unless explicitly configured.

Restart the process that owns inference after changing the profile: the Web application
for in-process inference, or AI.Service when using `RemoteIntegration`. Select the profile
in Runtime and apply it. The sample's local GGUF reasoning switch is independent.
The example JSON is not loaded automatically; merge its non-secret settings into
`appsettings.json` and configure credentials using user secrets or environment variables.

See [the provider setup guide](../../docs/inference-providers.md) for secrets,
profile selection, connection tests, limits and private-data approval. Update the
AI host packages and website assets together; older builds lack these endpoints.

For testing, merge [appsettings.OpenAI.example.json](appsettings.OpenAI.example.json)
into your appsettings file and fill in Model and ApiKey. Alternatively, leave ApiKey
empty and set it using user secrets or an environment variable. The example is not
loaded automatically. Never commit or publish a settings file containing a real key.

This is the **complete** `TXTextControl.AI.Web` sample, not a reduced replacement. Its original project/assembly name, Razor page, styling, branding, editor setup and all feature panels are retained. Reusable integration APIs and JavaScript are loaded from the `TXTextControl.AI.AspNetCore` NuGet package.

The folder is named `WebDocumentAssistant` in this sample collection. Install .NET 10 SDK and ASP.NET Core 8 runtime; the Document Editor host runs on Windows/Linux. Native inference may instead run on macOS through AiService.

An ASP.NET Core sample combining a local GGUF model, the TX Text Control MCP Document Server, and the TX Text Control Document Editor.

## Prerequisites

- The MCP Document Server running at `http://127.0.0.1:5000/mcp`.
- A TX Text Control Document Editor installation/license available to the application.
- For local chat inference: at least one compatible `.gguf` file under `Models` (or set `LocalAI:ModelDirectory` to an absolute model store). External API profiles do not require a local chat model or GPU. Optional local embeddings remain separately configured.

## Run

```powershell
dotnet run --project samples/WebDocumentAssistant
```

Open `http://localhost:5187`. Use the **Runtime** tab to enter and test a Streamable HTTP MCP endpoint, select and load a model, and tune generation settings. Use **Chat** for MCP document creation or attach a TX, RTF, DOCX, HTML, PDF, Markdown, or text document—using the paperclip or drag and drop anywhere over the Chat card—and ask the model to inspect, edit, or export it. Dropped files are staged so a question can be entered before sending. The attachment is loaded directly into the active MCP session; its Base64 content is not added to the LLM conversation. Use **Document studio** to load, summarize, question, edit, or rephrase documents. The **Ask or edit the document** field accepts both questions and instructions such as `Make paragraph 2 red`; successful MCP edits are loaded back into the editor automatically. The result panel streams the current model and MCP activity, elapsed time, and completed tool steps while each action is running.

When Chat already has an active document, an export-only follow-up such as `provide as PDF`, `download the current document as DOCX`, or `save it as TX` bypasses model inference and exports the existing MCP session directly. Requests that also change or summarize content continue through model planning.

The **Test connection** button creates a temporary MCP connection and performs real tool discovery. A compatible document server must expose the primary `create_document`, `inspect_document`, and `convert_document` workflows plus either `create_document_export` or the compatibility tool `get_as_base64`. Applying a changed endpoint reconnects the live integration without reloading model weights; active browser conversations are reset because their document session IDs belong to the previous server.

Clear **Enable MCP document tools** to load and use the local model while the MCP server is unavailable. Tool-free operations such as selected-text rewriting continue to work. Chat document creation, document loading, summaries, questions, and exports require MCP and return a clear disabled message until the switch is enabled and the settings are applied.

The model and MCP connection are application singletons. Browser sessions retain independent chat histories and MCP document session IDs. Changing load-time model settings reloads the model and starts fresh conversations; generation-only settings apply without reloading model weights.

## Long documents and context limits

The sample defaults to a 65,536-token context and budgets every inference against `LocalAI:ContextSize`. It reserves the configured output tokens,
MCP tool schemas, expected tool results, and a safety margin before selecting conversation history. System
instructions and the latest request are retained; the newest complete history turns are added only while they fit.

Read-only document questions, summaries, and assessments use chunked analysis. The integration pages indexed
paragraphs from `inspect_document`, analyzes each bounded chunk without exposing MCP tools, and hierarchically
reduces the evidence before producing the final answer. Document bytes never enter the LLM context. Edits and
structural questions continue through MCP tools so that mutations use authoritative document coordinates.

The behavior is configurable under `LocalAI:ContextManagement`: `CharactersPerToken`, `SafetyMarginTokens`,
`ToolResultReserveTokens`, `MaxDocumentChunkCharacters`, and `MaxDocumentChunks`.

## First successful session

Start [the MCP host](../McpServer/README.md) first. Open the web application, select Runtime, test the MCP URL, install a compatible runtime explicitly or configure an existing executable, and select your application-owned GGUF model. Model selection starts blank intentionally; no model weights are shipped. Load the model, then open Chat or Document Studio. Use a tool-capable model for document operations.

The included financial, healthcare, transportation and NDA RTFs remain in `Samples`; they are illustrative documents, not real customer records or professional advice. The full document editor still loads via the TX WebSocket middleware and its separate editor backend process.

## Feature map

- **Chat:** attachments, document creation/editing, streamed status and document export/download bubbles.
- **Document Studio:** load sample/current documents into the editor, select text, rewrite, ask questions and apply document edits using the packaged EditorAdapter/DocumentAssistant.
- **Runtime:** install/manage runtimes, configure engine download release/URL, model selection and generation/context settings.
- **Integration service:** configure a permitted remote AI API URL; credentials and allowlists stay server-side.
- **Knowledge:** collections, uploads, indexing activity, active sources, retrieval tests and global embedding configuration.
- **Answer export:** export generated chat content independently of exporting the current editor/document session.

## Remote AI and Knowledge

Follow [AiService](../AiService/README.md) and [remote configuration](../../docs/remote-ai-service.md). Set `RemoteIntegration:ServiceUrl`, `AllowedServiceUrls` and the matching service API key on this web host. The same UI controls the remote AI service. Restart the website after switching modes/URL. The AI service owns models, runtime installation, Knowledge and embeddings; rich-document extraction stays on MCP. No UI features are intentionally removed in remote mode.

When using local AI, `Knowledge:Enabled` enables the local store under `App_Data/Knowledge`. Optional embedding settings apply globally; changing them requires restarting the AI-owning host and reindexing. See [Knowledge](../../docs/knowledge.md).

## Authentication and deployment

The default launch profile is Development and restricts access to loopback. Outside Development, configure `DeploymentAuthentication:Enabled=true`, a username and a random password of at least 32 characters, and serve HTTPS. The private-deployment helper treats the authenticated user as an admin; replace it with application identity and separate roles for shared services. Missing deployment authentication fails startup.

See [MacBook deployment](../../deploy/macbook/README.md) for native Apple Silicon AI plus Linux containers, or [Docker](../../deploy/docker/README.md). No models, App_Data, credentials or generated artifacts belong in published source. [Package API documentation](../../docs/api/TXTextControl.AI.AspNetCore.md) covers all settings and C#/JavaScript calls.
