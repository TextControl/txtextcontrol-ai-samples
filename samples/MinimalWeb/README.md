# Minimal browser client

A small application-owned Razor page demonstrates the reusable `TXTextControlAI.Client` from `TXTextControl.AI.AspNetCore`. It supports chat progress, answers and document downloads without the full application UI.

## Run

1. Install .NET 10 SDK plus ASP.NET Core 8 runtime.
2. Start [McpServer](../McpServer/README.md) at `http://127.0.0.1:5000/mcp`.
3. Configure `LocalAI:ModelDirectory`, `LocalAI:ModelPath` and `LocalAI:LlamaServerExecutablePath` (or explicitly install the runtime beforehand). See [runtime setup](../../docs/runtime-and-models.md).
4. Run:

```sh
dotnet run --project samples/MinimalWeb
```

Open `http://127.0.0.1:5083`. The launch profile selects Development; the sample refuses production startup and rejects non-loopback peers. Running without a launch profile requires an explicit Development environment.

This page has no model/runtime administration panel. Set its configuration before sending a request. `ModelPath` can be relative to `ModelDirectory`; model files are never committed. Startup and NuGet restore do not install missing runtimes automatically.

The script is served from `/_content/TXTextControl.AI.AspNetCore/client.js`. No separate npm build or copied library JavaScript is required. See [ASP.NET Core API](../../docs/api/TXTextControl.AI.AspNetCore.md) for endpoint settings and the complete browser interface.

For document editing, Knowledge, runtime administration and remote hosting, use [the full web application](../WebDocumentAssistant/README.md).
