# TX Text Control AI samples

Build document-aware AI applications with the TX Text Control AI and MCP NuGet packages. This repository contains application source only: the reusable libraries and document engine are consumed as packages. No private library repository, signing key, or package-building step is required.

> **Preview / release preparation:** the pinned AI/MCP package versions must be published before a clean public restore can succeed. The current candidate also has a known transitive SQLite advisory; see [release readiness](docs/release-readiness.md). This checkout is not yet a cleared production release.

## Choose a sample

| Sample | What you can build | Runs on |
| --- | --- | --- |
| [LocalChat](samples/LocalChat/README.md) | Minimal prompt/response loop | Windows, Linux, macOS with compatible inference runtime |
| [LocalStreaming](samples/LocalStreaming/README.md) | Streaming output | Same |
| [LocalStructuredOutput](samples/LocalStructuredOutput/README.md) | Typed JSON extraction | Same |
| [LocalToolCalling](samples/LocalToolCalling/README.md) | Call application functions | Same |
| [McpChat](samples/McpChat/README.md) | Console document assistant using remote MCP | Same; MCP on Windows/Linux |
| [MinimalWeb](samples/MinimalWeb/README.md) | Small custom browser UI using the JavaScript client | Same; MCP on Windows/Linux |
| [WebDocumentAssistant](samples/WebDocumentAssistant/README.md) | **Full TXTextControl.AI.Web application**: Chat, Document Studio, Runtime, Knowledge and exports | Windows/Linux; native AI can be on another host |
| [AiService](samples/AiService/README.md) | Independently hosted AI, runtime administration and Knowledge | Windows, Linux, macOS with compatible inference runtime |
| [MinimalMcpHost](samples/MinimalMcpHost/README.md) | Minimal document-engine MCP host | Windows/Linux |
| [McpServer](samples/McpServer/README.md) | Full MCP host with its own admin pages and style settings | Windows/Linux |

## Start here

1. Install a stable **.NET 10 SDK** to build the collection. Install the **.NET 8 / ASP.NET Core 8 runtimes** to run AI samples; MCP targets .NET 10. SDK 8 includes the required .NET 8 runtimes.
2. Review the [license](LICENSE.txt), TX Text Control licensing requirements and [third-party notices](THIRD-PARTY-NOTICES.md).
3. Follow [getting started](docs/getting-started.md). Supply your own licensed GGUF model and compatible inference runtime. Model weights and runtimes are not included or downloaded by NuGet restore.
4. Choose a sample above. Every project uses normal NuGet references with versions in [Directory.Packages.props](Directory.Packages.props).

```sh
dotnet restore TXTextControl.AI.Samples.sln
dotnet build TXTextControl.AI.Samples.sln -c Release --no-restore
```

The full application keeps its original `TXTextControl.AI.Web.csproj`, assembly, pages, branding, editor integration and all feature panels. Only its location and package references change. Reusable `client.js` and `editor.js` come from `TXTextControl.AI.AspNetCore`, not copied library JavaScript.

## Hosting options

- Local development: full web sample with local inference plus a separate local MCP host.
- Remote inference: web sample proxies to [AiService](samples/AiService/README.md) over an authenticated connection; models, runtimes and Knowledge reside on the AI host.
- Apple Silicon: [native AI with Linux web/MCP containers](deploy/macbook/README.md).
- Other deployments: [Docker build instructions](deploy/docker/README.md) and [security guidance](docs/security-and-deployment.md).

Minimal samples deliberately restrict unauthenticated traffic to local development. Do not expose them publicly by changing a listening URL. The full samples provide private single-user deployment helpers, not a production multi-tenant identity system.

## Documentation

- [Architecture](docs/architecture.md)
- [Models and runtimes](docs/runtime-and-models.md)
- [Remote AI service](docs/remote-ai-service.md)
- [Knowledge and embeddings](docs/knowledge.md)
- [Browser / Document Editor SDK](docs/editor-javascript-sdk.md)
- [Complete package API guides](docs/api/README.md)
- [Release checks](docs/release-readiness.md)

No models, native runtime downloads, secrets, private databases or generated documents belong in Git. Sample RTF files contain illustrative data only. See [SECURITY.md](SECURITY.md) for responsible reporting and [Text Control support](https://www.textcontrol.com/support/) for product help.
