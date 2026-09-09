# Remote AI integration service

For a private Apple Silicon Mac with native AI and containerized Web/MCP, see the
[MacBook deployment bundle](../deploy/macbook/README.md). It provisions explicit
sample login, server credentials and locally trusted HTTPS without disabling TLS checks.

The website can use the complete AI integration on another machine. Its Chat,
Document Studio, Runtime and Knowledge pages remain website-owned; the remote host
does not serve a second admin website.

Browser → website `/api` proxy → HTTPS AI service `/api` → independent MCP server.
The Document Editor stays with the website. No cross-origin browser API or CORS is
needed. Inference, runtime installation, indexing and retrieval run on
the AI-service machine. This is not a new remote-model-provider abstraction.

## Configure the AI host

Publish `samples/AiService` and configure it through environment
variables, a deployment secret store or development user secrets:

```text
ServiceAuthentication__ApiKey=<a cryptographically random secret of at least 32 characters>
LocalAI__ModelDirectory=/srv/textcontrol-ai/models
LocalAI__ModelPath=your-chat-model.gguf
LocalAI__RuntimeCacheDirectory=/srv/textcontrol-ai/runtimes
LocalAI__McpEndpoint=https://documents.example.internal/mcp
LocalAI__TrustedMcpEndpoints__0=https://documents.example.internal/mcp
```

The sample fails startup without a service credential. Generate your own secret;
the repository includes no usable default. Configure Kestrel HTTPS with a certificate
trusted by the website host, bind only the required interface and firewall access
to the website host. Standard certificate and hostname validation remains enabled.
Do not expose the raw llama-server port.

The default listener is **loopback HTTP port 5080**, not a public listener. For
same-machine development only, explicitly set
`ServiceAuthentication__AllowLoopbackHttp=true`. This accepts HTTP only from an
actual loopback peer. A different machine must use HTTPS. When using TLS termination,
prefer TLS on the proxy-to-service hop too; do not trust arbitrary forwarded headers
to bypass this requirement. The sample intentionally does not enable forwarded-header
trust automatically.

The service enables Knowledge without a native TX Text Control dependency.
Disable it with `Knowledge__Enabled=false` if not needed. Rich references are sent
to the MCP extraction endpoint; TXT/Markdown remain local. Provision TX engine assets,
fonts and licensing on MCP, and inference runtime/system libraries/drivers on the AI host.

Upgrade/restart both MCP and AI.Service to use `<McpEndpoint>/knowledge/extract`.
The API base/proxy must route this child endpoint as well as `/mcp`. LocalAI's configured
MCP endpoint and scoped credentials are reused, independently of the chat tools toggle.
Existing Knowledge sources remain stored on AI.Service; reindex to adopt the new
extractor version. This removes the TX document-engine dependency from macOS AI hosts,
but does not add managed macOS runtime downloads or certify inference there. Supply a compatible
llama-server runtime for that platform; the managed download catalog remains unchanged.

If the MCP ingress requires a bearer token, configure an exact endpoint-scoped
credential on the AI host (never in JavaScript):

```text
LocalAI__McpCredentials__0__Endpoint=https://documents.example.internal/mcp
LocalAI__McpCredentials__0__Token=<MCP ingress credential>
```

This credential is used for MCP calls, knowledge extraction and same-origin export downloads. Redirects
are disabled. The MCP server/ingress must independently validate that credential;
these changes do not add an authentication scheme to the MCP server itself.

## Configure the website

```text
RemoteIntegration__ServiceUrl=https://ai.example.internal/api/
RemoteIntegration__AllowedServiceUrls__0=https://ai.example.internal/api/
RemoteIntegration__ApiKey=<the same server-to-server secret>
```

`AllowedServiceUrls` is a host-owned allowlist of exact API bases, not an arbitrary
URL permission. Include `/api/`. Secrets and the allowlist are configured outside
the UI. The website injects the secret server-side; it ignores browser-supplied
authorization and identity headers when forwarding requests. Redirects, cross-site
requests and targets escaping the approved API base are rejected. Streaming replies
are forwarded without full-response buffering; only the AI session cookie is relayed.

