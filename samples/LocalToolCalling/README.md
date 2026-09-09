# Application tool calling

Exposes an application-owned time-zone function through `Microsoft.Extensions.AI` and lets the chat model invoke it.

## Prerequisites

Install the .NET 10 SDK and .NET 8 runtime. Windows/Linux/macOS require a compatible platform-specific llama-server runtime and an application-owned GGUF chat model. See [runtime setup](../../docs/runtime-and-models.md) and the [license](../../LICENSE.txt).

No MCP or Document Editor is required to execute this focused API example. Use within solutions under the repository's TX Text Control license terms.

## Run

From the repository root, after provisioning the runtime:

```sh
dotnet run --project samples/LocalToolCalling -- "/path/to/chat-model.gguf"
```

The model can invoke `GetCurrentTime` and return the time in Berlin. Use a tool-capable chat model. Only expose functions you intend the model to call; external side effects should require application authorization.

## Configuration and troubleshooting

The single argument is the GGUF path. Use an absolute path, especially when running from another directory. Set `TXTEXTCONTROL_AI_LLAMA_SERVER` to an installed executable or install a managed runtime explicitly using the package API described in the runtime guide. Startup does not download missing runtimes by default.

Model files are not included. Missing-runtime, unsupported-model and insufficient-memory errors are separate from NuGet restore errors. Try a smaller model/context if memory is limited. See the [complete AI API guide](../../docs/api/TXTextControl.AI.md) for `LocalModelOptions`, cancellation, disposal and session behavior.
