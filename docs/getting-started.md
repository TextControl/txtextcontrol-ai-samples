# Getting started

## Prerequisites

Build the collection with a stable .NET 10 SDK. AI applications target .NET 8 and require the .NET/ASP.NET Core 8 runtimes at execution time; MCP hosts target .NET 10. Install both SDKs for the simplest developer setup. Review [licensing](../LICENSE.txt), native TX requirements and [runtime/model setup](runtime-and-models.md).

The first public restore requires the pinned preview AI/MCP packages to be available on NuGet.org. No private source, signing key or local NuGet feed is expected. Until publication, maintainers can test candidates with an external temporary NuGet.Config; do not commit that feed or its credentials.

## Full application, on one Windows/Linux computer

1. Restore/build `TXTextControl.AI.Samples.sln`.
2. Follow [McpServer](../samples/McpServer/README.md) to generate a private admin password, then start it. Its Development endpoint is `http://127.0.0.1:5000/mcp`.
3. In another terminal, run `dotnet run --project samples/WebDocumentAssistant`.
4. Open `http://localhost:5187`. The application contains the full original `TXTextControl.AI.Web` page, editor, Chat, Runtime and Knowledge UI.
5. In Runtime, test MCP, install a runtime explicitly or use a configured executable, select an application-owned GGUF chat model and load it.
6. Try Chat: create a sample invoice, edit it, and export the current document. Try Document Studio: open an included RTF, select text, rewrite it, and apply an edit.

Runtime installation is a separate step from selecting a GGUF. A chat model is separate from an optional retrieval embedding model. The initial sample does not assume a particular model filename.

## Split hosting

Start [AiService](../samples/AiService/README.md) on the inference machine. Configure the web host's permitted service URL and service key. Models and Knowledge belong on the AI service; the document editor belongs on the web host; document conversion belongs on MCP. See [remote setup](remote-ai-service.md).

On an Apple Silicon Mac, use [the MacBook workflow](../deploy/macbook/README.md): native AI.Service plus Linux web/MCP containers. Do not attempt to load the TX document engine directly on macOS.

## Ports in the local examples

| Component | Address |
| --- | --- |
| Full MCP | `http://127.0.0.1:5000/mcp` |
| WebDocumentAssistant | `http://localhost:5187` |
| AiService | `http://127.0.0.1:5080/api/` (authenticated; HTTP requires explicit local opt-in) |
| MinimalMcpHost | `http://127.0.0.1:5082/mcp` |
| MinimalWeb | `http://127.0.0.1:5083` |

The Mac deployment uses a separate HTTPS port arrangement described in its guide. Host settings and launch profiles can override URLs; make sure client configuration matches the actual listening address.

## Troubleshooting

- Package not found: check pinned package publication and the supplied source mapping. No `artifacts/packages` feed should be required by a public checkout.
- SQLite advisory: the three Knowledge-enabled samples explicitly reference `SQLitePCLRaw.bundle_e_sqlite3` 3.0.5 to protect restores of the original beta.1 Knowledge package. Keep that reference when copying a sample, restore and rebuild; the resolved native package should be `SQLite` 3.53.4, not `SQLitePCLRaw.lib.e_sqlite3` 2.1.6. No database deletion or reindexing is needed.
- Runtime missing: follow runtime setup; model startup does not automatically install one by default.
- `libgomp.so.1` missing: install the native prerequisites on the machine actually running the engine, not only the browser host.
- TLS errors: trust the correct CA on the calling host and check the hostname. Do not disable certificate validation.
- Authentication errors: match service keys server-side, configure allowlists and use HTTPS outside loopback development.
- Indexing errors: verify the MCP extraction endpoint, supported format/OCR and embedding compatibility. Restart the AI-owning host after embedding changes.
- Context or memory errors: reduce context/model size; do not assume a larger context fits every machine.
