# TX Text Control AI service sample

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
