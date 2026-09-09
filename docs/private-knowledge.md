# Private knowledge: deployment and public API

## Components

`TXTextControl.AI.Knowledge` is a UI-independent .NET 8 package for SQLite FTS5, versioned imports, durable jobs, replaceable extraction/access/embedding interfaces and evidence search. It has no native TX Text Control dependency. Its default extractor supports TXT/Markdown; the ASP.NET integration delegates rich-document extraction to the separately hosted MCP server on Windows/Linux.

`TXTextControl.AI.LlamaServer.LlamaServerEmbeddingGenerator` implements Microsoft.Extensions.AI's `IEmbeddingGenerator<string, Embedding<float>>`. It owns a separate lazy loopback process, validates the supplied GGUF hash, serializes requests and uses the existing runtime discovery, acquisition policy, cache and configurable release/mirror. It never borrows/unloads the chat model. No weights are included or downloaded. Runtime acquisition defaults to `NeverDownload`; preinstall using existing administration or explicitly opt in in a host-owned runtime configuration.

`TXTextControl.AI.AspNetCore` provides registration, protected endpoints, the indexing worker, grounding, sources and browser client. Its `McpKnowledgeDocumentExtractor` posts binary rich-document content once to `<McpEndpoint>/knowledge/extract`. MCP returns bounded structured blocks. No model-facing tool, base64 conversion, persistent editor session or per-paragraph network call is involved.

## Minimal host registration

```csharp
using TXTextControl.AI.AspNetCore;
using TXTextControl.AI.Knowledge;

// Add authentication/authorization first, using your production identity provider.
// The policy below must already exist; browser collection IDs are not authorization.
builder.Services.AddTextControlAIKnowledge(new KnowledgeWebOptions(
    new KnowledgeOptions {
        DatabasePath = Path.Combine(builder.Environment.ContentRootPath,
            "private-data", "knowledge.db")
    }, "KnowledgeUser"));

// MCP-backed rich extraction is registered automatically and uses LocalAI:McpEndpoint.
// Register AddTextControlAI as usual; explicitly trust remote HTTPS MCP endpoints.
// Optionally replace IKnowledgeDocumentExtractor with a custom/OCR implementation.

// Optional admin/model selection. Paths are configured by the host, not the browser.
builder.Services.AddTextControlAIKnowledgeEmbeddings(
    Path.Combine(builder.Environment.ContentRootPath, "Models"),
    Path.Combine(builder.Environment.ContentRootPath, "private-data", "embedding.json"));

// After building, enable authentication/authorization middleware, then:
app.MapTextControlAIKnowledge();
```

Existing AI registration and `MapTextControlAI` remain required for generation. A console/worker can use `KnowledgeStore` directly; see the package README. With no knowledge registration, no database or embedding process is created. The local web sample explicitly opts in via `Knowledge:Enabled`; set it to false to disable the feature. Remote integration hosts register the same APIs themselves.

The default workflow permits loopback processing only. A host may explicitly approve exact private HTTPS MCP/inference endpoints using `LocalAI:TrustedMcpEndpoints` and `TrustedInferenceEndpoints`. Rich reference bytes are sent only after the MCP endpoint passes that trust check. Credentials use endpoint-scoped `LocalAI:McpCredentials`; TLS is validated and redirects are disabled. See [Remote AI service](remote-ai-service.md).

## Sample workflow

1. Open **Knowledge** using the authorized localhost address. Its sample-only loopback development identity is **not production tenant authentication**.
2. In **Collections and sources**, create/select a collection and upload references. Rename preserves its ID, documents and index. Delete requires typing its name and removes all its live indexed sources and jobs, cancelling active work; original files and backups are not erased. Inspect jobs and active version IDs. Retry failed/interrupted jobs, cancel/discard pending bytes, reindex or remove a source. Sources with the same display filename replace each other within a collection. No active editor document is imported implicitly.
3. Preview search. Auto reports Keyword until an embedding model is configured. Semantic and Hybrid require compatible vectors for all selected active sources; there is no silent fallback under those explicit modes.
4. Embeddings are optional global configuration, not a per-collection setup step. Expand **Global knowledge settings** independently of collection selection. Place a suitable retrieval GGUF in the application's Models directory; select its dimensions, pooling and model-specific query/document prefixes. These fields are inactive in Keyword-only mode. Save; restart the host yourself, then reindex existing sources across collections. Future uploads use the active global configuration. Settings changes intentionally do not disrupt any running chat or index job. The default separate embedding process is CPU-based with a 2048-token context; pass `LlamaServerModelOptions` to registration for other resource settings.
5. Choose **Reference knowledge** above Chat/Document Studio. Ask a question or review. Requests are read-only by default. For a requested replacement/creation, explicitly check **Allow explicitly requested document changes**. Review/compare/check requests still remain read-only. If replacement evidence spans multiple documents, select the approved source version before trying again.
6. The answer appears in the existing chat. Citation buttons reopen an authorized excerpt in a separate dialog, with a source download. They do not load the editor. Typed “PDF please” continues exporting the current document; **Export answer as** creates an independent answer document.

