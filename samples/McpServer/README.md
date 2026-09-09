# MCP server with administration UI

The full document MCP host, with application-owned Razor pages for server settings, capabilities, styles and diagnostics. The engine, workers and MCP tools are supplied by `TXTextControl.AI.McpServer`; no implementation source is required.

## Local setup

Install .NET 10 and the required licensed TX Text Control Windows/Linux components. Linux native prerequisites and package settings are documented in the [MCP guide](../../docs/api/TXTextControl.McpServer.md).

Generate a strong admin credential using PowerShell (including Windows PowerShell 5.1):

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$adminPassword = [Convert]::ToBase64String($bytes)
dotnet user-secrets set 'Admin:Username' 'admin' --project samples/McpServer
dotnet user-secrets set 'Admin:Password' "$adminPassword" --project samples/McpServer
dotnet run --project samples/McpServer
```

Keep the generated value in your password manager; it is the login password. There is no built-in password. On Bash, generate with `openssl rand -hex 32` and set the same user-secret keys. User secrets are development-only and are not an encrypted production secret store.

Open `http://127.0.0.1:5000/admin`; connect AI clients to `http://127.0.0.1:5000/mcp`. Development accepts loopback peers only. Stop and back up private state before moving or replacing storage.

## Configuration

`McpServer:BasePath` holds private documents. `DocumentWorkerPool` configures worker count/capacity. `DocumentAutomation` contains page defaults, capability packs, style roles and presets. The admin pages allow changes supported by the server; the configuration file must be writable if you use persisted settings. Credentials should come from secrets/environment variables, not edits committed to appsettings.json.

## Deployment

Outside Development, startup requires `McpServiceAuthentication:Required=true`, a random `McpServiceAuthentication:ApiKey` of at least 32 characters, and the separate strong admin password. Serve HTTPS; non-HTTPS requests are rejected. Configure the same endpoint-scoped MCP token on the AI host. Do not expose native worker ports or mount the Docker socket.

The deployment helper is intended for a private single-user setup. Add your application's identity/authorization, rate limiting and network controls before shared public use. See [Docker](../../deploy/docker/README.md), [MacBook](../../deploy/macbook/README.md), and [security](../../docs/security-and-deployment.md).
