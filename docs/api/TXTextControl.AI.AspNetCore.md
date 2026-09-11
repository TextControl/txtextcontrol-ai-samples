# TX Text Control AI ASP.NET Core Integration

Build your own AI-enabled TX Text Control website with reusable .NET services,
HTTP workflows and browser SDKs. This package supplies chat, document assistance,
streaming, exports, runtime administration, optional private Knowledge and a
secure server-to-server integration pattern.

## Inference providers: local, OpenAI and custom

`WebAiOptions.InferenceProfile` defaults to `Local`. Add host-owned profiles through
`InferenceProfiles` to enable OpenAI or an OpenAI-compatible Chat Completions API.
Each profile defines `Name`, `Provider`, `Endpoint`, `Model`, server-only `ApiKey`,
`ContextSize`, `MaxOutputTokens`, `SupportsTools`, `SendSamplingParameters` and optional `ReasoningEffort`.
The browser selects only a profile name; it cannot supply a destination or API key.
Existing chat/document/streaming endpoints and editor bindings are unchanged.

### Beta 2: reasoning and document tools

For `gpt-5.6-luna` through the built-in Chat Completions provider, set
`"ReasoningEffort": "None"` in that host-owned profile. Otherwise, text-only requests
can work while document creation or editing fails with HTTP 400. The provider requires
reasoning disabled for this combination; this setting does not disable document tools.
Omit the setting for the provider default, or choose `Low`, `Medium`, `High`, or
`ExtraHigh` when supported by the model. Restart the AI host after changing configuration.
This is separate from the local GGUF model's reasoning switch.

Configure `Model` and `ApiKey` on the AI host, not in browser JavaScript. JSON settings
are supported for local testing, but use user secrets, environment variables, or a secret
store for credentials and never commit real keys. The supplied example JSON is a template,
not an automatically loaded configuration file. Update both the Web and AI.Service package
references when using a separately hosted integration service.

Administration adds `GET /api/inference/profiles` and `POST /api/inference/test`.
The test accepts `{ "inferenceProfile": "OpenAI" }` and sends a small billable prompt,
without documents/tools. Existing runtime configuration accepts an additive
`InferenceProfile` property (JSON `inferenceProfile`, default `Local`).
The JavaScript client provides `inferenceProfiles(options)` and
`testInferenceProfile(name, options)` with the existing request/cancellation options.

Register `IInferenceChatClientFactory` implementations for other API protocols;
the built-in `OpenAIInferenceChatClientFactory` supports `OpenAI` and
`OpenAICompatible`. Clients returned by factories are owned/disposed by the integration.
Local inference remains available without configuration changes. Embedding
configuration is independent. Private RAG passages require explicit
`TrustedInferenceEndpoints` approval for the active external endpoint.

