# Console MCP document assistant

The original `TXTextControl.MCP.LocalAI` console application, consuming `TXTextControl.AI` and `TXTextControl.AI.Mcp` as packages. It discovers MCP tools and maintains a bounded conversation plus the current document session ID.

## Run

1. Install .NET 10 SDK plus .NET 8 runtime and a [compatible inference runtime](../../docs/runtime-and-models.md).
2. Start [McpServer](../McpServer/README.md) locally at `http://127.0.0.1:5000/mcp`.
3. In this sample's `appsettings.json`, set `ModelPath` to your GGUF and `McpEndpoint` to the local server. Relative model paths are resolved against that configuration file's directory. Do not commit a personal absolute path.
4. Run from the repository root:

```sh
dotnet run --project samples/McpChat
```

Ask it to create a document, then ask a follow-up edit or export. Enter `exit` to quit. `InferenceTimeoutSeconds` controls the per-request timeout. The model must support tool calling and have enough context for discovered schemas.

This sample uses the MCP client directly. It does not include the full web integration's token-aware document analysis, identity delegation or admin UI. For secured remote services and full document workflows, use [WebDocumentAssistant](../WebDocumentAssistant/README.md). Never expose an unauthenticated MCP service to make the console sample connect.

See [MCP client API](../../docs/api/TXTextControl.AI.Mcp.md), [runtime setup](../../docs/runtime-and-models.md) and [security](../../docs/security-and-deployment.md).