In **Runtime → Integration service**, enter an approved URL, **Test connection**, then
**Save connection**. Restart the **website** to apply a mode/URL change. This does not
restart the AI service or load/download a model. Blank URL selects the local engine.
The sample displays the remote model directory once connected.

Only the URL is saved in the website's private `App_Data/integration-connection.json`.
That file overrides `RemoteIntegration:ServiceUrl` after restart. To return to purely
environment-managed selection, remove that single override file deliberately.
The website does not migrate models, conversations or collections between hosts.
For same-machine HTTP testing the website additionally requires
`RemoteIntegration__AllowLoopbackHttp=true`; this never permits a non-loopback HTTP URL.

The old `IntegrationApiBaseUrl` sample setting is rejected with migration guidance.
The browser now always uses same-origin `/api`; configure `RemoteIntegration` instead.

## Security and ownership

- The service credential authenticates **one trusted website**, which delegates its
  authenticated end-user ID and administrator role. Possession of that credential
  grants delegation authority: store it securely, restrict ingress, rotate it on both
  hosts and do not distribute it to end users. This is not a public client API key.
- The website sample retains its **localhost-only development identity**. Before
  sharing the website, replace it with your application's OIDC/cookie authentication,
  a stable tenant-qualified user ID and separate AI-user/AI-admin policies. Do not
  weaken the loopback check to simulate production login. The reusable proxy accepts
  independent `accessPolicy` and `administrationPolicy` names.
- Runtime/model/MCP changes, installations and global embedding configuration require
  the service administrator policy. Ordinary users cannot enable themselves as admins
  using browser headers. Configuration is process-wide.
- Knowledge uses the existing fail-closed owner policy. Replace it with an explicit
  organization/tenant ACL policy if users should share collections.
- Browser conversations and generated answers are scoped to the authenticated subject
  **and** the browser session. Artifact routes check a session-bound download grant.
  Download grants are in memory and revoked by a host restart. Old artifact files can
  remain on disk but cannot be downloaded through a new grant automatically.
- Private reference evidence may go only to loopback processing or exact, explicitly
  trusted HTTPS MCP/inference endpoints in `TrustedMcpEndpoints` and
  `TrustedInferenceEndpoints`. These are host-owned settings, not chat/admin prompts.
- The service limits request bodies to 64 MiB and concurrent HTTP requests to 32
  without an unbounded queue. Add deployment-specific per-user quotas, request-rate
  controls and operational monitoring at your authenticated ingress.

This beta is not a general hostile multi-tenant MCP sandbox. A trusted integration
uses one MCP connection and a process-wide model configuration. Deploy separate service
and MCP instances for separate trust domains; do not rely on model-generated tool
arguments as a tenant security boundary.

## Where files live

| Data | Location in remote mode |
|---|---|
| Chat and embedding GGUF weights | AI host's `LocalAI:ModelDirectory`; default `Models` relative to its content root |
| Downloaded engine binaries | AI host's `LocalAI:RuntimeCacheDirectory`, or its standard application-data cache |
| Knowledge DB, sources and embedding settings | AI host's private `App_Data/Knowledge` directory |
| Generated downloads | AI host's private `artifacts` directory |
| URL override | Website's `App_Data/integration-connection.json` |
| Rich-document extraction and document execution | Windows/Linux MCP host; the editor UI stays on the website |

Place your own compatible GGUF files on the AI host, then select them using the same
Runtime and Knowledge screens. Models are not uploaded or downloaded by the URL
setting. Chat and embedding models are separate files/processes. Runtime binaries
are installed only by explicit administration or an explicitly configured auto-install
policy. Embedding configuration changes still require an **AI-host restart** and
reindexing, not a website restart.

Use persistent writable volumes for those AI directories. Do not publish private
data as static files. Back up the knowledge DB and protect backups. Set file permissions
and retention/cleanup operationally. Current conversations, download grants and model
state remain process-local: use a single AI instance (or deliberate affinity), not
round-robin replicas. A distributed session cache alone does not make this durable.

`/health` reports host availability; authenticated `/api/runtime` reports model status.
The Runtime page's host/path details are administrator-only.