Examples: “What payment terms did we agree with Riverbend?”, “Compare Northstar and Riverbend warranty terms”, “Check this NDA against our approved policy. Do not change it.”, and, after source selection/approval, “Replace this confidentiality clause with the approved standard wording.” Document creation must report missing source inputs instead of inventing prices or product claims.

## Browser interface

Load `/_content/TXTextControl.AI.AspNetCore/client.js` and, for editing, `editor.js`. Type declarations ship next to both scripts.

```javascript
const client = new TXTextControlAI.Client({ apiBaseUrl: "/api" });
const collections = await client.knowledgeCollections();
const collectionId = collections[0].id;
const evidence = await client.searchKnowledge({ collectionId, query: "payment terms" });
const result = await client.chat("What are the payment terms?", onEvent, {
  knowledge: { collectionId, allowDocumentChanges: false }
});
// Existing shared editor binding:
await assistant.execute("Review this NDA against our policy. Do not change it.", {
  knowledge: { collectionId }, onProgress: onEvent
});
```

The client also exposes `createKnowledgeCollection`, `uploadKnowledge`, `knowledgeJobs`, `changeKnowledgeJob`, `knowledgeSources`, `reindexKnowledgeSource`, `removeKnowledgeSource`, `resolveKnowledgePassage`, `knowledgeSourceUrl`, `knowledgeEmbedding` and `configureKnowledgeEmbedding`.

Collection management: `renameKnowledgeCollection(collectionId, name)` posts to `/{collectionId}/rename`, and `deleteKnowledgeCollection(collectionId)` posts to `/{collectionId}/remove`, under `/api/knowledge`. Both require the knowledge request header, host authorization and collection write permission. Deletion returns 204 only after the live collection data is removed transactionally. It cannot be undone through the application. The sample asks for typed-name confirmation and clears deleted collection/source selections in Chat and Document Studio. The global embedding configuration is unchanged by either operation.

## Extraction and retrieval contract

Current split: native extraction tests live in the MCP project; AI integration tests cover binary transport, endpoint trust, limits, failure preservation and original-source downloads without loading a TX engine. Historical in-process extraction/package asset checks below no longer describe the current package dependency graph.

- TXT/Markdown: strict UTF-8, heading/line locators, repeated Markdown table headers.
- TX/RTF/DOCX/HTML: a dedicated control on the MCP host extracts body paragraphs and table rows in order, suppressing duplicate cell paragraphs. First-row table context and Heading-style context are preserved. Non-PDF headers/footers, footnotes and text-frame stories are not currently included.
- Text-bearing PDF: `PDFImportSettings.GenerateLines` extracts searchable text without reconstructing page layout. Locators refer to extracted lines, not pages/native editor offsets; PDF table structure and headings are not inferred. `GenerateParagraphs` and appearance-preserving modes returned empty content for the SDK round-trip test, so they are not used.
- Native import is serialized on MCP. Controls are created, loaded, read and disposed on one worker thread. Cancellation is cooperative around native calls; it cannot abort a native load in progress. No OCR is bundled. One binary upload returns structured JSON, bounded to 32 MiB input, two million extracted characters and 100,000 blocks; deployments may impose lower ingress limits.
- Upgrade from local extraction: deploy/restart the updated MCP server and AI host together. Reindex existing sources to adopt the new extractor identity; old active sources remain available until a replacement succeeds. Retry failed rich-document jobs after checking MCP connectivity/trust. No model or knowledge-data migration is necessary.
- A content SHA-256 and complete extraction/chunk/embedding configuration identify unchanged imports. Pending jobs persist source bytes. Crash recovery marks Running jobs Interrupted; retry is explicit. Only a complete replacement transaction retires the old searchable version. Cancellation reaches an active embedding call.
- Exact cosine search uses all authorized active vectors independently from keyword matches. FTS syntax is literal-escaped, preserving quoted phrases. Hybrid fuses top-100 lists using reciprocal rank fusion (k=60), deduplicates identical passages and adds adjacent blocks when budget permits. Scores are rankings, not probabilities. Chunk IDs and locators are never native editor indexes.
- Evidence budgets conservatively count UTF-8 bytes plus metadata. The existing total context manager still accounts for system instructions, tool schemas/results, active document context, request and output reserve. Grounded input is marked non-truncatable: insufficient space fails explicitly, not with missing evidence behind plausible citations.
- Evidence is request-local, not replayed across collection switches or ungrounded follow-ups. Rendered citation IDs must occur in the supplied evidence. Unknown IDs are marked unverified. A source retired or deleted after generation returns unavailable rather than substituting another version.

