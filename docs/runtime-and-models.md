# Runtime and model setup

A GGUF is a model file. `llama-server` is the executable that runs it. Supply both for the target machine. NuGet restore does not download either; ordinary startup defaults to refusing a missing runtime rather than downloading one.

## Web application

Configure `LocalAI:ModelDirectory` or place your licensed GGUF in the sample's ignored `Models` directory. In Runtime, explicitly install a supported runtime, then select/load a model. Alternatively set `LocalAI:LlamaServerExecutablePath` to an existing executable. A service account needs write access to the configured runtime cache and private state directories.

In remote mode these settings and files belong on AiService, not on the web machine. `LocalAI:RuntimeCacheDirectory` selects a persistent cache location. The Runtime UI is an administration client for the active AI host.

## Console / minimal examples

Provision a compatible llama-server and set its absolute path before running the sample:

```powershell
$env:TXTEXTCONTROL_AI_LLAMA_SERVER = 'C:\runtimes\llama-server.exe'
dotnet run --project samples/LocalChat -- 'C:\models\chat-model.gguf'
```

```sh
export TXTEXTCONTROL_AI_LLAMA_SERVER=/opt/llama/bin/llama-server
dotnet run --project samples/LocalChat -- /srv/models/chat-model.gguf
```

These are illustrative paths you supply; no such files are shipped. On Apple Silicon, a compatible native Homebrew llama.cpp installation can supply the executable; the Mac guide uses that approach.

The package also supports explicit installation without loading a model:

```csharp
using TXTextControl.AI;
await LocalRuntime.InstallAsync(new LocalModelOptions { HardwareBackend = HardwareBackend.Cpu });
```

This call intentionally downloads a supported runtime and should be exposed only in an authorized setup/admin workflow. Managed catalog downloads cover Windows/Linux x64; macOS uses an explicit compatible executable. The packaged catalog is pinned, not automatically latest. Custom releases/mirrors require matching asset metadata and hashes. See [runtime administration](runtime-administration.md) and [download sources](runtime-download-sources.md).

## Models and memory

Use a chat/instruction model for inference and a retrieval embedding model for semantic search. Not every GGUF can do both. Check the model's license, template, context limits and engine compatibility. Tool calling and structured output require compatible models. Model weights are never included in Git or deployment archives.

Reduce model/context size when RAM is limited. Context capacity, GPU offload, chat generation and embeddings all consume resources; a small Mac does not automatically support the full configured context. Preserve native runtime notices and validate upgrades separately from package updates.
