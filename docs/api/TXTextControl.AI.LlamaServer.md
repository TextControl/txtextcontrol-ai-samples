# TX Text Control AI llama-server Runtime

`TXTextControl.AI.LlamaServer` runs GGUF inference in an isolated llama-server
process and supplies a `Microsoft.Extensions.AI` chat client and embedding
generator. It handles process ownership, startup health checks, streaming,
runtime acquisition and hardware reporting. It does not include model weights,
a document engine, web endpoints or an administration UI.

Most applications should start with `TXTextControl.AI`. Use this lower-level
package when you need direct runtime control or a separate embedding process.

## Contents

- [Getting started](#getting-started)
- [Model options](#model-options)
- [Runtime administration](#runtime-administration)
- [Download configuration](#download-configuration)
- [Embedding generation](#embedding-generation)
- [Deployment and troubleshooting](#deployment-and-troubleshooting)

## Getting started

Targets .NET 8. Install from your approved package feed:

```sh
dotnet add package TXTextControl.AI.LlamaServer --prerelease
```

On Windows x64 or supported Linux x64/glibc, prepare a managed runtime explicitly:

```csharp
using Microsoft.Extensions.AI;
using TXTextControl.AI.LlamaServer;

var options = new LlamaServerModelOptions
{
    HardwareBackend = LlamaServerHardwareBackend.Cpu,
    ForceCpu = true,
    ContextSize = 8192
};
await LlamaServerRuntime.InstallAsync(options); // One-time setup.
using var model = await LlamaServerModel.LoadAsync(
    Path.GetFullPath("Models/chat.gguf"), options);
using IChatClient chat = model.CreateChatClient();
var response = await chat.GetResponseAsync("Describe a document review workflow.");
Console.WriteLine(response.Text);
```

For a compatible preinstalled engine, use `ExecutablePath` and omit installation.
macOS is supported through a host-provisioned compatible executable, not through
the managed Windows/Linux download catalog. A Metal-capable native engine runs
on the Mac, not inside a Linux Docker container.

`LlamaServerModel` implements `IDisposable`, not `IChatClient`:
call `CreateChatClient()`. Keep the model alive while its clients are in use.
Client disposal does not transfer process ownership; model disposal stops its
owned process. Callers retain/resubmit chat history and cancellation tokens.

## Model options

`LlamaServerModelOptions` uses the following defaults:

| Property | Default | Description |
| --- | --- | --- |
| ExecutablePath | null | Explicit executable location; trusted host configuration |
| Endpoint | null | Existing HTTP(S) raw llama-server endpoint; skips owned startup |
| RuntimeAcquisition | NeverDownload | Or DownloadIfMissing |
| RuntimeCacheDirectory | null | Blank selects standard account-local cache |
| RuntimeDownload | new() | Fixed download source and manifest |
| ModelId | null | Model ID used with an external endpoint |
| ApiKey | local | External inference credential; not a safe production shared secret |
| ContextSize | 8192 | Allocated input/output context |
| GpuLayers | -1 | Maximum possible offload; 0 disables layer offload |
| Threads | null | Automatic CPU thread selection |
| BatchSize / UBatchSize | 512 / 512 | Logical / physical prompt batch size |
| MaxOutputTokens | 1024 | Default response limit |
| Temperature | 0.6 | Default sampling temperature |
| TopK / TopP | 40 / 0.95 | Default top-k / nucleus sampling |
| FrequencyPenalty / PresencePenalty | null / null | Provider defaults when unset |
| Seed | null | Optional random seed |
| FlashAttention | null | Runtime decides; true/false overrides |
| UseMemoryMapping | true | Map model weights |
| UseMemoryLocking | false | Request physical-memory locking |
| MainGpu | 0 | Primary GPU index |
| ForceCpu | false | Force CPU independently of backend preference |
| HardwareBackend | Auto | Auto, Cpu, Cuda, Vulkan; observed Metal is reported for compatible supplied engines |
| EnableReasoning | false | Runtime/model reasoning toggle |
| StartupTimeout | 3 minutes | Model startup deadline |
| RequestTimeout | 10 minutes | Inference deadline |
| AdditionalArguments | empty | Additional argv entries, not a shell command; conflicts are host responsibility |

Generation options supplied through `ChatOptions` override defaults. This package
does not perform document chunking or maintain chat history. Its tool-call
compatibility handling does not authorize tools or guarantee a model will call
them correctly. Add authorized function-invocation middleware separately.

Public model calls:

| Member | Contract |
| --- | --- |
| IsAvailable(executablePath = null) | Checks executable discovery, not complete model compatibility |
| LoadAsync(modelPath, options = null, progress = null, cancellationToken = default) | Returns loaded LlamaServerModel; progress is IProgress<float> |
| Info | LlamaServerModelInfo with path, GGUF metadata and runtime information |
| Endpoint | Address used for inference |
| CreateChatClient() | New caller-disposed IChatClient |
| Dispose() | Stops owned resources; does not terminate an external endpoint |

An external `Endpoint` is not `AI.Service`'s `/api` URL. The load API still needs
the local GGUF for metadata. Configure TLS and credentials for remote inference;
the lower-level package is not an end-user authentication or URL-allowlist layer.

## Runtime administration

| LlamaServerRuntime method | Behavior |
| --- | --- |
| Inspect(options = null) | Local inventory; no network download |
| InspectAsync(options = null, cancellationToken = default) | Inventory and local hardware recommendation |
| InstallAsync(options = null, progress = null, cancellationToken = default) | Explicit verified download, compatibility test and activation; returns executable path |
| EnsureAvailableAsync(options = null, progress = null, cancellationToken = default) | Locate/acquire according to RuntimeAcquisition |
| RemoveAsync(installationId, options = null, cancellationToken = default) | Delete a managed installation by inventory ID; do not use while any host is using it |

Progress accepts `IProgress<float>`. Cancellation and failures do not activate
partial installations. The default acquisition policy is `NeverDownload`.
Restoring/building a NuGet consumer does not install the engine.

`RuntimeInstallationInfo` returns `Platform`, `Version`, `RecommendedBackend`,
`CacheDirectory`, `Choices`, `Installed`, `ExternalRuntime`, `Limitation`,
`InstallationBlocker` and `Download`. A recommendation is not a guarantee that a
GPU driver works. Inspect blockers before offering installation.
Each choice has `Backend`, `Version`, `DownloadBytes`, `Supported` and `Limitation`;
each installed item has `Id`, `Backend` and `Version`.

`LlamaServerExecutableLocator.Resolve(explicitPath, runtimeCacheDirectory)`
performs executable discovery. `EnvironmentVariable` identifies
`TXTEXTCONTROL_AI_LLAMA_SERVER`. `DefaultRuntimeCacheDirectory` is
`LocalApplicationData/TXTextControl.AI/runtimes/llama.cpp` under the running
account. Configure a persistent private location for services/containers; it is
not the NuGet installation folder. Explicit executables remain host-owned.

## Download configuration

`RuntimeDownloadOptions`:

| Property | Default | Rules |
| --- | --- | --- |
| Version | b10621 | Fixed release identifier, 1–64 letters/digits/dot/underscore/hyphen; cannot be latest |
| BaseUrl | https://github.com/ggml-org/llama.cpp/releases/download | Absolute HTTPS root; no user-info, query or fragment |
| Assets | empty | Built-in catalog for b10621 only; other releases need a complete host-approved list |

Every `RuntimeDownloadAsset` supplies `Platform` (win-x64/linux-x64), `Backend`
(Cpu/Cuda/Vulkan), `FileName` (.zip/.tar.gz without a path), `Bytes` (positive,
at most 16 GiB), and `Sha256` (64 hex digits). At most 32 assets. Include dependency
archives needed by a backend, not just the server archive. `Validate()` checks
and snapshots settings without contacting the server.

Downloads use `{BaseUrl}/{Version}/{FileName}`. Mirror-only changes retain the
same size/hash checks:

```csharp
var mirrored = options with
{
    RuntimeDownload = new RuntimeDownloadOptions
    {
        Version = RuntimeDownloadOptions.DefaultVersion,
        BaseUrl = "https://downloads.example.com/approved/llama.cpp"
    }
};
// Install only after provisioning that mirror with the exact approved archives.
```

The pinned catalog includes Windows x64 CPU/CUDA/Vulkan and Linux x64 CPU/Vulkan.
It is deliberately not "always latest". A custom manifest cannot make an
unsupported operating system supported. Updating engines can alter chat templates,
tool calling and memory use; test the selected release before deployment.

## Embedding generation

`LlamaServerEmbeddingGenerator` implements
`IEmbeddingGenerator<string, Embedding<float>>` and owns a separate lazy process.
It never replaces the chat model.

```csharp
using System.Security.Cryptography;

var path = Path.GetFullPath("Models/retrieval.gguf");
await using var file = File.OpenRead(path);
var hash = Convert.ToHexString(await SHA256.HashDataAsync(file));
using var embeddings = new LlamaServerEmbeddingGenerator(
    path, hash, dimensions: 384, pooling: "mean",
    options: new LlamaServerModelOptions
    {
        ForceCpu = true,
        ContextSize = 2048, BatchSize = 2048, UBatchSize = 2048,
        ExecutablePath = "/absolute/path/to/llama-server"
    });
var vectors = await embeddings.GenerateAsync(["A document approval policy"]);
```

Replace the example dimensions/pooling with the retrieval model's actual
requirements. Chat GGUFs are not interchangeable with retrieval GGUFs.

| Constructor argument | Contract |
| --- | --- |
| modelPath | Local embedding GGUF |
| sha256 | Required 64-hex SHA-256; checked before lazy loading |
| dimensions | 1–65536; returned vector length must match |
| pooling | mean (default), cls, or last |
| options | Optional runtime settings; omitted uses context/batch/ubatch 2048 |

External endpoints and arbitrary `AdditionalArguments` are rejected for this
generator. It sets its own embedding/pooling/single-sequence arguments.
`GenerateAsync(values, options, cancellationToken)` accepts at most 32 strings
of at most 16000 characters each; model context can impose a lower limit.
`GetService` returns supported services; `Dispose` releases owned resources.
The generator validates finite, nonzero vectors. It does not invent or apply
query/document prefixes: configure them in Knowledge or prepare inputs yourself.
The ASP.NET Core embedding administration defaults to a CPU process; explicitly
set `ForceCpu` when directly constructing a generator if that is your policy.

## Deployment and troubleshooting

- A restored .NET assembly is not a native runtime. Provision engine, weights and
  all OS prerequisites separately.
- Linux managed archives require compatible glibc and OpenMP (`libgomp.so.1`,
  normally Ubuntu's `libgomp1`). CPU fallback does not remove that dependency.
- CUDA/Vulkan need matching host drivers. macOS native libraries need appropriate
  architecture and trust/signing; never disable security checks globally.
- Load once and reuse clients. Dispose deterministically, and do not remove a
  cached engine used by another host.
- A startup timeout is different from an inference timeout. Check process output,
  architecture, libraries and available memory before increasing either.
- Increasing context consumes memory. Also budget for embeddings and Docker.
- Endpoint authentication failures belong to the inference host; the MCP server
  uses its own independent endpoint and credentials.
- No model weights, private keys, GPUs, OS packages or application data are
  installed by this package's NuGet restore.

## License and support

Preview APIs may change before a stable release. Distributed by Text Control GmbH
under the **Text Control AI Source Available License 1.0**, included as
`LICENSE.txt`. Solutions must retain properly licensed TX Text Control products
as a core component. This is not an unrestricted open-source license. Commercial
SDKs, model weights, inference engines and other dependencies retain their own
licenses. Strong-name signing is assembly identity, not Apple notarization or a
NuGet package-signature guarantee.

Visit [Text Control](https://www.textcontrol.com/) for product, licensing and support.

<!-- BEGIN GENERATED PUBLIC REFERENCE -->


## Public C# reference

Source-derived public types, signatures, parameter defaults and DTO fields for this version.
Bodies are omitted: these signatures are not a standalone compilable program. Concise
initializers and JSON-name/required attributes are preserved. Workflow validation may
require more than C# nullability alone. External types retain their package contracts.
Public engine/service implementation types are advanced integration surfaces; prefer
the documented registration and facade APIs for ordinary applications.

### TXTextControl.AI.LlamaServer.InstalledRuntime

```csharp
/// <summary>An installation managed by this application account.</summary>
public sealed record InstalledRuntime(string Id, string Backend, string Version);
```

### TXTextControl.AI.LlamaServer.LlamaServerEmbeddingGenerator

```csharp
/// <summary>A separate, lazily loaded local embedding process. Never borrows or unloads a chat model.</summary>
public sealed class LlamaServerEmbeddingGenerator : IEmbeddingGenerator<string, Embedding<float>>
{
    public LlamaServerEmbeddingGenerator(string modelPath, string sha256, int dimensions, string pooling = "mean", LlamaServerModelOptions? options = null);
    public async Task<GeneratedEmbeddings<Embedding<float>>> GenerateAsync(IEnumerable<string> values, EmbeddingGenerationOptions? options = null, CancellationToken cancellationToken = default);
    public object? GetService(Type serviceType, object? serviceKey = null);
    public void Dispose();
}
```

### TXTextControl.AI.LlamaServer.LlamaServerExecutableLocator

```csharp
/// <summary>Locates an installed llama-server without coupling applications to a fixed release.</summary>
public static class LlamaServerExecutableLocator
{
    public const string EnvironmentVariable = "TXTEXTCONTROL_AI_LLAMA_SERVER";
    public static string DefaultRuntimeCacheDirectory { get; }

    public static string? Resolve(string? explicitPath = null, string? runtimeCacheDirectory = null);
}
```

### TXTextControl.AI.LlamaServer.LlamaServerHardwareBackend

```csharp
public enum LlamaServerHardwareBackend
{
    Auto,
    Cpu,
    Cuda,
    Vulkan,
}
```

### TXTextControl.AI.LlamaServer.LlamaServerModel

```csharp
/// <summary>
/// Owns an optional llama-server child process and exposes its OpenAI-compatible chat API.
/// </summary>
public sealed class LlamaServerModel : IDisposable
{
    public LlamaServerModelInfo Info { get; }
    public Uri Endpoint { get; }

    public static bool IsAvailable(string? executablePath = null);
    public static async Task<LlamaServerModel> LoadAsync(string modelPath, LlamaServerModelOptions options, IProgress<float>? progress = null, CancellationToken cancellationToken = default);
    public IChatClient CreateChatClient();
    public void Dispose();
}
```

### TXTextControl.AI.LlamaServer.LlamaServerModelInfo

```csharp
public sealed record LlamaServerModelInfo(string ModelPath, string Name, string? Architecture, bool HasChatTemplate, int TrainingContextSize, ulong SizeInBytes, IReadOnlyDictionary<string, string> Metadata, LlamaServerRuntimeInfo Runtime);
```

### TXTextControl.AI.LlamaServer.LlamaServerModelOptions

```csharp
/// <summary>Configures an isolated llama-server model process.</summary>
public sealed record LlamaServerModelOptions
{
    public string? ExecutablePath { get; init; }
    public Uri? Endpoint { get; init; }
    public LlamaServerRuntimeAcquisitionPolicy RuntimeAcquisition { get; init; } = LlamaServerRuntimeAcquisitionPolicy.NeverDownload;
    /// <summary>Null, empty or whitespace uses the default application-data runtime directory.</summary>
    public string? RuntimeCacheDirectory { get; init; }
    public RuntimeDownloadOptions RuntimeDownload { get; init; } = new();
    public string? ModelId { get; init; }
    public string ApiKey { get; init; } = "local";
    public int ContextSize { get; init; } = 8_192;
    public int GpuLayers { get; init; } = -1;
    public int? Threads { get; init; }
    public int BatchSize { get; init; } = 512;
    public int UBatchSize { get; init; } = 512;
    public int MaxOutputTokens { get; init; } = 1_024;
    public float Temperature { get; init; } = 0.6f;
    public int TopK { get; init; } = 40;
    public float TopP { get; init; } = 0.95f;
    public float? FrequencyPenalty { get; init; }
    public float? PresencePenalty { get; init; }
    public int? Seed { get; init; }
    public bool? FlashAttention { get; init; }
    public bool UseMemoryMapping { get; init; } = true;
    public bool UseMemoryLocking { get; init; }
    public int MainGpu { get; init; }
    public bool ForceCpu { get; init; }
    public LlamaServerHardwareBackend HardwareBackend { get; init; } = LlamaServerHardwareBackend.Auto;
    public bool EnableReasoning { get; init; }
    public TimeSpan StartupTimeout { get; init; } = TimeSpan.FromMinutes(3);
    public TimeSpan RequestTimeout { get; init; } = TimeSpan.FromMinutes(10);
    public IReadOnlyList<string> AdditionalArguments { get; init; } = [];
}
```

### TXTextControl.AI.LlamaServer.LlamaServerRuntime

```csharp
/// <summary>Provides explicit runtime prefetching for deployment and offline preparation.</summary>
public static class LlamaServerRuntime
{
    /// <summary>Reads the local catalog and managed installations without downloading or checking upstream releases.</summary>
    public static RuntimeInstallationInfo Inspect(LlamaServerModelOptions? options = null);
    /// <summary>Also obtains a locally probed hardware recommendation; never downloads runtime files.</summary>
    public static Task<RuntimeInstallationInfo> InspectAsync(LlamaServerModelOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Explicitly downloads and verifies the curated runtime, independently of model loading.</summary>
    public static Task<string> InstallAsync(LlamaServerModelOptions? options = null, IProgress<float>? progress = null, CancellationToken cancellationToken = default);
    /// <summary>Removes an enumerated managed installation. The caller must ensure it is not in use by any host.</summary>
    public static Task RemoveAsync(string installationId, LlamaServerModelOptions? options = null, CancellationToken cancellationToken = default);
    public static Task<string> EnsureAvailableAsync(LlamaServerModelOptions? options = null, IProgress<float>? progress = null, CancellationToken cancellationToken = default);
}
```

### TXTextControl.AI.LlamaServer.LlamaServerRuntimeAcquisitionPolicy

```csharp
public enum LlamaServerRuntimeAcquisitionPolicy
{
    DownloadIfMissing,
    NeverDownload,
}
```

### TXTextControl.AI.LlamaServer.LlamaServerRuntimeInfo

```csharp
public sealed record LlamaServerRuntimeInfo(string Engine, string Backend, string Platform, string Architecture, string? Executable);
```

### TXTextControl.AI.LlamaServer.RuntimeDownloadAsset

```csharp
/// <summary>An archive approved by the host; CUDA may require multiple archives per platform/backend.</summary>
public sealed record RuntimeDownloadAsset
{
    public string Platform { get; init; } = "";
    public string Backend { get; init; } = "";
    public string FileName { get; init; } = "";
    public long Bytes { get; init; }
    public string Sha256 { get; init; } = "";
}
```

### TXTextControl.AI.LlamaServer.RuntimeDownloadChoice

```csharp
/// <summary>A supported, pinned runtime option. No network request is needed to read this catalog.</summary>
public sealed record RuntimeDownloadChoice(string Backend, string Version, long DownloadBytes, bool Supported, string? Limitation);
```

### TXTextControl.AI.LlamaServer.RuntimeDownloadOptions

```csharp
/// <summary>Host-approved release and mirror settings. Custom releases require pinned assets.</summary>
public sealed record RuntimeDownloadOptions
{
    public const string DefaultVersion = "b10621";
    public const string DefaultBaseUrl = "https://github.com/ggml-org/llama.cpp/releases/download";
    public string Version { get; init; } = DefaultVersion;
    /// <summary>HTTPS root. Downloads use {BaseUrl}/{Version}/{FileName}.</summary>
    public string BaseUrl { get; init; } = DefaultBaseUrl;
    /// <summary>Empty uses the bundled catalog, only for DefaultVersion. Include all dependency archives.</summary>
    public IReadOnlyList<RuntimeDownloadAsset> Assets { get; init; } = [];

    /// <summary>Validates and snapshots settings without contacting the download server.</summary>
    public RuntimeDownloadOptions Validate();
}
```

### TXTextControl.AI.LlamaServer.RuntimeInstallationInfo

```csharp
/// <summary>Runtime installation status; model files are never downloaded by this API.</summary>
public sealed record RuntimeInstallationInfo(string Platform, string Version, string RecommendedBackend, string CacheDirectory, IReadOnlyList<RuntimeDownloadChoice> Choices, IReadOnlyList<InstalledRuntime> Installed, string? ExternalRuntime, string? Limitation)
{
    /// <summary>A missing system prerequisite that prevents a managed download from starting.</summary>
    public string? InstallationBlocker { get; init; }
    /// <summary>Configured release and mirror; changing the mirror never disables checksum verification.</summary>
    public RuntimeDownloadOptions Download { get; init; } = new();
}
```

<!-- END GENERATED PUBLIC REFERENCE -->
