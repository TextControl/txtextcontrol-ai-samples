# TX Text Control AI service sample

Optional OpenAI and compatible inference providers are configured on the AI host.

### Beta 2: OpenAI document workflows

Use the beta.2 AI integration packages on both the website and any separate AI.Service.
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

This is the original `TXTextControl.AI.Service.csproj` under the `AiService` sample folder. Install .NET 10 SDK plus ASP.NET Core 8 runtime. It consumes the same NuGet integration package as the full web application and retains runtime administration, remote chat/document workflows, streaming, downloads and Knowledge.

Independently hosts inference, AI/MCP workflows, downloads, runtime administration
and optional private Knowledge. The website's existing UI uses it through an
authenticated same-origin proxy; no separate admin UI is required here.

## Same-machine development

Generate one service key and store it in both hosts (PowerShell 5.1 compatible):

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$serviceKey = [Convert]::ToBase64String($bytes)
dotnet user-secrets set 'ServiceAuthentication:ApiKey' "$serviceKey" --project samples/AiService
dotnet user-secrets set 'ServiceAuthentication:AllowLoopbackHttp' 'true' --project samples/AiService
dotnet user-secrets set 'RemoteIntegration:ApiKey' "$serviceKey" --project samples/WebDocumentAssistant
dotnet user-secrets set 'RemoteIntegration:ServiceUrl' 'http://127.0.0.1:5080/api/' --project samples/WebDocumentAssistant
dotnet user-secrets set 'RemoteIntegration:AllowedServiceUrls:0' 'http://127.0.0.1:5080/api/' --project samples/WebDocumentAssistant
dotnet user-secrets set 'RemoteIntegration:AllowLoopbackHttp' 'true' --project samples/WebDocumentAssistant
dotnet run --project samples/AiService
```

In another terminal run `dotnet run --project samples/WebDocumentAssistant`. Configure the AI host's model directory first. The local MCP default is `http://127.0.0.1:5000/mcp`; other endpoints must also be included in `LocalAI:TrustedMcpEndpoints`. The service health URL is `http://127.0.0.1:5080/health`. Actual API routes remain authenticated.

For a different machine, use trusted HTTPS, not either loopback-HTTP opt-in. Bash users can generate a key with `openssl rand -hex 32` and set the same keys. Never paste a service key into browser JavaScript. The remote guide explains hosting, storage and credential scope in detail.

See [remote service configuration](../../docs/remote-ai-service.md) for secure setup,
the website URL setting, credentials, HTTPS and storage locations.

Configure a random `ServiceAuthentication:ApiKey` before starting. There is no
default secret. The default loopback HTTP listener does not accept authenticated
requests unless `AllowLoopbackHttp` is explicitly enabled for local development;
remote deployment requires HTTPS. Do not expose this host without those controls.

Supply GGUF models in this host's `LocalAI:ModelDirectory`. The website and MCP
machines do not need copies of the inference models. Runtime downloads are explicit
by default. Rich-document extraction is delegated to the Windows/Linux MCP host; no native TX Text Control engine is required by AI.Service. Deploy updated MCP and AI.Service binaries together. A compatible inference runtime is still required on the AI host.

Publish with `dotnet publish -c Release`. Provision models and private data separately;
the project excludes `Models`, `App_Data` and generated `artifacts` from publication.