## Security and operations

The default `OwnerKnowledgeAccessPolicy` requires a trusted, nonempty subject matching collection ownership. Implement `IKnowledgeAccessPolicy` for tenant/ACL rules (including write checks). The ASP.NET policy guards all knowledge routes; state-changing browser requests require `X-TextControl-Knowledge: 1`. Source downloads and passage resolution repeat authorization. Source bytes are served as attachment/octet-stream with no-store/nosniff headers. No raw filesystem URL is returned. Do not enable permissive credentialed CORS or expose the sample's loopback identity as production authentication.

The reusable store is designed for one application instance/worker per database. Exact search and DB access are serialized; the benchmark below is not a concurrent/multi-node capacity guarantee. There is no SQLite encryption built in. Apply least-privilege filesystem permissions, encrypted disks if required, private backup storage and retention policies. The sample stores data in excluded `App_Data/Knowledge`, outside static files. Supply explicit private absolute paths in other hosts. Do not package/deploy real index data alongside the application.

Successful replacements/deletions remove old live chunks, vectors and original source bytes; failed jobs retain bounded bytes until retry or cancellation. Old version metadata is not an archival history service. SQLite free pages/WAL/backups can retain data; deletion is **not secure erasure**. The existing generated-artifact retention/link model is unchanged; production hosts must secure those exports too.

Top-k evidence does not support exhaustive contract listings or financial totals. No fine-tuning, model training, cloud OCR, hosted vector store, crawling or background model downloads are involved. Retrieval/citations improve traceability, not proof of answer correctness.

## Validation and benchmark (Windows, September 8, 2026)

Deterministic tests cover native FTS5 initialization, persistence/schema recovery, unchanged imports, failed/cancelled replacement, retry, deletion, literal queries, zero/nonfinite/dimension/model rejection, semantic candidates without keyword overlap, hybrid fusion, source authorization, HTTP upload/search/download, request-local evidence and citation validation, and context-overflow rejection. Validation passed: 81 existing AI tests, 12 ASP.NET tests, 14 knowledge regressions plus the benchmark, 153 existing MCP tests plus the new native extraction-isolation test, and 28 JavaScript tests. TypeScript declarations, sample publish, all five AI package signatures/assets and the separate MCP package verification passed.

An isolated published sample rendered successfully in the browser with model warmup disabled. That smoke check identified and corrected initial Knowledge-tab visibility and scrolling. The test host and its editor worker were shut down; user applications were not restarted. A complete interactive upload-to-cited-generation browser run still needs the chosen real embedding/chat models.

Synthetic measurement: 100 documents / 2,000 chunks / 384-dimensional deterministic test embeddings, Windows 10.0.26200 x64, 20 logical CPUs, .NET 8.0.25. Indexing: 23.98 s. Twenty hybrid queries: median 56.8 ms, p95 139.2 ms. Process working set: 105.9 MiB; managed memory: 12.7 MiB; database: 10,801,152 bytes. These include test-host overhead; CPU model was unavailable in the restricted environment. Three fixed evidence checks passed: exact contract identifier, nonexistent-policy/no-answer retrieval, and conflicting thirty-day/sixty-day Riverbend sources. This is a storage/ranking benchmark, **not a real-model embedding throughput or answer-quality benchmark**.

Reproduce with `dotnet test tests/TXTextControl.AI.Knowledge.Tests -c Release --filter FullyQualifiedName~KnowledgeBenchmarkTests --logger "console;verbosity=detailed"`. No production documents are used.

Still requiring deployment validation: a customer-supplied real embedding GGUF (including its exact pooling/prefixes), grounded generation and approved-edit quality with the chosen local chat model, Linux native-runtime/FTS deployment, and browser/editor interaction against the deployed MCP version. No model was supplied for this feature and no runtime/model acquisition or user-app restart was performed. The test vectors intentionally do not establish real semantic quality.

Primary implementation references: [SQLite FTS5](https://www.sqlite.org/fts5.html), [llama.cpp embeddings](https://github.com/ggml-org/llama.cpp/tree/master/examples/embedding), [Microsoft embedding interface](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.ai.iembeddinggenerator-2), and TX Text Control MCP documentation for `ServerTextControl.Load` and `PDFImportSettings.GenerateLines`. Extraction locators describe source blocks, never working-editor indexes.
