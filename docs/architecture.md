# Application and package boundaries

```text
Browser
  -> WebDocumentAssistant (pages, styling, Document Editor, identity)
       -> local AI integration OR authenticated proxy to AiService
            -> local llama-server inference runtime + GGUF models
            -> Knowledge store and optional embedding process
            -> HTTP(S) MCP document host (Windows/Linux)
```

The full web sample is not a shared UI library. It owns its original pages and application JavaScript. `TXTextControl.AI.AspNetCore` supplies reusable C# integration, HTTP endpoints, `client.js`, `editor.js` and their TypeScript declarations. Browser assets are automatically included by package restore/publish.

`AiService` hosts those same integration APIs independently without a separate admin website. The web sample's existing admin panels access it through a same-origin authenticated proxy. API credentials and allowed target URLs remain on servers, never in browser configuration.

`TXTextControl.AI.McpServer` supplies the document operations and engine worker pool. `McpServer` owns admin pages, host authentication and startup; `MinimalMcpHost` demonstrates the smallest development host. Keep worker argument dispatch before building the web host. The MCP native engine runs on Windows/Linux, not macOS.

Knowledge TXT/Markdown ingestion is local to the AI host; rich document extraction is delegated to MCP. Embeddings are optional and separate from the chat model. In remote mode, the AI host owns model files, runtime installation, Knowledge state and generated AI answers.

All sample project references are NuGet PackageReference entries. Internal library source, private signing infrastructure and private repository history are not part of this collection. Full public API guides are in [api](api/README.md).