The package includes **INFERENCE-PROVIDERS.md** with every profile setting, host
setup, direct C# usage, custom factory example, data-flow disclosure and security
guidance. Also see the
[public sample guide](https://github.com/TextControl/txtextcontrol-ai-samples/blob/master/docs/inference-providers.md).

**Your application owns its pages, layout, sign-in experience and editor.**
No sample pages, CSS framework, complete admin UI or Document Editor license are
included. The MCP document server remains independently deployable.

## Contents

- [Getting started](#getting-started)
- [Architecture and hosting choices](#architecture-and-hosting-choices)
- [Complete LocalAI configuration](#complete-localai-configuration)
- [HTTP API](#http-api)
- [Browser client](#browser-client)
- [Document Editor binding](#document-editor-binding)
- [Runtime administration](#runtime-administration)
- [Private Knowledge](#private-knowledge)
- [Remote AI service](#remote-ai-service)
- [Storage, security and operations](#storage-security-and-operations)

## Getting started

Requires ASP.NET Core/.NET 8 and an application-owned GGUF and compatible
llama-server runtime. Document processing requires a separately deployed,
licensed TX Text Control MCP server. Restore the preview from your approved feed:

```sh
dotnet add package TXTextControl.AI.AspNetCore --prerelease
```

Minimal **loopback-only development** host:

```csharp
using TXTextControl.AI.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5001");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 64 * 1024 * 1024);
builder.Services.AddTextControlAI(builder.Configuration.GetSection("LocalAI"));
var app = builder.Build();
app.UseStaticFiles();
app.UseTextControlAI();
app.MapTextControlAI(enableRuntimeConfiguration: false);
app.Run();
```

Example configuration, assuming the runtime has already been provisioned:

```json
{
  "LocalAI": {
    "ModelDirectory": "Models",
    "ModelPath": "chat.gguf",
    "WarmupOnStartup": false,
    "AutoInstallRuntime": false,
    "McpEndpoint": "http://127.0.0.1:5000/mcp",
    "ContextSize": 8192,
    "Generation": { "MaxOutputTokens": 1024 }
  }
}
```

Add your own HTML/Razor page and load the browser script described below.
Neither `UseTextControlAI` nor `MapTextControlAI` supplies authentication.
Before deployment, configure authentication and user/admin policies, call
`UseAuthentication` and `UseAuthorization`, and protect the returned group:

```csharp
// "AiUsers" and "AiAdministrators" must be registered by your host.
app.MapTextControlAI(administrationPolicy: "AiAdministrators")
   .RequireAuthorization("AiUsers");
app.MapTextControlAIRuntimeAdministration("AiAdministrators");
```

Use this protected mapping **instead of**, not in addition to, the development
mapping. Do not expose unauthenticated configuration/model-loading endpoints.

## Architecture and hosting choices

| Component | Responsibility / location |
| --- | --- |
| Website | Pages, login, editor and optional same-origin AI proxy |
| Integration host | Chat history, loaded model, runtime administration, artifacts and optional Knowledge |
| llama-server | Owned local process or explicitly trusted external raw inference endpoint |
| MCP server | TX document creation/edit/conversion/extraction; separately licensed Windows/Linux host |

In local mode the integration host is the website process. In remote mode it is
your AI.Service host; the website proxies requests and does not load its own model.
Do not point `LlamaServerEndpoint` at AI.Service: it is for a raw llama-server API.
macOS AI hosting does not require the native TX document engine; keep MCP on a
supported host and provision a compatible Mac inference executable and SQLite.

C# registration accepts either the `LocalAI` configuration **section**, optionally
with an `Action<WebAiOptions>` override, or an action alone.
`UseTextControlAI` adds session middleware. Registered services include the
shared `LocalDocumentAiService`, runtime installation worker, conversation/artifact
stores, sample catalog, warmup service and chunked document analyzer.

## Complete LocalAI configuration

Defaults are library defaults, not necessarily the sample's appsettings values.
Configuration environment variables use double underscores, for example
`LocalAI__ModelDirectory` and `LocalAI__Generation__MaxOutputTokens`.

### Models and native runtime

| WebAiOptions property | Default | Purpose |
| --- | --- | --- |
| WarmupOnStartup | true | Attempt warmup using the configured model at host startup |
| AutoInstallRuntime | false | Explicit opt-in to acquire a missing supported runtime |
| RuntimeCacheDirectory | null | Private runtime storage; blank uses account-local application-data cache |
| RuntimeDownload | new() | Version, BaseUrl and pinned Assets; details below |
| RuntimeDownloadSettingsFile | null | Optional private JSON admin override path relative to content root; null disables persistence |
| LlamaServerExecutablePath | null | Trusted explicit native engine executable |
| LlamaServerEndpoint | null | Existing raw inference endpoint; no owned chat process |
| LlamaServerApiKey | local | Server-side raw inference credential |
| HardwareBackend | Auto | Auto, Cpu, Cuda, Vulkan |
| ModelDirectory | Models | Application-owned GGUF directory, resolved from content root |
| ModelPath | Qwen3-8B-Q6_K.gguf | Default model selection; package supplies no such file |
| ContextSize | 65536 | Allocated model context; reduce for constrained hardware |
| GpuLayers | -1 | Maximum possible offload; 0 disables layer offload |
| Threads | null | Automatic CPU thread selection |
| FlashAttention | null | Runtime-selected; explicit true/false overrides |
| EnableReasoning | false | Model/runtime reasoning preference |
| InferenceTimeoutSeconds | 600 | Inference deadline |
| MaxConversationTurns | 6 | Retained conversation-turn bound, additionally constrained by token budgets |

### MCP connections and export limits

| Property | Default | Purpose |
| --- | --- | --- |
| McpEndpoint | http://127.0.0.1:5000/mcp | Document-processing endpoint |
| McpEnabled | true | Enables document tools; local model can run without MCP |
| McpConnectionTimeoutSeconds | 15 | Connection/discovery deadline |
| RestrictMcpEndpoints | false | Restrict configurable MCP destinations to trusted endpoints; enable on remote/shared hosts |
| TrustedMcpEndpoints | empty | Explicit non-loopback HTTPS destinations approved by the host |
| TrustedInferenceEndpoints | empty | Approved remote raw inference endpoints for private Knowledge |
| McpCredentials | empty | Exact endpoint-scoped { Endpoint, Token } bearer credentials, never browser input |
| MaximumExportBytes | 134217728 | 128 MiB export-transfer bound |
| ExportDownloadTimeoutSeconds | 120 | Artifact HTTP deadline including body |

Loopback processing is trusted by the built-in processing-endpoint helper.
Non-loopback Knowledge processing requires explicitly approved HTTPS URLs;
an admin typing a URL is not sufficient approval. Redirects and TLS validation
must not be bypassed. MCP credentials and AI-service credentials are independent.

### Generation

`LocalAI:Generation` is `ChatGenerationSettings`:

| Property | Default |
| --- | --- |
| MaxOutputTokens | 1024 |
| Temperature | 0.6 |
| TopK | 40 |
| TopP | 0.95 |
| FrequencyPenalty | null |
| PresencePenalty | null |
| Seed | null |

Use positive output/top-k limits, temperature 0–2, top-p 0–1 and model-compatible
penalties. Null leaves optional values to the runtime.

### Context management

`LocalAI:ContextManagement`:

| Property | Default | Purpose |
| --- | --- | --- |
| Enabled | true | Token-aware input preparation |
| CharactersPerToken | 2.0 | Conservative estimate, not an exact tokenizer |
| SafetyMarginTokens | 1024 | Template/tokenization headroom |
| ToolResultReserveTokens | 4096 | Tool-loop reserve, adapted to available context |
| MaxDocumentChunkCharacters | 48000 | Upper bound for one analysis chunk |
| MaxDocumentChunks | 128 | Analysis-work safety bound |

The integration budgets instructions, tool schemas, history, output and evidence.
Long-document analysis pages through MCP text and combines bounded intermediate
results. Document binaries may travel between browser, integration and MCP for
loading/editing; they should not be mistaken for text sent to the LLM.
Summaries can be lossy and limits can prevent complete coverage. Do not infer
that a larger context guarantees full-document analysis or exhaustive retrieval.

### Download source

`RuntimeDownload` defaults to fixed `Version: "b10621"`,
`BaseUrl: "https://github.com/ggml-org/llama.cpp/releases/download"` and empty
`Assets` (the bundled manifest). It is not automatically latest.
Downloads use `{BaseUrl}/{Version}/{FileName}` with size/SHA-256 verification.
A mirror must host identical archives. Another version requires all approved
asset fields: `platform`, `backend`, `fileName`, `bytes`, `sha256`.
Platforms are win-x64/linux-x64, backends Cpu/Cuda/Vulkan, filenames .zip/.tar.gz,
at most 32 assets of at most 16 GiB each. BaseUrl must be HTTPS without
credentials/query/fragment. The pinned catalog has no Linux CUDA or Mac archive.
Models, GPU drivers and OS prerequisites are never downloaded by this API.

## HTTP API

`MapTextControlAI(prefix = "/api", administrationPolicy = null,
enableRuntimeConfiguration = true)` returns a route group.
JSON field names use camelCase. Unless the host changes serialization, enum
values in raw HTTP JSON are numeric; prefer the browser SDK's declared shapes.

| Method / path relative to /api | Request / response |
| --- | --- |
| GET /runtime | RuntimeStatus: state, model, runtime, hardware, gpuLayers, toolCount, error, revision, configuration |
| GET /models | ModelChoice[]: fileName, displayName, sizeInBytes; configuration routes only |
| POST /runtime | RuntimeConfigurationRequest; applies shared model/runtime configuration |
| POST /mcp/test | { mcpEndpoint }; endpoint/tool-count/capability/timing result |
| POST /chat | ChatRequest; NDJSON stream ending in complete or error |
| POST /chat/reset | Empty object; reset chat conversation |
| POST /answers/export | { mode: "chat" or "document", answerId, format }; exports a stored generated answer |
| GET /artifacts/{fileName} | Owned downloadable artifact; do not expose arbitrary server paths |
| GET /document-samples | Available host-provided samples |
| GET /document-samples/{fileName} | DocumentSample: fileName, streamType, data |
| POST /document/assist | DocumentAssistRequest; NDJSON assistance stream |
| POST /document/classify | { documentBase64, sessionId }; classification and suggested actions |
| POST /document/reset | Empty object; reset document conversation, not the editor contents |

The model/configuration routes are omitted when `enableRuntimeConfiguration` is
false. Otherwise the supplied admin policy protects them; **null does not create
an admin boundary**.

`RuntimeConfigurationRequest` fields are `modelFile`, `mcpEndpoint`,
`enableMcp`, `contextSize`, `gpuLayers`, `threads`, `flashAttention`,
`enableReasoning`, `maxOutputTokens`, `temperature`, `topK`, `topP`,
`frequencyPenalty`, `presencePenalty`, `seed` and `hardwareBackend`.
Start from the current `GET /runtime` configuration, modify desired values and
post the complete object; this is not a JSON Patch endpoint. Configuration changes
affect the shared integration instance, not just one chat.

`ChatRequest` contains `message`, optional `attachment: { fileName, data }`
(Base64) and optional `knowledge`. Attachment import is different from generated
answer export.

`DocumentAssistRequest` contains `action` (question/summary/rewrite),
`documentBase64` (native TX snapshot), `sessionId`, `question`,
`selectionStart`, `selectionLength`, `selectedText`, `tone` and `knowledge`.
Rewrite uses selected text; do not treat arbitrary browser offsets as stable
MCP document coordinates.

Streams use `application/x-ndjson`, **not SSE**. Each line is a JSON event with
`type`. Handle `status` updates and terminal `complete` or `error`. Completion
can include `kind`, `text`, `html`, `sessionId`, `answerId`, `artifacts`,
`citations`, `knowledgeMode`, `summary`, `documentBase64`, `streamType` and
selection information depending on workflow. An HTTP 200 stream can still end
with an error event; a stream without completion is incomplete.

Each artifact has `fileName`, `format`, `byteCount` and `downloadUrl`.
Build the download bubble from structured artifacts, not URLs invented in prose.
"PDF please" exports the current document. Use a distinct answer-export button
and `answerId` to export a chat explanation/summary.

## Browser client

The package ships these static web assets (no npm install or UI framework):

```html
<script src="/_content/TXTextControl.AI.AspNetCore/client.js"></script>
<script src="/_content/TXTextControl.AI.AspNetCore/editor.js"></script>
```

The second script is optional. Matching `client.d.ts` and `editor.d.ts` are
included for global-namespace TypeScript integrations. Adapt asset URLs and API
prefixes for your application's PathBase.

```javascript
const ai = new TXTextControlAI.Client({ apiBaseUrl: "/api" });
const controller = new AbortController();
const answer = await ai.chat("Explain this workflow.", event => {
    if (event.type === "status") console.log(event.message);
}, { signal: controller.signal });
console.log(answer.text);
for (const artifact of answer.artifacts || []) {
    console.log(artifact.fileName, ai.url(artifact.downloadUrl));
}
if (answer.answerId) {
    // Invoke only when the user clicks your "Export answer" control.
    // await ai.exportAnswer({ mode: "chat", answerId: answer.answerId, format: "pdf" });
}
```

Constructor options: `apiBaseUrl` (default /api), `credentials` (same-origin),
`headers` (HeadersInit or sync/async function). Never embed service API keys in
those browser headers. Per-call options use Fetch RequestInit including `signal`.
Generic `url` rejects resources outside the configured API; `fetch` returns a
Response, `request` parses JSON, `post` posts JSON, and `stream` consumes NDJSON.
The SDK rejects unsuccessful HTTP responses, error events and incomplete streams.

| Client method family | Calls |
| --- | --- |
| Conversation | chat(message, onEvent, options), resetChat(options) |
| Document | assistDocument(request, onEvent, options), classifyDocument(request, options), resetDocument(options) |
| Answer export | exportAnswer({ mode, answerId, format }, options) |
| Runtime | runtimeInstallation, installRuntime, configureRuntimeDownload, cancelRuntimeInstallation, removeRuntime, unloadModel |
| Knowledge collections | knowledgeCollections, knowledgeStatus, createKnowledgeCollection, renameKnowledgeCollection, deleteKnowledgeCollection |
| Knowledge sources/jobs | uploadKnowledge, knowledgeJobs, knowledgeSources, changeKnowledgeJob, reindexKnowledgeSource, removeKnowledgeSource |
| Retrieval | searchKnowledge, resolveKnowledgePassage, knowledgeSourceUrl |
| Embedding admin | knowledgeEmbedding, configureKnowledgeEmbedding |
| Generic helpers | url, fetch, request, post, stream, runtimeAdmin, knowledgePost |

The complete argument/return declarations are provided in the browser reference
appendix. Render text/Markdown safely; the SDK does not insert HTML or supply a
sanitizing UI. Protect cookie authentication with host anti-CSRF/origin policies.

## Document Editor binding

The application provides its licensed editor instance. Bind once the MVC bootstrap
object exists, before `textControlLoaded`; the adapter waits for the full API:

```javascript
const assistant = new TXTextControlAI.DocumentAssistant({
    client: ai,
    editor: TXTextControl
});
assistant.on("progress", event => console.log(event));
await assistant.ready();
const result = await assistant.execute('Change the style "Heading 1" to red.');
console.log(result.text, result.applied);
```

If the host already observed `textControlLoaded`, pass
`editorOptions: { alreadyReady: true }`. Do not guess readiness. The other option,
`timeoutMilliseconds`, defaults to 30000 for native callbacks/readiness, not inference.

| Object | Methods |
| --- | --- |
| EditorAdapter | ready, on, getSelection, selectRange, replaceSelection, saveDocument, loadDocument, loadFile, dispose |
| EditorAdapter static | streamTypeForFile(name) |
| DocumentAssistant | ready, on, getSelection, selectRange, saveDocument, loadDocument, loadFile, classify, execute, summarize, rephrase, reset, cancel, dispose |

`getSelection` returns `{ start, length, text }`. Default saves use a native TX
snapshot. `loadDocument(streamType, base64)` accepts the editor stream-type name;
`loadFile` maps supported TX/RTF/DOCX/DOC/HTML/PDF extensions.
`execute(question, options)`, `summarize(options)` and `rephrase(tone, options)`
accept cancellation and progress options. `reset` does not clear the editor.
An externally supplied `EditorAdapter` remains caller-owned.

`on` returns an unsubscribe function. Adapter events: ready, selectionChanged,
documentChanged, documentLoaded, error, disposed. Assistant events:
selectionChanged, documentChanged, classified, progress, completed, conflict, error.

Operations serialize and validate document/selection snapshots before applying
AI edits. `EditorConflictError` rejects stale edits. Commits briefly use read-only
mode and restore it; protected documents are not bypassed. Cancellation before
commit prevents dispatch but cannot undo a native mutation already sent.
Timeout/disconnection fails closed; reinitialize an uncertain editor binding.
Use one active assistant per browser/API session, including across tabs. New
Client objects do not create isolated server conversations.

## Runtime administration

Opt in with `MapTextControlAIRuntimeAdministration("AiAdministrators")`.
It supplies endpoints/services, not an admin page.
All mutations require `X-TextControl-Runtime-Admin: 1` **in addition to**
authentication/authorization. The browser SDK adds it automatically.

| Relative to /api/runtime-installation | Body / result |
| --- | --- |
| GET / | Inventory, compatibility limitations and current installation job |
| POST /source | RuntimeDownloadOptions; set validated source/manifest, persist only if configured |
| POST /install | { backend: "Auto", "Cpu", "Cuda", or "Vulkan" }; start background install |
| POST /cancel | {}; cancel current installation |
| POST /unload | {}; unload shared chat model |
| POST /remove | { installationId }; remove managed runtime after checking active use |

Closing the page does not cancel an installation job. Poll
`runtimeInstallation()` for state/progress/stage/error and inventory. Other hosts
sharing the cache must be stopped before removing their engine. Runtime
administration affects the **integration host**, not the MCP host or browser.

## Private Knowledge

Register on the integration host before building the app:

```csharp
using TXTextControl.AI.Knowledge;

var privateDirectory = Path.Combine(
    builder.Environment.ContentRootPath, "App_Data", "Knowledge");
builder.Services.AddTextControlAIKnowledge(new KnowledgeWebOptions(
    new KnowledgeOptions
    {
        DatabasePath = Path.Combine(privateDirectory, "knowledge.db")
    }, "AiUsers")
{
    AdministrationPolicy = "AiAdministrators",
    EvidenceTokenBudget = 2400
});
builder.Services.AddTextControlAIKnowledgeEmbeddings(
    Path.GetFullPath("Models", builder.Environment.ContentRootPath),
    Path.Combine(privateDirectory, "embedding.json"));
// After authentication/authorization middleware:
app.MapTextControlAIKnowledge();
```

Treat the before/after-build fragments as additions to your host, not a second
Program.cs. Embedding registration is optional; keyword retrieval works without
a model. Storage options are `DatabasePath`, `MaxFileBytes` (32 MiB),
`MaxExtractedCharacters` (2000000), `ChunkCharacters` (1800), `MaxPendingJobs` (32),
`MaxChunks` (10000) and `ApprovedImportDirectories` (empty).
`KnowledgeWebOptions` requires Storage and AccessPolicy; EvidenceTokenBudget
defaults to 2400 (128–16000), AdministrationPolicy defaults to null.
Set an admin policy explicitly: otherwise embedding administration only inherits
the Knowledge access policy.

Every non-GET Knowledge route requires `X-TextControl-Knowledge: 1`.
Default prefix is `/api/knowledge`:

| Method / suffix | Body / result |
| --- | --- |
| GET / | Authorized collections |
| GET /status | enabled, embeddingConfigured |
| POST /collections | { name }; collection |
| POST /{collectionId}/rename | { name }; 204 |
| POST /{collectionId}/remove | {}; delete collection, stored sources and jobs |
| POST /search | { collectionId, query, mode, limit, evidenceTokenBudget, versionId }; evidence |
| GET /{collectionId}/jobs | Job list |
| GET /{collectionId}/sources | Active source versions |
| POST /{collectionId}/upload | Binary body, Content-Type application/octet-stream, URL-encoded X-File-Name; jobId |
| POST /{collectionId}/jobs/{jobId} | { retry: true/false }; retry or discard |
| POST /{collectionId}/versions/{versionId}/reindex | {}; jobId |
| POST /{collectionId}/sources/{documentId}/remove | {}; delete source |
| GET /{collectionId}/passages/{chunkId} | Authorized original passage |
| GET /{collectionId}/versions/{versionId}/download | Stored source bytes |
| GET /embedding | Global configuration and available GGUFs, when registered |
| POST /embedding | KnowledgeEmbeddingSettings; restartRequired |

Search modes in raw default JSON are 0 Auto, 1 Keyword, 2 Semantic, 3 Hybrid.
Default limit is 6 (1–50); query length at most 4000 characters.
An optional source version restricts retrieval; results are not exhaustive.

`KnowledgeEmbeddingSettings`: `modelFileName` (null = keyword only),
`dimensions` (384 default, 1–65536), `pooling` (mean default, cls or last),
`queryPrefix` and `documentPrefix` (empty, at most 1000 characters), `sha256`
(computed by the host on save). Files must be within the approved GGUF directory.
Changing these settings requires restarting **the integration host** and
reindexing. In remote mode that means AI.Service, not the website. Embeddings
use a separate lazy CPU process by default and do not replace the chat model.

Chat/document requests may supply
`knowledge: { collectionId, allowDocumentChanges: false, sourceVersionId: null }`.
Grounding uses that authorized scope, treats sources as untrusted data and returns
citations. AllowDocumentChanges permits only explicitly requested mutations; it is
not blanket authorization. Reference passages use source download/resolve routes,
not editor loading. Collection/source deletion is not secure erasure of SQLite
free pages, WAL or backups.

## Remote AI service

The same package supports a separate AI host and a same-origin website proxy.
The website owns user login. The trusted service credential allows it to assert
a delegated user and administrator role; protect it like a privileged secret.

### AI host

Provision `ServiceAuthentication:ApiKey` through a secret store/environment, with
at least 32 random characters. Never commit it or send it to the browser.

```csharp
using TXTextControl.AI.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddTextControlAIServiceAuthentication(
    builder.Configuration.GetSection("ServiceAuthentication"));
builder.Services.AddTextControlAI(
    builder.Configuration.GetSection("LocalAI"),
    options => options.RestrictMcpEndpoints = true);
var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.UseTextControlAI();
app.MapTextControlAI(administrationPolicy: RemoteServiceAuthenticationHandler.AdminPolicy)
   .RequireAuthorization(RemoteServiceAuthenticationHandler.UserPolicy);
app.MapTextControlAIRuntimeAdministration(RemoteServiceAuthenticationHandler.AdminPolicy);
app.Run();
```

Configure HTTPS and ingress limits on the host. Register/map Knowledge there if
required. `RemoteServiceAuthenticationOptions` has ApiKey (empty default) and
AllowLoopbackHttp (false). The HTTP exception is only for explicitly enabled
loopback development, not Docker-to-host production networking.

Service requests require `Authorization: Bearer ...` and `X-TX-AI-Subject`.
Administrator requests also require `X-TX-AI-Administrator: true`, asserted only
by an authenticated trusted website. The package registers policies
`TextControlAIUser` and `TextControlAIAdmin`.

### Website proxy

`RemoteIntegrationOptions`:

| Property | Default | Purpose |
| --- | --- | --- |
| ServiceUrl | null | Approved AI-service API root, including /api/; blank selects local mode in host routing |
| ApiKey | empty | Same server-held service key, at least 32 characters |
| AllowedServiceUrls | empty | Exact approved API-root allowlist |
| AllowLoopbackHttp | false | Opt-in local development only |

Create `RemoteIntegrationConnection(options, absolutePrivateSettingsPath)` and
register it with `AddTextControlAIRemoteConnection(connection)`.
A saved URL overrides the configured selection. Choose local registration/mapping
or `MapTextControlAIRemoteProxy("AiUsers", "AiAdministrators")` at website startup;
do not map both over the same paths.

`MapTextControlAIConnectionAdministration("AiAdministrators")` maps
`/integration-connection` GET/POST and POST `/test`. POST uses `{ serviceUrl }`,
requires `X-TextControl-Connection: 1` and same-origin checks. It saves the URL,
not credentials. A changed URL requires a **website restart**; it does not
restart the AI host or move models. Test validates API reachability/credentials,
not successful model loading.

The proxy forwards GET/POST under its API prefix, streams without response
buffering, rejects redirects, validates destinations and supplies delegated
identity from the authenticated user. It does not forward browser-provided
service authorization or arbitrary identity. Configure trusted reverse-proxy
headers so HTTPS/origin checks reflect the real public request.

Models, engine cache, generated files and Knowledge live on the AI-service
machine in remote mode. MCP owns document-engine sessions/files independently.

## Storage, security and operations

- Session cookie: .TXTextControl.LocalAI.Session, HttpOnly, SameSite Lax, two-hour
  idle timeout. Conversation/model state is process-local; a distributed cache
  alone does not make model/session/artifact ownership horizontally scalable.
- Keep private artifacts, model files, runtime settings, SQLite files and secrets
  out of static folders. Apply quotas, retention, backups and filesystem permissions.
- Protect all APIs with host authentication and separate admin authorization.
  Shared model/runtime configuration affects all users of the instance.
- Configure body limits at every hop. Base64 adds roughly one-third transfer size.
  Knowledge defaults to 32 MiB binary uploads; MCP/proxies may impose lower limits.
- Runtime/model install and embedding changes run on the integration host, not
  wherever the browser or MCP happens to be.
- A Knowledge database warning may indicate filesystem permissions, native SQLite
  loading/trust or database initialization; do not delete the database to diagnose it.
- TLS UntrustedRoot requires correcting certificate trust, not disabling validation.
- Context errors require budgeting schemas/history/evidence as well as document
  text. A model's context allocation and available RAM remain hard constraints.
- No built-in sample admin login is provided by this package. Authentication and
  page rendering are application responsibilities.

## License and support

Preview APIs may change before a stable release. Distributed by Text Control GmbH
under the **Text Control AI Source Available License 1.0**, included as
`LICENSE.txt`. Solutions must retain properly licensed TX Text Control products
as a core component. This is not an unrestricted open-source license. Commercial
SDKs, model weights, inference engines and other dependencies retain their own
licenses. Strong-name signing is assembly identity, not Apple notarization or a
NuGet package-signature guarantee.

Visit [Text Control](https://www.textcontrol.com/) for product, licensing and support.

<!-- BEGIN GENERATED PUBLIC REFERENCE -->


## Public C# reference

Source-derived public types, signatures, parameter defaults and DTO fields for this version.
Bodies are omitted: these signatures are not a standalone compilable program. Concise
initializers and JSON-name/required attributes are preserved. Workflow validation may
require more than C# nullability alone. External types retain their package contracts.
Public engine/service implementation types are advanced integration surfaces; prefer
the documented registration and facade APIs for ordinary applications.

### TXTextControl.AI.AspNetCore.AnswerArtifactRequest

```csharp
public sealed record AnswerArtifactRequest(string Mode, string AnswerId, string Format);
```

### TXTextControl.AI.AspNetCore.ApiEndpoints

```csharp
public static class ApiEndpoints
{
    public static RouteGroupBuilder MapTextControlAI(this IEndpointRouteBuilder endpoints, string prefix = "/api", string? administrationPolicy = null, bool enableRuntimeConfiguration = true);
}
```

### TXTextControl.AI.AspNetCore.ArtifactOwnership

```csharp
/// <summary>Session-bound download grants. Restarting the host revokes these in-memory grants.</summary>
public sealed class ArtifactOwnership
{
    public void Register(string fileName, string owner);
    public bool CanDownload(string fileName, string owner);
}
```

### TXTextControl.AI.AspNetCore.ChatArtifact

```csharp
public sealed record ChatArtifact(string FileName, string Format, long ByteCount, string DownloadUrl);
```

### TXTextControl.AI.AspNetCore.ChatAttachmentRequest

```csharp
public sealed record ChatAttachmentRequest(string FileName, string Data);
```

### TXTextControl.AI.AspNetCore.ChatRequest

```csharp
public sealed record ChatRequest(string? Message, ChatAttachmentRequest? Attachment = null, KnowledgeScope? Knowledge = null);
```

### TXTextControl.AI.AspNetCore.ChunkedDocumentAnalysisResult

```csharp
public sealed record ChunkedDocumentAnalysisResult(string Text, int ChunksAnalyzed, int TotalParagraphs);
```

### TXTextControl.AI.AspNetCore.ChunkedDocumentAnalysisService

```csharp
public sealed class ChunkedDocumentAnalysisService
{
    public ChunkedDocumentAnalysisService(LocalDocumentAiService ai, IOptions<WebAiOptions> configuredOptions);
    public bool Enabled { get; }

    public async Task<ChunkedDocumentAnalysisResult> AnalyzeAsync(string sessionId, string request, bool structuredSummary, Func<DocumentAnalysisProgress, ValueTask>? progress = null, CancellationToken cancellationToken = default);
}
```

### TXTextControl.AI.AspNetCore.ContextManagementOptions

```csharp
public sealed class ContextManagementOptions
{
    public bool Enabled { get; set; } = true;
    public double CharactersPerToken { get; set; } = 2.0;
    public int SafetyMarginTokens { get; set; } = 1_024;
    public int ToolResultReserveTokens { get; set; } = 4_096;
    public int MaxDocumentChunkCharacters { get; set; } = 48_000;
    public int MaxDocumentChunks { get; set; } = 128;
}
```

### TXTextControl.AI.AspNetCore.ConversationStore

```csharp
public sealed class ConversationStore(IOptions<WebAiOptions> options)
{
    public ConversationState Get(string browserSessionId, string mode);
    public sealed class ConversationState(int maxHistoryMessages)
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public List<ChatMessage> Messages { get; } = [];
        public long ModelRevision { get; set; } = -1;
        public string? DocumentSessionId { get; set; }
        public string? LastExportFormat { get; set; }

        public ChatMessage[] CreateModelMessages();
        public void Compact();
        public string StoreGeneratedAnswer(string markdown, string request, KnowledgeScope? knowledge = null);
        public bool TryGetGeneratedAnswer(string id, out GeneratedAnswer answer);
        public void Reset(long revision, string systemPrompt);
    }

    public sealed record GeneratedAnswer(string Markdown, string Request, KnowledgeScope? Knowledge = null);
}
```

### TXTextControl.AI.AspNetCore.DocumentAnalysisProgress

```csharp
public sealed record DocumentAnalysisProgress(string Message, int Chunk, int? TotalChunks);
```

### TXTextControl.AI.AspNetCore.DocumentAssistRequest

```csharp
public sealed record DocumentAssistRequest(string Action, string DocumentBase64, string? SessionId, string? Question, int? SelectionStart, int? SelectionLength, string? SelectedText, string? Tone, KnowledgeScope? Knowledge = null);
```

### TXTextControl.AI.AspNetCore.DocumentClassification

```csharp
public sealed record DocumentClassification(string SessionId, string Category, double Confidence, IReadOnlyList<string> Signals, IReadOnlyList<DocumentQuickAction> SuggestedActions);
```

### TXTextControl.AI.AspNetCore.DocumentClassificationRequest

```csharp
public sealed record DocumentClassificationRequest(string DocumentBase64, string? SessionId);
```

### TXTextControl.AI.AspNetCore.DocumentInspectionPage

```csharp
public sealed record DocumentInspectionPage(string SessionId, int TotalParagraphs, IReadOnlyList<DocumentInspectionParagraph> Paragraphs, bool Truncated, int? NextParagraphIndex);
```

### TXTextControl.AI.AspNetCore.DocumentInspectionParagraph

```csharp
public sealed record DocumentInspectionParagraph(int Index, string Text, string? StyleName);
```

### TXTextControl.AI.AspNetCore.DocumentQuickAction

```csharp
public sealed record DocumentQuickAction(string Id, string Title, string Description, string Prompt);
```

### TXTextControl.AI.AspNetCore.DocumentSample

```csharp
public sealed record DocumentSample(string FileName, string StreamType, string Data);
```

### TXTextControl.AI.AspNetCore.DocumentSampleCatalog

```csharp
public sealed class DocumentSampleCatalog(IWebHostEnvironment environment)
{
    public IReadOnlyList<string> List();
    public async Task<DocumentSample> ReadAsync(string fileName, CancellationToken cancellationToken);
}
```

### TXTextControl.AI.AspNetCore.DocumentSummary

```csharp
public sealed record DocumentSummary(string Overview, IReadOnlyList<string> KeyPoints);
```

### TXTextControl.AI.AspNetCore.IInferenceChatClientFactory

```csharp
/// <summary>Extension point for additional APIs. Return a new client whose lifetime is owned by the integration.</summary>
public interface IInferenceChatClientFactory
{
    bool CanCreate(string provider);
    IChatClient Create(InferenceProfile profile, TimeSpan requestTimeout);
}
```

### TXTextControl.AI.AspNetCore.InferenceProfile

```csharp
/// <summary>A host-approved inference destination. Browser requests select only its name.</summary>
public sealed class InferenceProfile
{
    public string Name { get; set; } = "";
    public string Provider { get; set; } = "OpenAI";
    public Uri Endpoint { get; set; } = new("https://api.openai.com/v1");
    public string Model { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public int ContextSize { get; set; } = 32_768;
    public int MaxOutputTokens { get; set; } = 4_096;
    public bool SupportsTools { get; set; } = true;
    /// <summary>False by default: omit sampling controls for models that reject them.</summary>
    public bool SendSamplingParameters { get; set; }
    /// <summary>Optional provider reasoning effort. Null keeps the provider default; None explicitly disables reasoning.</summary>
    public ReasoningEffort? ReasoningEffort { get; set; }
}
```

### TXTextControl.AI.AspNetCore.InferenceProfileInfo

```csharp
/// <summary>Credential-free browser metadata. Local profiles have no API endpoint or fixed model.</summary>
public sealed record InferenceProfileInfo(string Name, string Provider, string? Endpoint, string? Model, int ContextSize, int MaxOutputTokens, bool SupportsTools, bool SendSamplingParameters);
```

### TXTextControl.AI.AspNetCore.InferenceProfileTestRequest

```csharp
public sealed record InferenceProfileTestRequest(string InferenceProfile);
```

### TXTextControl.AI.AspNetCore.InstallRuntimeRequest

```csharp
public sealed record InstallRuntimeRequest(string Backend);
```

### TXTextControl.AI.AspNetCore.KnowledgeCitation

```csharp
public sealed record KnowledgeCitation(string CitationId, KnowledgePassage Source);
```

### TXTextControl.AI.AspNetCore.KnowledgeEmbeddingAdministration

```csharp
/// <summary>Host-approved model directory and private settings. Changes take effect on the next host restart.</summary>
public sealed class KnowledgeEmbeddingAdministration : IDisposable
{
    public KnowledgeEmbeddingSettings Current { get; }

    public void Dispose();
    public KnowledgeEmbeddingAdministration(string modelDirectory, string settingsPath);
    public object Status();
    public async Task SaveAsync(KnowledgeEmbeddingSettings settings, CancellationToken ct);
}
```

### TXTextControl.AI.AspNetCore.KnowledgeEmbeddingServiceCollectionExtensions

```csharp
public static class KnowledgeEmbeddingServiceCollectionExtensions
{
    public static IServiceCollection AddTextControlAIKnowledgeEmbeddings(this IServiceCollection services, string modelDirectory, string settingsPath, LlamaServerModelOptions? runtime = null);
}
```

### TXTextControl.AI.AspNetCore.KnowledgeEmbeddingSettings

```csharp
public sealed record KnowledgeEmbeddingSettings(string? ModelFileName = null, int Dimensions = 384, string Pooling = "mean", string QueryPrefix = "", string DocumentPrefix = "", string? Sha256 = null);
```

### TXTextControl.AI.AspNetCore.KnowledgeEvidence

```csharp
public sealed record KnowledgeEvidence(KnowledgeSearchResult Search, bool AllowDocumentChanges)
{
    public ChatMessage[] AddTo(ChatMessage[] messages);
    public KnowledgeCitation[] Citations(string response);
    public string SanitizeCitationIds(string response);
}
```

### TXTextControl.AI.AspNetCore.KnowledgeGrounding

```csharp
public sealed class KnowledgeGrounding(KnowledgeStore store, KnowledgeWebOptions options, IAuthorizationService authorization)
{
    public async Task CheckAccessAsync(KnowledgeScope scope, HttpContext context, CancellationToken ct);
    public async Task<KnowledgeEvidence> RetrieveAsync(KnowledgeScope scope, string question, HttpContext context, CancellationToken ct);
}
```

### TXTextControl.AI.AspNetCore.KnowledgeIntegration

```csharp
public static class KnowledgeIntegration
{
    public static IServiceCollection AddTextControlAIKnowledge(this IServiceCollection services, KnowledgeWebOptions options);
    public static IEndpointRouteBuilder MapTextControlAIKnowledge(this IEndpointRouteBuilder endpoints, string prefix = "/api/knowledge");
    public sealed record CreateKnowledgeCollectionRequest(string Name);
    public sealed record ChangeKnowledgeJob(bool Retry);
}
```

### TXTextControl.AI.AspNetCore.KnowledgeScope

```csharp
public sealed record KnowledgeScope(string CollectionId, bool AllowDocumentChanges = false, string? SourceVersionId = null);
```

### TXTextControl.AI.AspNetCore.KnowledgeWebOptions

```csharp
public sealed record KnowledgeWebOptions(KnowledgeOptions Storage, string AccessPolicy)
{
    public int EvidenceTokenBudget { get; init; } = 2400;
    public string? AdministrationPolicy { get; init; }
}
```

### TXTextControl.AI.AspNetCore.LocalAiWarmupService

```csharp
public sealed partial class LocalAiWarmupService(LocalDocumentAiService ai, IOptions<WebAiOptions> options, ILogger<LocalAiWarmupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken);
}
```

### TXTextControl.AI.AspNetCore.LocalDocumentAiService

```csharp
public sealed partial class LocalDocumentAiService : IAsyncDisposable
{
    public LocalDocumentAiService(IWebHostEnvironment environment, IOptions<WebAiOptions> configuredOptions, ILogger<LocalDocumentAiService> logger);
    public LocalDocumentAiService(IWebHostEnvironment environment, IOptions<WebAiOptions> configuredOptions, ILogger<LocalDocumentAiService> logger, IEnumerable<IInferenceChatClientFactory> inferenceFactories);
    public RuntimeStatus Status { get; }

    /// <summary>Runs a small billable prompt, without documents or MCP tools, and does not change the active profile.</summary>
    public async Task TestInferenceProfileAsync(string profileName, CancellationToken cancellationToken = default);
    public IReadOnlyList<InferenceProfileInfo> GetInferenceProfiles();
    public IReadOnlyList<ModelChoice> GetModels();
    public async Task InitializeAsync(CancellationToken cancellationToken = default);
    public async Task<RuntimeStatus> ConfigureAsync(RuntimeConfigurationRequest requested, CancellationToken cancellationToken = default);
    public async Task<McpConnectionTestResult> TestMcpConnectionAsync(string endpoint, CancellationToken cancellationToken = default);
    public async Task<ChatResponse> GetResponseAsync(IReadOnlyList<ChatMessage> messages, bool useDocumentTools, IReadOnlySet<string>? allowedToolNames = null, CancellationToken cancellationToken = default);
    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IReadOnlyList<ChatMessage> messages, bool useDocumentTools, IReadOnlySet<string>? allowedToolNames = null, CancellationToken cancellationToken = default);
    public async Task<string> LoadDocumentIntoMcpAsync(string base64Document, string? sessionId, string? sourceFormat = null, CancellationToken cancellationToken = default);
    public async Task<string> GetDocumentFromMcpAsync(string sessionId, CancellationToken cancellationToken = default);
    public async Task<DocumentClassification> ClassifyDocumentAsync(string sessionId, CancellationToken cancellationToken = default);
    public async Task<DocumentInspectionPage> InspectDocumentAsync(string sessionId, int startParagraphIndex, int maxCharacters, string? query = null, int contextParagraphs = 0, CancellationToken cancellationToken = default);
    public async Task<DocumentExportResult> SaveDocumentAsync(string sessionId, string format, string? fileName = null, CancellationToken cancellationToken = default);
    public async Task<DocumentExportResult> CreateAnswerDocumentAsync(string markdown, string format, string? fileName = null, CancellationToken cancellationToken = default);
    public async Task<DocumentExportResult> DownloadMcpExportAsync(string sessionId, string format, string downloadUri, string? fileName = null, CancellationToken cancellationToken = default);
    public async ValueTask DisposeAsync();
    public async Task UnloadModelAsync(CancellationToken token = default);
}
```

### TXTextControl.AI.AspNetCore.McpConnectionTestRequest

```csharp
public sealed record McpConnectionTestRequest(string McpEndpoint);
```

### TXTextControl.AI.AspNetCore.McpConnectionTestResult

```csharp
public sealed record McpConnectionTestResult(string Endpoint, int ToolCount, bool HasCreateDocument, bool HasDocumentExport, long ElapsedMilliseconds);
```

### TXTextControl.AI.AspNetCore.McpEndpointCredential

```csharp
public sealed class McpEndpointCredential
{
    public string Endpoint { get; set; } = "";
    public string Token { get; set; } = "";
}
```

### TXTextControl.AI.AspNetCore.McpKnowledgeDocumentExtractor

```csharp
/// <summary>Reads text locally and delegates rich-document extraction to a trusted MCP host, never to the LLM.</summary>
public sealed class McpKnowledgeDocumentExtractor(HttpClient http, Func<Uri> endpoint, Func<Uri, bool> isTrusted, Func<Uri, string?> credential, int maximumCharacters = 2_000_000, int maximumFileBytes = 32 * 1024 * 1024) : IKnowledgeDocumentExtractor, IDisposable
{
    public string Version { get; }

    public void Dispose();
    public async Task<IReadOnlyList<KnowledgeBlock>> ExtractAsync(string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken);
}
```

### TXTextControl.AI.AspNetCore.ModelChoice

```csharp
public sealed record ModelChoice(string FileName, string DisplayName, long SizeInBytes);
```

### TXTextControl.AI.AspNetCore.OpenAIInferenceChatClientFactory

```csharp
public sealed class OpenAIInferenceChatClientFactory : IInferenceChatClientFactory
{
    public bool CanCreate(string provider);
    public IChatClient Create(InferenceProfile profile, TimeSpan requestTimeout);
}
```

### TXTextControl.AI.AspNetCore.RemoteIntegrationConnection

```csharp
/// <summary>Host-owned connection configuration. Changes take effect after restarting the website.</summary>
public sealed class RemoteIntegrationConnection : IDisposable
{
    public Uri? ServiceUri { get; }
    public string ApiKey { get; }

    public void Dispose();
    public RemoteIntegrationConnection(RemoteIntegrationOptions options, string settingsPath);
    public Uri? Validate(string? value);
    public async Task SaveAsync(string? value, CancellationToken ct);
    public sealed record ConnectionRequest(string? ServiceUrl);
}
```

### TXTextControl.AI.AspNetCore.RemoteIntegrationExtensions

```csharp
public static class RemoteIntegrationExtensions
{
    public static IServiceCollection AddTextControlAIRemoteConnection(this IServiceCollection services, RemoteIntegrationConnection connection);
    public static void MapTextControlAIConnectionAdministration(this IEndpointRouteBuilder endpoints, string administrationPolicy, string prefix = "/integration-connection");
    public static RouteGroupBuilder MapTextControlAIRemoteProxy(this IEndpointRouteBuilder endpoints, string accessPolicy, string administrationPolicy, string prefix = "/api");
}
```

### TXTextControl.AI.AspNetCore.RemoteIntegrationOptions

```csharp
public sealed class RemoteIntegrationOptions
{
    public string? ServiceUrl { get; set; }
    public string ApiKey { get; set; } = "";
    public string[] AllowedServiceUrls { get; set; } = [];
    public bool AllowLoopbackHttp { get; set; }
}
```

### TXTextControl.AI.AspNetCore.RemoteServiceAuthenticationExtensions

```csharp
public static class RemoteServiceAuthenticationExtensions
{
    public static IServiceCollection AddTextControlAIServiceAuthentication(this IServiceCollection services, IConfiguration configuration);
}
```

### TXTextControl.AI.AspNetCore.RemoteServiceAuthenticationHandler

```csharp
public sealed class RemoteServiceAuthenticationHandler(IOptionsMonitor<RemoteServiceAuthenticationOptions> options, ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<RemoteServiceAuthenticationOptions>(options, logger, encoder)
{
    public const string SchemeName = "TextControlAIService";
    public const string UserPolicy = "TextControlAIUser";
    public const string AdminPolicy = "TextControlAIAdmin";
    protected override Task<AuthenticateResult> HandleAuthenticateAsync();
}
```

### TXTextControl.AI.AspNetCore.RemoteServiceAuthenticationOptions

```csharp
/// <summary>Server-to-server credential. Provision through a secret store, never browser configuration.</summary>
public sealed class RemoteServiceAuthenticationOptions : AuthenticationSchemeOptions
{
    public string ApiKey { get; set; } = "";
    public bool AllowLoopbackHttp { get; set; }
}
```

### TXTextControl.AI.AspNetCore.RemoveRuntimeRequest

```csharp
public sealed record RemoveRuntimeRequest(string InstallationId);
```

### TXTextControl.AI.AspNetCore.RuntimeAdministrationEndpoints

```csharp
/// <summary>Maps opt-in runtime administration, separately from ordinary chat endpoints.</summary>
public static class RuntimeAdministrationEndpoints
{
    public static RouteGroupBuilder MapTextControlAIRuntimeAdministration(this IEndpointRouteBuilder endpoints, string administrationPolicy, string prefix = "/api/runtime-installation");
}
```

### TXTextControl.AI.AspNetCore.RuntimeConfigurationRequest

```csharp
public sealed record RuntimeConfigurationRequest(string ModelFile, string McpEndpoint, bool EnableMcp, int ContextSize, int GpuLayers, int? Threads, bool? FlashAttention, bool EnableReasoning, int MaxOutputTokens, float Temperature, int TopK, float TopP, float? FrequencyPenalty, float? PresencePenalty, int? Seed, HardwareBackend HardwareBackend = HardwareBackend.Auto)
{
    public string InferenceProfile { get; init; } = "Local";
}
```

### TXTextControl.AI.AspNetCore.RuntimeInstallationService

```csharp
/// <summary>Owns a cancellable installation job independent of HTTP request lifetimes.</summary>
public sealed class RuntimeInstallationService(IOptions<WebAiOptions> options, LocalDocumentAiService ai) : IHostedService, IDisposable
{
    public RuntimeInstallationState Status { get; }

    public async Task<RuntimeInstallationState> GetStatusAsync(CancellationToken token);
    public async Task ConfigureDownloadAsync(RuntimeDownloadOptions download, CancellationToken token);
    public void Install(string requestedBackend);
    public void Cancel();
    public async Task RemoveAsync(string installationId, CancellationToken token);
    public Task StartAsync(CancellationToken cancellationToken);
    public async Task StopAsync(CancellationToken cancellationToken);
    public void Dispose();
}
```

### TXTextControl.AI.AspNetCore.RuntimeInstallationState

```csharp
public sealed record RuntimeInstallationState(string State, float Progress, string Stage, string? Error, RuntimeInstallationInfo Runtime)
{
    public bool DownloadSettingsPersistenceEnabled { get; init; }
}
```

### TXTextControl.AI.AspNetCore.RuntimeStatus

```csharp
public sealed record RuntimeStatus(string State, string? Model, string? Runtime, string? Hardware, string? GpuLayers, int ToolCount, string? Error, long Revision, RuntimeConfigurationRequest Configuration);
```

### TXTextControl.AI.AspNetCore.ServiceCollectionExtensions

```csharp
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddTextControlAI(this IServiceCollection services, IConfiguration configuration, Action<WebAiOptions>? configure = null);
    public static IServiceCollection AddTextControlAI(this IServiceCollection services, Action<WebAiOptions>? configure = null);
    public static IApplicationBuilder UseTextControlAI(this IApplicationBuilder app);
}
```

### TXTextControl.AI.AspNetCore.TrustedProcessingEndpoints

```csharp
/// <summary>Explicit host-owned trust policy; remote private-document processing is never enabled by a browser URL alone.</summary>
public static class TrustedProcessingEndpoints
{
    public static bool IsTrusted(Uri endpoint, IEnumerable<string> allowed);
    public static void ValidateKnowledge(WebAiOptions settings, bool enableMcp, Uri mcpEndpoint);
    public static void ValidateKnowledge(WebAiOptions settings, bool enableMcp, Uri mcpEndpoint, string profileName);
}
```

### TXTextControl.AI.AspNetCore.WebAiOptions

```csharp
public sealed class WebAiOptions
{
    public const string SectionName = "LocalAI";
    /// <summary>Default host-approved profile. Local preserves the existing GGUF workflow.</summary>
    public string InferenceProfile { get; set; } = "Local";
    /// <summary>Named external inference profiles. URLs and credentials are configured only on the AI host.</summary>
    public InferenceProfile[] InferenceProfiles { get; set; } = [];
    public bool WarmupOnStartup { get; set; } = true;
    public bool AutoInstallRuntime { get; set; }
    public long MaximumExportBytes { get; set; } = 128L * 1024 * 1024;
    public int ExportDownloadTimeoutSeconds { get; set; } = 120;
    /// <summary>Runtime storage directory. Omitted, null or blank values use the standard application-data directory.</summary>
    public string? RuntimeCacheDirectory { get; set; }
    /// <summary>Pinned runtime release, HTTPS mirror root and optional custom asset manifest.</summary>
    public LlamaServer.RuntimeDownloadOptions RuntimeDownload { get; set; } = new();
    /// <summary>Optional host-owned JSON file for admin overrides, relative to content root. Null disables persistence.</summary>
    public string? RuntimeDownloadSettingsFile { get; set; }
    public string? LlamaServerExecutablePath { get; set; }
    public Uri? LlamaServerEndpoint { get; set; }
    public string LlamaServerApiKey { get; set; } = "local";
    public HardwareBackend HardwareBackend { get; set; } = HardwareBackend.Auto;
    public string ModelDirectory { get; set; } = "Models";
    public string ModelPath { get; set; } = "Qwen3-8B-Q6_K.gguf";
    public string McpEndpoint { get; set; } = "http://127.0.0.1:5000/mcp";
    public bool McpEnabled { get; set; } = true;
    public string[] TrustedMcpEndpoints { get; set; } = [];
    public string[] TrustedInferenceEndpoints { get; set; } = [];
    public bool RestrictMcpEndpoints { get; set; }
    /// <summary>Optional server-side bearer credentials scoped to exact MCP endpoints. Never supplied by the browser.</summary>
    public McpEndpointCredential[] McpCredentials { get; set; } = [];
    public int McpConnectionTimeoutSeconds { get; set; } = 15;
    public int ContextSize { get; set; } = 65_536;
    public int GpuLayers { get; set; } = -1;
    public int? Threads { get; set; }
    public bool? FlashAttention { get; set; }
    public bool EnableReasoning { get; set; }
    public int InferenceTimeoutSeconds { get; set; } = 600;
    public int MaxConversationTurns { get; set; } = 6;
    public ContextManagementOptions ContextManagement { get; set; } = new();
    public ChatGenerationSettings Generation { get; set; } = new();
}
```

## Browser reference

Global declarations shipped beside the scripts: all methods, options, events and result
fields. No npm/ES-module package is implied.

### client.d.ts

```typescript
/** Browser globals provided by client.js. No dependency on the Document Editor. */
declare namespace TXTextControlAI {
    interface ClientOptions {
        apiBaseUrl?: string;
        credentials?: RequestCredentials;
        headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
    }
    interface RequestOptions extends RequestInit { }
    interface InferenceProfileInfo { name: string; provider: string; endpoint: string | null; model: string | null; contextSize: number; maxOutputTokens: number; supportsTools: boolean; sendSamplingParameters: boolean; }
    interface ChatAttachment { fileName: string; data: string; }
    interface ChatOptions extends RequestOptions { attachment?: ChatAttachment; knowledge?: KnowledgeScope | null; }
    interface KnowledgeScope { collectionId: string; allowDocumentChanges?: boolean; sourceVersionId?: string | null; }
    interface KnowledgeCollection { id: string; name: string; owner: string; }
    interface KnowledgePassage { id: string; collectionId: string; documentId: string; versionId: string; fileName: string; locator: string; text: string; score: number; }
    interface KnowledgeSearchRequest { collectionId: string; query: string; mode?: 0 | 1 | 2 | 3; limit?: number; evidenceTokenBudget?: number; versionId?: string | null; }
    interface KnowledgeSearchResult { mode: 0 | 1 | 2 | 3; passages: KnowledgePassage[]; estimatedTokens: number; notice: string; }
    interface KnowledgeJob { id: string; collectionId: string; documentId: string; fileName: string; state: string; progress: number; error?: string; versionId?: string; }
    interface KnowledgeSource { documentId: string; versionId: string; fileName: string; hash: string; chunkCount: number; }
    interface KnowledgeEmbeddingSettings { modelFileName?: string | null; dimensions: number; pooling: "mean" | "cls" | "last"; queryPrefix?: string; documentPrefix?: string; sha256?: string; }
    interface Artifact { fileName: string; format: string; byteCount: number; downloadUrl: string; }
    interface StreamEvent {
        type: string;
        message?: string;
        tool?: string;
        elapsedMilliseconds?: number;
        [key: string]: unknown;
    }
    interface CompleteEvent extends StreamEvent {
        type: "complete";
        kind?: string;
        text?: string;
        html?: string | null;
        sessionId?: string | null;
        answerId?: string;
        artifacts?: Artifact[];
        citations?: { citationId: string; source: KnowledgePassage }[];
        knowledgeMode?: string;
        documentBase64?: string | null;
        streamType?: string | null;
        selectionStart?: number | null;
        selectionLength?: number | null;
        summary?: { overview: string; keyPoints: string[] };
    }
    interface DocumentAssistRequest {
        action: "question" | "summary" | "rewrite";
        documentBase64: string;
        sessionId?: string | null;
        question?: string | null;
        selectionStart?: number | null;
        selectionLength?: number | null;
        selectedText?: string | null;
        tone?: string | null;
        knowledge?: KnowledgeScope | null;
    }
    interface ClassificationRequest { documentBase64: string; sessionId?: string | null; }
    interface Classification {
        sessionId: string;
        category: string;
        confidence: number;
        signals: string[];
        suggestedActions: { id: string; title: string; description: string; prompt: string }[];
    }
    interface RuntimeDownload {
        version: string;
        baseUrl: string;
        assets: { platform: "win-x64" | "linux-x64"; backend: "Cpu" | "Cuda" | "Vulkan"; fileName: string; bytes: number; sha256: string }[];
    }
    class Client {
        constructor(options?: ClientOptions);
        readonly baseUrl: URL;
        url(path: string): string;
        fetch(path: string, options?: RequestOptions): Promise<Response>;
        request<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
        post<T = unknown>(path: string, payload: unknown, options?: RequestOptions): Promise<T>;
        stream(path: string, payload: unknown, onEvent?: (event: StreamEvent) => void, options?: RequestOptions): Promise<CompleteEvent>;
        chat(message: string, onEvent?: (event: StreamEvent) => void, options?: ChatOptions): Promise<CompleteEvent>;
        assistDocument(request: DocumentAssistRequest, onEvent?: (event: StreamEvent) => void, options?: RequestOptions): Promise<CompleteEvent>;
        classifyDocument(request: ClassificationRequest, options?: RequestOptions): Promise<Classification>;
        resetDocument(options?: RequestOptions): Promise<unknown>;
        resetChat(options?: RequestOptions): Promise<unknown>;
        exportAnswer(request: { mode: "chat" | "document"; answerId: string; format: string }, options?: RequestOptions): Promise<unknown>;
        runtimeInstallation(options?: RequestOptions): Promise<unknown>;
        inferenceProfiles(options?: RequestOptions): Promise<InferenceProfileInfo[]>;
        testInferenceProfile(name: string, options?: RequestOptions): Promise<unknown>;
        runtimeAdmin(action: string, payload?: unknown, options?: RequestOptions): Promise<unknown>;
        installRuntime(backend?: "Auto" | "Cpu" | "Cuda" | "Vulkan", options?: RequestOptions): Promise<unknown>;
        configureRuntimeDownload(download: RuntimeDownload, options?: RequestOptions): Promise<unknown>;
        cancelRuntimeInstallation(options?: RequestOptions): Promise<unknown>;
        removeRuntime(installationId: string, options?: RequestOptions): Promise<unknown>;
        unloadModel(options?: RequestOptions): Promise<unknown>;
        knowledgeCollections(options?: RequestOptions): Promise<KnowledgeCollection[]>;
        knowledgeStatus(options?: RequestOptions): Promise<{ enabled: boolean; embeddingConfigured: boolean }>;
        knowledgeEmbedding(options?: RequestOptions): Promise<{ current: KnowledgeEmbeddingSettings; availableModels: string[] }>;
        configureKnowledgeEmbedding(settings: KnowledgeEmbeddingSettings, options?: RequestOptions): Promise<{ restartRequired: boolean; message: string }>;
        createKnowledgeCollection(name: string, options?: RequestOptions): Promise<KnowledgeCollection>;
        renameKnowledgeCollection(collectionId: string, name: string, options?: RequestOptions): Promise<void>;
        deleteKnowledgeCollection(collectionId: string, options?: RequestOptions): Promise<void>;
        searchKnowledge(request: KnowledgeSearchRequest, options?: RequestOptions): Promise<KnowledgeSearchResult>;
        knowledgeJobs(collectionId: string, options?: RequestOptions): Promise<KnowledgeJob[]>;
        knowledgeSources(collectionId: string, options?: RequestOptions): Promise<KnowledgeSource[]>;
        reindexKnowledgeSource(collectionId: string, versionId: string, options?: RequestOptions): Promise<{ jobId: string }>;
        changeKnowledgeJob(collectionId: string, jobId: string, retry: boolean, options?: RequestOptions): Promise<unknown>;
        removeKnowledgeSource(collectionId: string, documentId: string, options?: RequestOptions): Promise<unknown>;
        resolveKnowledgePassage(collectionId: string, chunkId: string, options?: RequestOptions): Promise<KnowledgePassage>;
        knowledgeSourceUrl(collectionId: string, versionId: string): string;
        uploadKnowledge(collectionId: string, file: File, options?: RequestOptions): Promise<{ jobId: string }>;
    }
}
```

### editor.d.ts

```typescript
/// <reference path="client.d.ts" />
/** Browser globals provided by editor.js. The application supplies the licensed editor. */
declare namespace TXTextControlAI {
    interface OperationOptions { signal?: AbortSignal; }
    interface Selection { start: number; length: number; text: string; }
    interface EditorAdapterOptions {
        /** Set only if the host has already observed textControlLoaded. */
        alreadyReady?: boolean;
        /** Ready/native callback deadline; default 30000 ms. Not an inference timeout. */
        timeoutMilliseconds?: number;
    }
    type EditorErrorCallback = (error: { msg?: string; message?: string; handled?: boolean }) => void;
    /** MVC startup object, available before the WebSocket supplies the full editor API. */
    interface EditorBootstrap {
        addEventListener(name: string, callback: (...args: unknown[]) => void): void;
    }
    /** Structural subset of the official TXTextControl JavaScript API after textControlLoaded. */
    interface EditorInstance extends EditorBootstrap {
        removeEventListener(name: string, callback: (...args: unknown[]) => void): void;
        StreamType: Record<string, number>;
        EditMode: { Edit: number; ReadOnly: number };
        getEditMode(callback: (mode: number) => void, error?: EditorErrorCallback): void;
        setEditMode(mode: number, callback?: () => void, error?: EditorErrorCallback): void;
        saveDocument(type: number, callback: (event: { data: string }) => void, settings?: unknown, error?: EditorErrorCallback): void;
        loadDocument(type: number, data: string, callback: () => void, settings?: unknown, error?: EditorErrorCallback): void;
        focus(): void;
        selection: {
            getStart(callback: (value: number) => void, error?: EditorErrorCallback): void;
            getLength(callback: (value: number) => void, error?: EditorErrorCallback): void;
            getText(callback: (value: string) => void, error?: EditorErrorCallback): void;
            setStart(value: number, callback?: () => void, error?: EditorErrorCallback): void;
            setLength(value: number, callback?: () => void, error?: EditorErrorCallback): void;
            setText(value: string, callback?: () => void, error?: EditorErrorCallback): void;
        };
    }
    interface EditorEvents {
        ready: void;
        selectionChanged: Selection;
        documentChanged: number;
        documentLoaded: { generation: number };
        error: Error;
        disposed: void;
    }
    class EditorConflictError extends Error { constructor(message?: string); }
    class EditorAdapter {
        static streamTypeForFile(name: string): string | undefined;
        constructor(editor: EditorBootstrap, options?: EditorAdapterOptions);
        readonly editor: EditorBootstrap & Partial<EditorInstance>;
        readonly isReady: boolean;
        ready(options?: OperationOptions): Promise<void>;
        on<K extends keyof EditorEvents>(name: K, callback: (event: EditorEvents[K]) => void): () => void;
        getSelection(options?: OperationOptions): Promise<Selection>;
        selectRange(start: number, length: number, options?: OperationOptions & { focus?: boolean }): Promise<void>;
        replaceSelection(text: string, options?: OperationOptions): Promise<void>;
        saveDocument(options?: OperationOptions & { streamType?: string }): Promise<string>;
        loadDocument(streamType: string, data: string, options?: OperationOptions): Promise<void>;
        loadFile(file: File, options?: OperationOptions): Promise<void>;
        dispose(): void;
    }
    interface AssistanceOptions extends OperationOptions { onProgress?: (event: StreamEvent) => void; knowledge?: KnowledgeScope | null; }
    interface AssistanceResult extends CompleteEvent { applied: boolean; }
    interface AssistantEvents {
        selectionChanged: Selection;
        documentChanged: number;
        classified: Classification;
        progress: StreamEvent;
        completed: AssistanceResult;
        conflict: EditorConflictError;
        error: Error;
    }
    class DocumentAssistant {
        constructor(options: { client: Client; editor: EditorBootstrap | EditorAdapter; editorOptions?: EditorAdapterOptions });
        readonly client: Client;
        readonly adapter: EditorAdapter;
        readonly sessionId: string | null;
        ready(options?: OperationOptions): Promise<void>;
        on<K extends keyof AssistantEvents>(name: K, callback: (event: AssistantEvents[K]) => void): () => void;
        getSelection(options?: OperationOptions): Promise<Selection>;
        selectRange(start: number, length: number, options?: OperationOptions & { focus?: boolean }): Promise<void>;
        saveDocument(options?: OperationOptions & { streamType?: string }): Promise<string>;
        loadDocument(streamType: string, data: string, options?: OperationOptions): Promise<void>;
        loadFile(file: File, options?: OperationOptions): Promise<void>;
        classify(options?: OperationOptions): Promise<Classification>;
        execute(question: string, options?: AssistanceOptions): Promise<AssistanceResult>;
        summarize(options?: AssistanceOptions): Promise<AssistanceResult>;
        rephrase(tone?: string, options?: AssistanceOptions): Promise<AssistanceResult>;
        reset(options?: OperationOptions): Promise<void>;
        cancel(): void;
        dispose(): void;
    }
}
```

<!-- END GENERATED PUBLIC REFERENCE -->
