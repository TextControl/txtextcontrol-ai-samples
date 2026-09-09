# Minimal MCP host

Host document operations with `TXTextControl.AI.McpServer` using only service registration, endpoint mapping and the required worker-entry dispatch. There is no AI model or admin UI in this host.

## Requirements and run

Use .NET 10 and appropriately licensed TX Text Control products on Windows or Linux. Restore the native SDK assets through the configured feeds. Linux additionally requires compatible native libraries and fonts; see [MCP package prerequisites](../../docs/api/TXTextControl.McpServer.md).

From PowerShell:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --project samples/MinimalMcpHost
```

From Bash:

```sh
ASPNETCORE_ENVIRONMENT=Development dotnet run --project samples/MinimalMcpHost
```

Connect a Streamable HTTP MCP client to `http://127.0.0.1:5082/mcp`. A direct browser GET is not a successful MCP interaction; test with an MCP client. Point your AI client's endpoint at this address instead of the full host's default port 5000.

`appsettings.json` configures document storage, worker count/queue capacity, style roles, page layout and presets. The full settings/tool reference is in the [package guide](../../docs/api/TXTextControl.McpServer.md).

This sample only runs in Development and rejects non-loopback peers. It has no authentication or admin pages. For deployment use [McpServer](../McpServer/README.md), preserve the worker dispatch before web startup, and configure authenticated HTTPS. Do not run the TX document engine natively on macOS.
