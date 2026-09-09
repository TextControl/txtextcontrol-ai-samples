# Local chat

A minimal interactive prompt/response loop using `TXTextControl.AI`. Each prompt is independent; the sample does not preserve conversation history.

## Prerequisites

Install the .NET 10 SDK and .NET 8 runtime. Windows/Linux/macOS require a compatible platform-specific llama-server runtime and an application-owned GGUF chat model. See [runtime setup](../../docs/runtime-and-models.md) and the [license](../../LICENSE.txt).

No MCP or Document Editor is required to execute this focused API example. Use within solutions under the repository's TX Text Control license terms.

## Run

From the repository root, after provisioning the runtime:

```sh
dotnet run --project samples/LocalChat -- "/path/to/chat-model.gguf"
```

Enter a prompt, then enter `exit` to finish. The sample prints model/runtime details and the generated answer.

## Configuration and troubleshooting

The single argument is the GGUF path. Use an absolute path, especially when running from another directory. Set `TXTEXTCONTROL_AI_LLAMA_SERVER` to an installed executable or install a managed runtime explicitly using the package API described in the runtime guide. Startup does not download missing runtimes by default.

Model files are not included. Missing-runtime, unsupported-model and insufficient-memory errors are separate from NuGet restore errors. Try a smaller model/context if memory is limited. See the [complete AI API guide](../../docs/api/TXTextControl.AI.md) for `LocalModelOptions`, cancellation, disposal and session behavior.
