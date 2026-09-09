# TX Text Control AI Private Knowledge

Private, in-process document indexing and retrieval for licensed TX Text Control
solutions. `TXTextControl.AI.Knowledge` stores source versions, indexed passages
and durable jobs in SQLite, supports keyword search out of the box, and adds
semantic/hybrid retrieval when you supply an embedding generator.

No search server, ASP.NET host, chat model or document editor is required.
The package targets .NET 8 and contains **no native TX Text Control document
engine**. SQLite remains a native platform dependency supplied transitively.
The package explicitly requires `SQLitePCLRaw.bundle_e_sqlite3` 3.0.5 or later,
which supplies SQLite 3.53.4 through the `SQLite` native package. This replaces
the vulnerable legacy `SQLitePCLRaw.lib.e_sqlite3` dependency. Consumers need no
manual SQLite installation or sample-specific override. Do not downgrade the
bundle or replace its native binaries with older copies. Existing Knowledge
databases need no schema migration or reindexing for this dependency update;
back up private data, redeploy the complete application and restart its host.
Use `TXTextControl.AI.AspNetCore` for protected HTTP endpoints, remote MCP
extraction, optional local embeddings and a browser client.

## Contents

- [Getting started](#getting-started)
- [The indexing and retrieval workflow](#the-indexing-and-retrieval-workflow)
- [Storage settings](#storage-settings)
- [Extraction](#extraction)
- [Embeddings and search](#embeddings-and-search)
- [Complete store API](#complete-store-api)
- [Authorization and data lifecycle](#authorization-and-data-lifecycle)
- [Deployment and troubleshooting](#deployment-and-troubleshooting)

## Getting started

Install from your approved feed:

```sh
dotnet add package TXTextControl.AI.Knowledge --prerelease
```

This example performs keyword retrieval; there is no embedding setup step:

```csharp
using System.Text;
using TXTextControl.AI.Knowledge;

using var knowledge = new KnowledgeStore(new KnowledgeOptions
{
    DatabasePath = Path.GetFullPath("private-data/knowledge.db")
});
var access = new KnowledgeAccessContext("authenticated-user-id");
var collection = await knowledge.CreateCollectionAsync("Approved policies", access);
var jobId = await knowledge.EnqueueAsync(collection.Id, "approval.md",
    Encoding.UTF8.GetBytes("# Approval\nAll invoices need manager approval."),
    access);
while (await knowledge.ProcessNextAsync()) { }
var result = await knowledge.SearchAsync(
    new KnowledgeSearchRequest(collection.Id, "invoice approval"), access);
foreach (var passage in result.Passages)
    Console.WriteLine($"{passage.FileName} ({passage.Locator}): {passage.Text}");
```

Derive `access.Subject` from trusted authentication, never a browser-submitted
owner value. The literal above is only a single-user console example.

## The indexing and retrieval workflow

1. Create/select a collection.
2. Enqueue documents. The returned job ID is not an indexed source yet.
3. Run `ProcessNextAsync` in a host-owned background worker and inspect jobs.
4. Successful work activates a source version and its passages transactionally.
5. Search that collection; send the returned evidence to your chat model.
6. Cite returned version/passage references. Do not treat retrieved text as instructions.

With the ASP.NET Core integration, a registered worker handles step 3.
Using this library directly requires your own worker. `ProcessNextAsync` returns
false when no queued job was processed, not a full job-success report.

Embedding configuration is optional and independent of collections. One store's
provider applies across its collections. Without one, `Auto` uses keyword
search; there is no separate mandatory "third setup step" for each collection.

## Storage settings

`KnowledgeOptions`:

| Property | Default | Contract |
| --- | --- | --- |
| DatabasePath | required | Absolute private path outside wwwroot; parent directory created lazily |
| MaxFileBytes | 33554432 (32 MiB) | Positive upload/source limit |
| MaxExtractedCharacters | 2000000 | Positive extraction-content limit |
| ChunkCharacters | 1800 | 128–16000; heading/header context counts toward each chunk |
| MaxPendingJobs | 32 | Positive pending-ingestion limit |
| MaxChunks | 10000 | Positive per-document chunk limit |
| ApprovedImportDirectories | empty | Exact host-approved directories for local imports |

`KnowledgeStore(options, extractor = null, policy = null, embeddings = null)`
uses UTF-8 text extraction and owner authorization by default. `HasEmbeddings`
reports whether a provider was supplied. Use one store and indexing worker per
database, not a shared multi-host SQLite deployment.

The database is created/opened lazily, enables FTS5 and WAL, and initializes its
schema before use. The host must allow native SQLite loading and writing the
database directory, including WAL/SHM sidecar files. Back up a consistent database,
not just a live main file while ignoring WAL.

## Extraction

The default `TextKnowledgeExtractor` handles TXT and Markdown locally. It reads
text; it does not render Markdown or parse PDF/DOCX itself.

To add formats, implement:

```csharp
public interface IKnowledgeDocumentExtractor
{
    string Version { get; }
    Task<IReadOnlyList<KnowledgeBlock>> ExtractAsync(
        string fileName, ReadOnlyMemory<byte> content,
        CancellationToken cancellationToken);
}
```

`KnowledgeBlock(Text, Locator, Heading = null, TableHeader = null)` carries
readable text plus source context. Use a stable locator meaningful to readers and
a version string that changes when extraction behavior changes. Locators are not
editor offsets. Bound extraction work and treat filenames and bytes as untrusted.

`AddTextControlAIKnowledge` in the ASP.NET Core package supplies
`McpKnowledgeDocumentExtractor`. It handles TXT/Markdown locally and sends DOCX,
RTF, PDF, TX and HTML once as a bounded binary HTTP request to
`<McpEndpoint>/knowledge/extract`. MCP runs TX Text Control on its supported
Windows/Linux host; the AI/Knowledge host need not have the document engine.
This is not an LLM tool call or a per-paragraph network loop.

The MCP path extracts paragraphs/rows and context; PDF uses text lines, not page
coordinates or inferred PDF tables. Scanned/image-only PDFs need OCR beforehand.
Non-PDF headers/footers, footnotes and text-frame stories are not currently part
of this extraction. The source remains stored by Knowledge, not as a working
editor session on MCP.

## Embeddings and search

Construct `KnowledgeEmbeddingProvider(Generator, Configuration)` with an
`IEmbeddingGenerator<string, Embedding<float>>` and
`KnowledgeEmbeddingConfiguration(Identity, Dimensions, QueryPrefix = "",
DocumentPrefix = "")`. The identity must include the immutable model hash and
pooling/normalization settings. Never reuse an identity for different weights.

The `TXTextControl.AI.LlamaServer` package supplies a separate local
`LlamaServerEmbeddingGenerator`. Your chat model can still be a different GGUF.
Only retrieval-trained models and their documented dimensions/pooling/prefixes
are appropriate; this package does not download or select one.

`KnowledgeSearchRequest`:

| Field | Default | Purpose |
| --- | --- | --- |
| CollectionId | required | Authorized collection scope |
| Query | required | Search question/text; at most 4000 characters |
| Mode | Auto | Auto, Keyword, Semantic, Hybrid |
| Limit | 6 | Requested result count, 1–50 |
| EvidenceTokenBudget | 2400 | 128–16000 estimated evidence budget, not model output budget |
| VersionId | null | Optional particular active source-version restriction |

| Mode | Behavior |
| --- | --- |
| Auto | Keyword without embeddings; hybrid when configured |
| Keyword | SQLite FTS5/BM25 over literal-escaped query terms |
| Semantic | Exact vector scoring of compatible authorized candidates; requires embeddings |
| Hybrid | Independent keyword/vector rankings combined by reciprocal rank fusion |

Hybrid merges up to the top 100 from each ranking using reciprocal rank fusion
with k=60. Scores rank candidates; they are not probabilities of correctness.
Results are bounded evidence, not exhaustive contract enumeration or aggregation.
`ValidateVector(vector, dimensions)` rejects wrong dimensions, non-finite and
zero-norm vectors. Changed extraction/chunking/embedding configurations require
reindexing; incompatible vectors are not silently treated as equivalent.

`KnowledgeSearchResult` exposes `Mode`, `Passages`, `EstimatedTokens` and `Notice`.
Each `KnowledgePassage` contains `Id`, `CollectionId`, `DocumentId`, `VersionId`,
`FileName`, `Locator`, `Text` and `Score`. Ground the model on the original returned
text, honor notices/empty results, and resolve citations through the authorized
store. The library does not itself generate an answer.

## Complete store API

All asynchronous operations accept a final optional `CancellationToken`.
Unless stated otherwise, resource operations also require a
`KnowledgeAccessContext`. IDs returned by the store are not permissions.

| Method | Purpose / return |
| --- | --- |
| CreateCollectionAsync(name, access) | KnowledgeCollection(Id, Name, Owner) |
| GetCollectionsAsync(access) | Only collections the caller may access |
| RenameCollectionAsync(collectionId, name, access) | Rename without changing versions or reindexing |
| DeleteCollectionAsync(collectionId, access) | Remove collection and stored sources/passages/jobs; requires write access |
| EnqueueAsync(collectionId, fileName, content, access) | Queue source bytes; returns job ID |
| ImportDirectoryAsync(collectionId, approvedDirectory, access) | Queue supported files from one approved nonrecursive directory; returns job IDs |
| ProcessNextAsync() | Process one queued job as trusted host worker; bool indicates work, not final success |
| GetJobsAsync(collectionId, access) | KnowledgeJob list |
| ChangeJobAsync(collectionId, jobId, retry, access) | Retry when true; cancel/discard pending bytes when false |
| GetSourcesAsync(collectionId, access) | Active KnowledgeSource versions |
| ReindexSourceAsync(collectionId, versionId, access) | Queue stored active source with current configuration; returns job ID |
| DeleteSourceAsync(collectionId, documentId, access) | Remove stored source and index entries |
| DownloadSourceAsync(collectionId, versionId, access) | KnowledgeSourceDownload(FileName, Content) |
| SearchAsync(request, access) | Bounded KnowledgeSearchResult |
| ResolvePassageAsync(collectionId, chunkId, access) | Original authorized KnowledgePassage |
| ValidateVector(vector, dimensions) | Static validation helper |
| Dispose() | Dispose store synchronization resources; stop worker first |

`KnowledgeJob` fields are `Id`, `CollectionId`, `DocumentId`, `FileName`,
`State`, `Progress`, `Error` and `VersionId`.
`KnowledgeSource` contains `DocumentId`, `VersionId`, `FileName`, `Hash` and
`ChunkCount`. List sources after successful indexing rather than treating every
upload/job as an active version.

## Authorization and data lifecycle

`OwnerKnowledgeAccessPolicy` fails closed unless a nonempty subject equals the
collection owner. Replace `IKnowledgeAccessPolicy.CanAccessAsync(context,
collection, write, cancellationToken)` for tenant/ACL integration. Check write
permissions separately. Custom policies should be deterministic and fail closed;
authentication itself remains the host's responsibility.

Uploading the same filename within a collection creates a replacement attempt.
Identical bytes plus identical processing configuration skip duplicate work.
Failed replacement leaves the prior active version intact. Pending/failed work
retains bounded bytes for retry; cancellation discards them.
Interrupted indexing requires explicit retry.

Successful replacement retires old passages and source bytes from the live index.
Old citation IDs become unavailable; they must not silently resolve to different
text. Deleting collections/sources does not delete users' original local files.
SQLite free pages, WAL and backups can retain deleted data: deletion is **not
secure erasure**. Use host permissions, storage encryption and retention policies.

Imports accept only exact `ApprovedImportDirectories` and do not crawl recursively
or follow links. Do not expose arbitrary server filesystem paths to browsers.
Source text, filenames, metadata and embeddings are private data; keep storage and
backups outside static hosting and out of logs/model instructions.

## Deployment and troubleshooting

| Symptom | Check |
| --- | --- |
| Jobs remain queued | Start one indexing worker; direct library use does not register a hosted service |
| Database inaccessible | Writable private directory, native SQLite architecture/trust, FTS5, disk space and locks |
| PDF/DOCX unsupported | Supply an extractor or register the ASP.NET Core MCP extractor |
| MCP extraction 401/403/404 | Correct endpoint, credentials, server version and authorization |
| MCP extraction 422 | Readable content, supported format, corruption and OCR requirements |
| Embedding mismatch | Retrieval GGUF, exact hash, dimensions, pooling, prefixes and reindexing |
| No matches | Correct collection/version/access, active jobs and mode; keyword search differs from semantic search |
| Slow semantic search | Exact vector scanning is not an approximate distributed vector database; benchmark collection sizes |

No chat model, web UI, OCR engine, filesystem crawler or distributed index service
is included. Sources and embeddings stay where the hosting application stores
them; extraction or generation goes remote only if the host configures it.

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

### TXTextControl.AI.Knowledge.IKnowledgeAccessPolicy

```csharp
public interface IKnowledgeAccessPolicy
{
    ValueTask<bool> CanAccessAsync(KnowledgeAccessContext context, KnowledgeCollection collection, bool write, CancellationToken cancellationToken);
}
```

### TXTextControl.AI.Knowledge.IKnowledgeDocumentExtractor

```csharp
public interface IKnowledgeDocumentExtractor
{
    string Version { get; }

    Task<IReadOnlyList<KnowledgeBlock>> ExtractAsync(string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken);
}
```

### TXTextControl.AI.Knowledge.KnowledgeAccessContext

```csharp
public sealed record KnowledgeAccessContext(string? Subject);
```

### TXTextControl.AI.Knowledge.KnowledgeBlock

```csharp
public sealed record KnowledgeBlock(string Text, string Locator, string? Heading = null, string? TableHeader = null);
```

### TXTextControl.AI.Knowledge.KnowledgeCollection

```csharp
public sealed record KnowledgeCollection(string Id, string Name, string Owner);
```

### TXTextControl.AI.Knowledge.KnowledgeEmbeddingConfiguration

```csharp
/// <summary>Include a model-content hash and all pooling, prefix and normalization settings in the identity.</summary>
public sealed record KnowledgeEmbeddingConfiguration(string Identity, int Dimensions, string QueryPrefix = "", string DocumentPrefix = "");
```

### TXTextControl.AI.Knowledge.KnowledgeEmbeddingProvider

```csharp
public sealed record KnowledgeEmbeddingProvider(IEmbeddingGenerator<string, Embedding<float>> Generator, KnowledgeEmbeddingConfiguration Configuration);
```

### TXTextControl.AI.Knowledge.KnowledgeJob

```csharp
public sealed record KnowledgeJob(string Id, string CollectionId, string DocumentId, string FileName, string State, int Progress, string? Error, string? VersionId);
```

### TXTextControl.AI.Knowledge.KnowledgeOptions

```csharp
public sealed record KnowledgeOptions
{
    public required string DatabasePath { get; init; }
    public int MaxFileBytes { get; init; } = 32 * 1024 * 1024;
    public int MaxExtractedCharacters { get; init; } = 2_000_000;
    public int ChunkCharacters { get; init; } = 1800;
    public int MaxPendingJobs { get; init; } = 32;
    public int MaxChunks { get; init; } = 10_000;
    public IReadOnlyList<string> ApprovedImportDirectories { get; init; } = [];
}
```

### TXTextControl.AI.Knowledge.KnowledgePassage

```csharp
public sealed record KnowledgePassage(string Id, string CollectionId, string DocumentId, string VersionId, string FileName, string Locator, string Text, double Score);
```

### TXTextControl.AI.Knowledge.KnowledgeSearchMode

```csharp
public enum KnowledgeSearchMode
{
    Auto,
    Keyword,
    Semantic,
    Hybrid
}
```

### TXTextControl.AI.Knowledge.KnowledgeSearchRequest

```csharp
public sealed record KnowledgeSearchRequest(string CollectionId, string Query, KnowledgeSearchMode Mode = KnowledgeSearchMode.Auto, int Limit = 6, int EvidenceTokenBudget = 2400, string? VersionId = null);
```

### TXTextControl.AI.Knowledge.KnowledgeSearchResult

```csharp
public sealed record KnowledgeSearchResult(KnowledgeSearchMode Mode, IReadOnlyList<KnowledgePassage> Passages, int EstimatedTokens, string Notice);
```

### TXTextControl.AI.Knowledge.KnowledgeSource

```csharp
public sealed record KnowledgeSource(string DocumentId, string VersionId, string FileName, string Hash, int ChunkCount);
```

### TXTextControl.AI.Knowledge.KnowledgeSourceDownload

```csharp
public sealed record KnowledgeSourceDownload(string FileName, byte[] Content);
```

### TXTextControl.AI.Knowledge.KnowledgeStore

```csharp
/// <summary>Single-process embedded store. A host should register one instance per database.</summary>
public sealed class KnowledgeStore : IDisposable
{
    public KnowledgeStore(KnowledgeOptions options, IKnowledgeDocumentExtractor? extractor = null, IKnowledgeAccessPolicy? policy = null, KnowledgeEmbeddingProvider? embeddings = null);
    public bool HasEmbeddings { get; }

    public Task<KnowledgeCollection> CreateCollectionAsync(string name, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task RenameCollectionAsync(string collectionId, string name, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    /// <summary>Deletes the collection and its live sources, vectors, search entries and jobs. Does not erase backups.</summary>
    public Task DeleteCollectionAsync(string collectionId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<IReadOnlyList<KnowledgeCollection>> GetCollectionsAsync(KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<string> EnqueueAsync(string collectionId, string fileName, ReadOnlyMemory<byte> content, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public async Task<IReadOnlyList<string>> ImportDirectoryAsync(string collectionId, string approvedDirectory, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<IReadOnlyList<KnowledgeJob>> GetJobsAsync(string collectionId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task ChangeJobAsync(string collectionId, string jobId, bool retry, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    /// <summary>Processes at most one durable job. Call from a host-owned worker, never from the model's tool set.</summary>
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken = default);
    public Task DeleteSourceAsync(string collectionId, string documentId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public async Task<string> ReindexSourceAsync(string collectionId, string versionId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<IReadOnlyList<KnowledgeSource>> GetSourcesAsync(string collectionId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<KnowledgeSourceDownload> DownloadSourceAsync(string collectionId, string versionId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public Task<KnowledgePassage> ResolvePassageAsync(string collectionId, string chunkId, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public static void ValidateVector(ReadOnlySpan<float> vector, int dimensions);
    public Task<KnowledgeSearchResult> SearchAsync(KnowledgeSearchRequest request, KnowledgeAccessContext access, CancellationToken cancellationToken = default);
    public void Dispose();
}
```

### TXTextControl.AI.Knowledge.OwnerKnowledgeAccessPolicy

```csharp
/// <summary>Fail-closed single-owner policy. Hosts may replace it with their tenant/ACL resolver.</summary>
public sealed class OwnerKnowledgeAccessPolicy : IKnowledgeAccessPolicy
{
    public ValueTask<bool> CanAccessAsync(KnowledgeAccessContext context, KnowledgeCollection collection, bool write, CancellationToken cancellationToken);
}
```

### TXTextControl.AI.Knowledge.TextKnowledgeExtractor

```csharp
/// <summary>UTF-8 text/Markdown only. Other formats require a host-provided structured extractor.</summary>
public sealed class TextKnowledgeExtractor : IKnowledgeDocumentExtractor
{
    public string Version { get; }

    public Task<IReadOnlyList<KnowledgeBlock>> ExtractAsync(string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken);
}
```

<!-- END GENERATED PUBLIC REFERENCE -->
