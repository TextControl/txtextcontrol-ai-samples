# TX Text Control MCP Server

Host document-focused Model Context Protocol tools in your own ASP.NET Core
application. `TXTextControl.AI.McpServer` creates, inspects, edits and converts
documents using the licensed TX Text Control engine, independently of any AI
provider, chat model or website.

The package is a **server hosting library**, not a ready-to-run executable or
MCP client. It includes document workflows, native styles, tables, fields,
templates, structured exports and a bounded worker pool. It does **not** include
the reference application's admin pages, login scheme or an inference engine.

## Contents

- [Requirements and getting started](#requirements-and-getting-started)
- [Hosting and security](#hosting-and-security)
- [Configuration](#configuration)
- [Document workflows and calls](#document-workflows-and-calls)
- [Styles and formatting](#styles-and-formatting)
- [Tables, fields and advanced operations](#tables-fields-and-advanced-operations)
- [Knowledge extraction HTTP endpoint](#knowledge-extraction-http-endpoint)
- [Workers, storage and deployment](#workers-storage-and-deployment)
- [Errors and troubleshooting](#errors-and-troubleshooting)
- [MCP tool reference](#mcp-tool-reference)
- [Public C# reference](#public-c-reference)

## Requirements and getting started

Requires **.NET 10 / ASP.NET Core 10** and appropriately licensed TX Text Control
products. The package declares dependencies on the MCP ASP.NET Core SDK, TX Text
Control Core SDK 34 and the TX Markdown integration. Configure the required
Text Control NuGet source and credentials for commercial dependencies.

The managed package does not remove native platform requirements. Deploy the
document engine on a supported Windows/Linux environment; it is not a native
macOS document engine. Linux deployments require the SDK-supported architecture,
system libraries and fonts. A separate AI service may run on a Mac and call MCP.

```sh
dotnet add package TXTextControl.AI.McpServer --version 0.1.0-beta.1
```

Use the feed where this preview is published. Building a repository does not
publish a package to NuGet.org.

Minimal loopback-only development `Program.cs`:

```csharp
using TxTextControl.McpServer;

// Must run before web-host initialization and before any console output.
// The pool relaunches this executable as a document worker.
if (await TextControlMcpWorker.RunIfRequestedAsync(args) is int exitCode)
{
    Environment.ExitCode = exitCode;
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5000");
builder.Services.AddTextControlMcpServer(builder.Configuration);
var app = builder.Build();
app.MapTextControlMcp();
app.Run();
```

The registration takes the application configuration **root**, not just one
section. Deploy worker runtimeconfig/deps/native files along with the application.
Do not print banners before worker dispatch; worker stdout is a protocol stream.

## Hosting and security

`AddTextControlMcpServer(services, configuration)` registers tools, sessions,
presets, operation handlers, cleanup and the selected document engine.
`MapTextControlMcp` maps the MCP transport, Knowledge extraction and downloads,
returning a group to which the host can attach authorization:

```csharp
// Configure host authentication and this policy before building the app.
app.UseAuthentication();
app.UseAuthorization();
app.MapTextControlMcp().RequireAuthorization("DocumentAccess");
```

Replace the unprotected mapping with the protected one. The package does not
automatically authenticate users or implement per-user document-session
ownership. A shared session ID is not proof of access. Before exposing the server,
supply TLS, user/service authentication, session ownership enforcement, quotas,
ingress limits and appropriate retention.

The reference host's `Admin` login, `McpServiceAuthentication` bearer guard and
Razor administration pages are **host features**, not routes added by this NuGet.
Configuring `Admin:Username` and `Admin:Password` alone does not secure the MCP
transport. Do not expose the reference defaults as production credentials.

Map on the root application rather than an extra route-group prefix.
For reverse proxies/PathBase, configure trusted forwarding and the public host
consistently so generated download URIs point to the intended origin.
Opening `/mcp` in a browser is not a tool call; use an MCP Streamable HTTP client.

## Configuration

All defaults below are library defaults. The reference host may supply richer
presets and different values. Environment variables use double underscores,
for example `DocumentWorkerPool__WorkerCount`.

### McpServer

| Setting | Default | Purpose |
| --- | --- | --- |
| Name | TX Text Control Document MCP Server | Server settings name |
| BasePath | samples | Private writable document/session storage root |
| SessionMaxAgeHours | 12 | Session/file retention age used by cleanup |

Use a persistent private directory rather than a public static-content folder.
Persisting files is not the same as a distributed/restart-persistent session
registry.

### DocumentWorkerPool

| Setting | Default | Rules / purpose |
| --- | --- | --- |
| Enabled | true | Out-of-process pool; false selects in-process engine |
| WorkerCount | 2 | 1–16 document workers |
| InteractiveWorkerCount | 0 | Reserved interactive capacity, 0 through WorkerCount−1 |
| QueueCapacity | 128 | Bounded queue; at least WorkerCount |
| StartupTimeoutSeconds | 30 | Positive worker startup deadline |
| CommandTimeoutSeconds | 180 | Positive document-command deadline |
| SessionAffinityIdleSeconds | 120 | Positive warm-session affinity idle lifetime |
| MaximumHotSessions | 2 | Nonnegative hot-session bound |
| WorkerRestartLimit | 5 | Nonnegative restart limit |
| WorkerRestartBackoffMilliseconds | 500 | Nonnegative restart backoff |
| MaximumInputMegabytes | 64 | Positive worker protocol input limit |
| MaximumOutputMegabytes | 128 | Positive worker protocol output limit |
| WorkerExecutablePath | null | Optional existing executable or published DLL implementing worker dispatch |

Resource limits apply in addition to web-server/reverse-proxy/MCP limits.
A larger queue does not create more native-engine capacity; size workers against
memory and licensing/deployment constraints.

### DocumentAutomation

| Setting | Default | Purpose |
| --- | --- | --- |
| EnabledCapabilityPacks | null | Capability-pack selection; inspect effective capabilities |
| EnabledOperations | null | Operation selection; inspect effective capabilities |
| StylePresets | empty | List of TextStyleDefinition |
| DefaultParagraphStyleName | Body | Default paragraph preset name |
| StyleRoles | new() | Semantic role-to-preset names |
| DefaultPageLayout | null | Host default page geometry |
| TableStylePresets | empty | List of TableStylePresetDefinition |

Null enables all registered packs/operations; an explicitly empty list enables
none in that dimension. Nonempty lists select trimmed, case-insensitive names.
Both the pack and operation must be enabled. Pack names are `BasicText`, `Tables`,
`Fields`, `Media`, `Sections` and `HeaderFooter`. Use
`get_document_automation_capabilities` to verify the effective enabled set rather
than assuming disabled operations disappeared from tool discovery.

A compact, self-contained presentation configuration:

```json
{
  "McpServer": { "BasePath": "documents", "SessionMaxAgeHours": 12 },
  "DocumentWorkerPool": { "Enabled": true, "WorkerCount": 2, "QueueCapacity": 128 },
  "DocumentAutomation": {
    "DefaultParagraphStyleName": "Body",
    "StyleRoles": {
      "Title": "Title", "Heading1": "Heading", "Heading2": "Heading2", "Body": "Body"
    },
    "StylePresets": [
      { "Name": "Title", "FontName": "Arial", "FontSize": 24, "Bold": true },
      { "Name": "Heading", "FontName": "Arial", "FontSize": 16, "Bold": true },
      { "Name": "Heading2", "FontName": "Arial", "FontSize": 13, "Bold": true },
      { "Name": "Body", "FontName": "Arial", "FontSize": 11 }
    ],
    "DefaultPageLayout": {
      "PageSize": "A4", "Orientation": "portrait", "Unit": "mm",
      "MarginTop": 20, "MarginBottom": 20, "MarginLeft": 20, "MarginRight": 20
    }
  }
}
```

Install/license the fonts you choose. A name in JSON does not install that font.

Settings-editing services persist explicit administration edits to
`appsettings.json` under the host content root. Make it writable only if your host
uses those services. Do not promise every arbitrary configuration provider
hot-reloads every engine/worker setting; restart for deployment-level changes.
Changes to creation presets affect subsequent creation; applying presets to an
existing document is a separate explicit mutation.

## Document workflows and calls

MCP tool calls use `tools/call` with a name and arguments. Most focused tools take
a single `request` object; some inspection calls take `sessionId` directly.
Use the exact discovered input schema. Do not flatten `request` unless the
schema says to. The generated tool and C# references below list all entry points,
request types, properties, defaults and explicit JSON names.

### Create, inspect, edit and export

Create a fixed-content document from Markdown:

```json
{
  "name": "create_document_from_markdown",
  "arguments": {
    "request": { "markdown": "# Review checklist\n\n- Verify names\n- Approve changes" }
  }
}
```

Retain the returned `sessionId`. Inspect a bounded portion:

```json
{
  "name": "inspect_document",
  "arguments": {
    "request": { "sessionId": "RETURNED_SESSION_ID", "maxCharacters": 8000 }
  }
}
```

`InspectDocumentRequest` also supports query, startParagraphIndex, paragraphCount
and contextParagraphs (default 1). Follow `truncated` and `nextParagraphIndex`
when more content is needed; do not automatically replace paging with full text.

Edit using one inspected target mode:

```json
{
  "name": "edit_document",
  "arguments": {
    "request": {
      "sessionId": "RETURNED_SESSION_ID",
      "matchText": "Approve changes",
      "replacementText": "Obtain manager approval",
      "replaceAll": false
    }
  }
}
```

Other targets are one paragraph, an inclusive paragraph range, or server-inspected
start/length. For character ranges pass `expectedText` to reject stale edits.
Never treat a browser selection offset as a paragraph index or assume it survives
serialization, especially inside tables. Use selected text plus nearTextPosition
for tools supporting semantic selection.

Export only after successful mutation:

```json
{
  "name": "create_document_export",
  "arguments": {
    "request": {
      "sessionId": "RETURNED_SESSION_ID", "format": "pdf", "fileName": "checklist.pdf"
    }
  }
}
```

Export metadata contains sessionId, exportId, format, fileName, mimeType,
byteCount and downloadUri. Download that exact URI through an authorized client.
Do not invent a URL or send Base64 to the LLM just to produce a file.
`get_as_base64` is an application compatibility transfer option.

### Other workflows

| Intent | Preferred calls |
| --- | --- |
| Load an upload | load_document with data and sourceFormat; optional sessionId replaces that session |
| Convert unchanged content | convert_document with existing session or uploaded source and outputFormat; no rewriting/restyling |
| Question about a section | inspect_document_section; use returned text/hash |
| Replace a named section body | replace_document_section with heading, expectedContentHash, replacementText and optional occurrenceIndex |
| Complete advanced layout | create_document with semantic Document model |
| Reusable template | list_document_recipes, create_document_from_recipe, inspect actual fields, merge_template |
| Apply current presets to existing content | apply_document_preset_styles |
| Advanced structural edit | apply_operations after inspection |
| End session | delete_session; removes session files |

Document import/export supports `tx`, `rtf`, `docx`, `pdf`, `html`, `md` and `txt`
where the chosen operation supports it; load can use auto detection.
Conversion is not guaranteed lossless between formats with different features.
PDF import requires readable text; no OCR pipeline is included.

The neutral Document model describes sections, paragraphs/runs, real tables,
images, fields, styles and headers/footers. It is not an authoritative substitute
for live native inspection after arbitrary document imports/edits. Use live
table/style/field inspection for those tasks.

## Styles and formatting

Distinguish a **named native style definition**, a **style assignment**, and
**direct formatting**. To change all paragraphs linked to Heading 1:

```json
{
  "name": "set_document_style",
  "arguments": {
    "request": {
      "sessionId": "RETURNED_SESSION_ID",
      "styleName": "Heading 1",
      "text": { "colorHex": "#FF0000", "underline": true }
    }
  }
}
```

Inspect `list_document_styles` first if the exact name/usage is unknown.
`set_document_style` supports basedOn, followingStyle, text and paragraph.
`apply_document_style` links paragraphs using a paragraph/range, match text,
allMatches or allParagraphs. `rename_document_style` changes a name;
`delete_document_style` accepts replacementStyleName where needed.
Check native results; direct formatting and inherited styles can affect appearance.

`create_styles_from_paragraphs` accepts sessionId, styleNamePrefix
(default Generated Style), minimumOccurrences (default 1), includeStyledParagraphs
(default false). It groups equal character/paragraph formatting, reuses equivalent
styles, creates missing styles and links qualifying paragraphs. Mixed character
formatting is skipped rather than flattened; inspect returned counts and styles.

### Formatting contracts

| Type | Fields / defaults |
| --- | --- |
| TextStyleDefinition | name; fontName, fontSize, fontSizeUnit (pt), bold, italic, underline, strikeout, colorHex, backgroundColorHex, characterSpacing, characterScaling, baseline, capitals, paragraph |
| ParagraphStyleDefinition | alignment, spaceBefore/spaceAfter, lineSpacing, absoluteLineSpacing, left/right/hangingIndent, backgroundColorHex, keepLinesTogether, keepWithNext, pageBreakBefore, widowOrphanLines, unit (pt) |
| StyleRoleDefinition | title=Title, heading1=Heading, heading2=Heading2, body=Body |
| PageLayoutDefinition | pageSize/orientation or pageWidth/pageHeight, unit, marginLeft/right/top/bottom |
| TableStylePresetDefinition | name, headerRowIndex (0), headerStyle/headerCellStyle, bodyStyle/bodyCellStyle, alternatingRowStyle/alternatingRowCellStyle |
| CellStyleDefinition | backgroundColorHex, border, paddingLeft/right/top/bottom, paddingUnit (pt), horizontalAlignment, verticalAlignment |
| CellBorderDefinition | width/colorHex defaults plus left/top/right/bottom side overrides |
| CellBorderSideDefinition | width, colorHex |

Omitted nullable properties preserve/default rather than explicitly clear.
Use explicit false to turn off supported Boolean formatting.
Use hexadecimal colors and declared units; do not confuse point font sizes with
native engine units or relative line spacing with absolute spacing.
`format_text` uses its discovered wire names (including snake_case compatibility
fields); do not assume every formatting request has the same JSON naming.

## Tables, fields and advanced operations

Use `get_document_tables` for actual IDs/order. Table indexes are zero-based;
`tableNumber` is one-based. Do not guess IDs. `insert_table` accepts complete
rows. `add_table_rows` targets a returned ID or tableNumber and count.
`format_table` handles semantic scopes and text-based selected-cell targeting;
the full request contract is in the reference below.

Merge fields are real native MERGEFIELD application fields, not ordinary
`{{name}}` strings. Use insert_merge_field / update_merge_field, inspect
get_template_merge_fields, and use create_merge_block for repeatable content.
Form fields use insert_form_field / update_form_field and
get_template_form_fields. Clear operations remove field markup and are
destructive; invoke only when requested.

`merge_template` accepts sessionId and JSON via jsonData or data. Append defaults
false. RemoveEmptyFields, RemoveEmptyBlocks, RemoveEmptyImages, RemoveEmptyLines
and RemoveTrailingWhitespace default true. formFieldMergeType preselect retains
editable form fields; replace flattens them.

`apply_operations` takes sessionId, createIfMissing (default true) and operations.
For edits explicitly use the existing session and `createIfMissing: false`.
Every item requires `type`. Do not use repeated append operations to assemble a
complete ordinary draft when Markdown creation expresses it directly.

Capability packs group text/styles, tables, fields, images, sections and
headers/footers. `get_document_automation_capabilities` is the compact discovery
call. `get_authoring_guide` returns heavyweight operation schemas, required and
optional properties, presets, examples and valid values; fetch it deliberately,
not for every turn. The public contracts below expose all DocumentOperation
fields, but a field's presence does not mean it applies to every discriminator.

Advanced host extensibility: implement/register `ICapabilityPack` and
`IDocumentOperationHandler`. The registry resolves handlers and enforces the
configured pack/operation enablement. `DocumentOperationContext` gives handlers
native execution/model context. Test serialization, model effects and native
behavior together; registering a handler does not automatically add a new MCP
tool or arbitrary new JSON properties to the existing operation DTO.

## Knowledge extraction HTTP endpoint

This non-MCP HTTP endpoint moves rich-format extraction off an AI/Knowledge host:

- POST `/mcp/knowledge/extract?format=pdf` (or docx/rtf/tx/html/htm).
- Body: source bytes, `Content-Type: application/octet-stream`.
- Header: `X-TextControl-Knowledge: 1` plus the host's authentication.
- Response: `{ version: "mcp-tx34-structure-v1", blocks: [...] }`.

Each block carries text, locator and optional heading/tableHeader context.
Limits: 32 MiB binary, two million extracted characters and 100000 blocks,
subject to lower ingress limits. Native imports are serialized and use a
short-lived control; cancelling the HTTP request cannot interrupt a native load
already running. No working document session or source file is created.

PDF extraction uses readable text lines, not OCR, page coordinates or inferred
table layout. Rich-document extraction currently omits non-body stories such as
headers/footers/footnotes/text frames. Knowledge stores originals and indexes on
its own host. `extract_knowledge_blocks` is a separate MCP tool for a document
already loaded in a session, with paging via startBlock.

HTTP extraction errors: 400 invalid/header/format/empty request; 413 size;
422 extraction/readability failure; 503 native engine/licensing availability.
Protect this endpoint with the same authorization, TLS and quotas as MCP.

## Workers, storage and deployment

The default persistent pool bounds native concurrency and reuses hot sessions.
The host entry point must dispatch workers before initialization. Set
`WorkerExecutablePath` explicitly behind IIS/service wrappers where relaunching
the current executable would launch the wrapper rather than your application.
A published DLL needs its runtimeconfig/deps and dependencies beside it.

`Enabled: false` selects the in-process engine; it does not remove native SDK
requirements. Session state is not a distributed store. Plan affinity and
single-host ownership before scaling replicas. Do not expose storage directories
through static files. Delete sessions deliberately or configure cleanup.

The package's buildTransitive target copies the SDK's default fonts from the
restored SDK package to build/publish output. Fonts are not embedded in this
package and retain SDK license terms. Install additional document fonts yourself.

Package contents: strong-name-signed `TXTextControl.McpServer.Core` assembly,
XML docs, transitive font target, this README, LICENSE.txt and TX 34 icon.
The standalone executable retains a different assembly identity.
No private SNK, model, user document, credential, admin page or appsettings file
is bundled. Strong naming is not NuGet archive signing or native macOS notarization.

## Errors and troubleshooting

MCP calls can return a structured error even when HTTP transport succeeded.
Check `isError` and structured content. Common codes include invalid_argument,
not_found, invalid_operation, license_error, internal_error and worker-specific
codes. Never report a mutation/download as successful from prose alone.

| Symptom | Check |
| --- | --- |
| Worker never starts | Early dispatch, executable path, deployment files, stdout noise and startup limits |
| license_error / extraction 503 | Licensed native SDK deployment on MCP host, not AI host |
| Native load failure | Supported OS/architecture, system libraries and fonts |
| Presets not reflected | Correct host configuration, preset names, native style usage and explicit apply-to-existing request |
| Wrong target / stale edit | Inspect current server indexes/hash; never invent offsets or IDs |
| Exports unreachable | Public origin/PathBase/forwarded headers and authorization on downloads |
| Large tool result / token error | Paged inspection and direct download; avoid full text/Base64/authoring guide in routine model context |
| Missing session after restart | File persistence does not supply distributed or restored session metadata automatically |
| Queue timeout | Concurrency, native workload, memory and bounded worker settings |

Tool error messages can include exception details. Review production error/log
redaction and do not expose private paths or source content to unauthorized users.

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

## MCP tool reference

Every declared tool is listed below. A `request` parameter becomes `arguments.request`;
scalar parameters are direct arguments. Live `tools/list` remains authoritative for
the deployed version and host extensions. Request/response fields follow in the C# reference.

| Tool | Entry point / arguments | Behavior |
| --- | --- | --- |
| `add_table_rows` | `AddTableRows(AddTableRowsRequest request)` | Primary tool for requests such as 'add 5 more rows to the second table'. Required: sessionId and either tableId or one-based tableNumber. Supply count to add empty rows, or rows as an array of row arrays to add specific values. Call get_document_tables first when the user identifies a table by order or when multiple tables exist; it returns authoritative tableCount, tableNumber, tableId, rowCount, columnCount, and cell previews from the live TX document. Do not guess a table id. |
| `apply_document_preset_styles` | `ApplyDocumentPresetStyles(ApplyDocumentPresetStylesRequest request)` | Applies the MCP server's configured default page layout, paragraph style presets, and table preset to an already loaded document. Use this after load_document when the user asks to apply, normalize, polish, or restyle the document with preset/default styles. It preserves all document text and the existing sessionId, maps imported Markdown H1/H2/H3 hierarchy to Title/Heading1/Heading2 and other paragraphs to Body, styles native tables, and requires only request.sessionId. Do not recreate the document and do not ask the model to emit per-paragraph or per-cell formatting operations. |
| `apply_document_style` | `ApplyDocumentStyle(ApplyDocumentStyleRequest request)` | Applies an existing named paragraph style. Specify exactly one target: zero-based paragraphIndex, startParagraphIndex/endParagraphIndex, matchText, or allParagraphs=true. For selected editor text use matchText plus nearTextPosition; do not treat a browser offset as a paragraph index. Use allMatches only with matchText. |
| `apply_operations` | `ApplyOperations(ApplyOperationsRequest request)` | Advanced mutation tool for structural or formatting changes to an existing session after inspect_document. Prefer edit_document for ordinary text replacement and insert_table for adding a simple table. Every operations item requires its type discriminator. Reuse sessionId. Do not use createIfMissing to assemble a complete draft; use create_document or a recipe. Omit styling properties not explicitly requested so server presets remain in effect. |
| `classify_document` | `ClassifyDocument(ClassifyDocumentRequest request)` | Fast deterministic classification of the live document. Required: request.sessionId. Returns one broad category (Legal, Healthcare, Accounting, Finance, Human Resources, Sales & Marketing, Technical, Education, Transportation, or General), confidence, matching signals, and category-specific suggested actions with ready-to-use prompts. Use this to populate document quick actions; summary remains a universal client action. This tool inspects only the current session and does not call an LLM or modify the document. |
| `clear_application_fields` | `ClearApplicationFields(ClearFieldsRequest request)` | Removes all ApplicationField markup, including MERGEFIELD and other application fields, from the body, headers, and footers. keepText defaults to true so visible values remain. This does not remove form fields. |
| `clear_form_fields` | `ClearFormFields(ClearFieldsRequest request)` | Removes all TX Text Control form-field markup from the body, headers, and footers. keepText defaults to true so visible values remain. This does not remove MERGEFIELD ApplicationFields. |
| `convert_document` | `ConvertDocument(ConvertDocumentRequest request)` | Converts a document with TX Text Control and performs no inspection, generation, rewriting, or styling. Provide exactly one source: request.sessionId for an already loaded document, or request.data plus optional request.sourceFormat for an uploaded document. Required request.outputFormat: tx, rtf, docx, pdf, html, md, or txt. Optional request.fileName. For 'convert X to Y', call only this tool and return its downloadUri. |
| `create_document` | `RenderDocumentModel(RenderDocumentModelRequest request)` | Advanced complete-document creation tool using the semantic Document model. Prefer create_document_from_markdown for ordinary fixed-content documents. Use this tool when the user requests explicit fonts, colors, sizes, advanced layout, headers/footers, images, fields, or structures Markdown cannot represent. Omit every style and page property the user did not specify: the server applies its configured defaults to those elements. Use document.title, semantic paragraph roles, and real table rows/cells. Never assemble a full draft through create_empty_document plus apply_operations. |
| `create_document_export` | `CreateDocumentExport(CreateDocumentExportRequest request)` | Creates a server-side document export and returns a compact HTTPS/HTTP download link plus file metadata. Required: request.sessionId and request.format. Optional: request.fileName. Supported formats: tx, rtf, docx, pdf, html, md, txt. Prefer this over get_as_base64 for AI and high-performance clients. |
| `create_document_from_markdown` | `CreateDocumentFromMarkdown(CreateDocumentFromMarkdownRequest request)` | Primary creation tool for ordinary documents whose complete fixed content can be expressed as Markdown: reports, letters, proposals, agendas, articles, and invoices with concrete line items. Required: request.markdown containing the complete document, with one H1 title, H2/H3 hierarchy, lists, emphasis, and valid Markdown tables as appropriate. Pass raw Markdown text, not Base64 and not an outer code fence. The server creates a new session and atomically imports the Markdown, maps its hierarchy to configured Title/Heading1/Heading2/Body styles, applies the default page layout and table preset, and returns sessionId. If an output format was requested, call create_document_export next with that sessionId. Do not use this for reusable templates, merge fields, repeating blocks, form fields, headers/footers, images, or explicit fonts/colors/sizes; use a matching recipe or create_document for those advanced semantics. |
| `create_document_from_recipe` | `CreateDocumentFromRecipe(CreateDocumentFromRecipeRequest request)` | Creates a new reusable template or advanced document by executing a server-owned recipe returned by list_document_recipes. Prefer this for merge fields, repeating blocks, form fields, and established template semantics. For ordinary fixed content, use create_document_from_markdown. If mergeFields or repeatingBlocks are returned, populate them with merge_template before export. |
| `create_empty_document` | `CreateDocument()` | Advanced lifecycle tool: creates an intentionally empty session with the configured default page layout. Do not use it for a user request to create a complete document; use create_document or a matching server-owned recipe instead. |
| `create_merge_block` | `CreateMergeBlock(CreateMergeBlockRequest request)` | Creates a real repeating MailMerge block (txmb_ SubTextPart) around existing content. Required: sessionId, blockName, and exactly one target: tableId plus rowIndex; start plus length and expectedText; or startParagraphIndex plus optional endParagraphIndex. It wraps existing content and does not insert '{{#block}}' text. |
| `create_styles_from_paragraphs` | `CreateStylesFromParagraphs(CreateStylesFromParagraphsRequest request)` | Mutates the current session document by converting direct paragraph formatting into reusable native styles, following Text Control's formatting-comparison approach. Call this tool for requests such as 'convert paragraphs to styles' or 'create styles from the existing paragraph formatting'. It compares common character and paragraph attributes, reuses an equivalent existing style, or creates a uniquely named style and links every qualifying paragraph. The generated styles and paragraph links are persisted in the session document returned by get_as_base64. Mixed-format paragraphs are skipped to avoid losing inline formatting. Omit styleNamePrefix to use 'Generated Style'. Set minimumOccurrences to 2 or more only when the user wants repeated formatting groups; the default 1 includes one-off groups. includeStyledParagraphs defaults to false so existing named styles are preserved. |
| `delete_document_style` | `DeleteDocumentStyle(DeleteDocumentStyleRequest request)` | Deletes a native paragraph style. If it is in use, replacementStyleName is required and every linked paragraph is reassigned before deletion. Built-in [Normal] cannot be deleted. |
| `delete_session` | `DeleteSession(string sessionId)` | Deletes a session and removes all related session files from disk. Input: sessionId. Returns { deleted, sessionId } where deleted indicates whether a session directory was removed. |
| `edit_document` | `EditDocument(EditDocumentRequest request)` | Primary deterministic text-edit tool for an existing session. Inspect first to obtain exact text or paragraph indexes. Required: request.sessionId and request.replacementText. Select exactly one target: matchText (optionally occurrenceIndex or replaceAll), paragraphIndex, startParagraphIndex plus optional endParagraphIndex, or start plus length. For start/length edits, pass expectedText from the inspection or active editor selection; the server rejects stale or invented coordinates when the current range differs. It changes only the selected text and never creates or regenerates a document. Success returns changed=true, editsApplied greater than zero, and the committed revision. Do not claim success from the request alone. When the user names a clause or part by heading, prefer inspect_document_section followed by replace_document_section. For formatting-only or structural edits, use format_text or advanced apply_operations after inspection. |
| `extract_knowledge_blocks` | `ExtractKnowledgeBlocks(string sessionId, int startBlock = 0)` | Host-controlled reference ingestion only. Read lossless paragraphs and table rows, with repeated first-row context, from an isolated session. Required sessionId; startBlock defaults to 0. Continue with nextBlock until null. Do not use in ordinary model conversations; use inspect_document instead. Source locators are labels, not editor positions. |
| `format_paragraph` | `FormatParagraph(FormatParagraphRequest request)` | Primary tool for paragraph-level formatting such as 'center the selected paragraph', 'justify paragraph 2', 'center paragraphs 2 through 4', 'double-space the paragraph containing Payment', or 'apply the Heading style'. Required: sessionId; exactly one target: paragraphIndex, startParagraphIndex plus optional endParagraphIndex (all zero-based MCP indexes), matchText, or allParagraphs=true; and at least one change: styleName, alignment, spaceBefore, spaceAfter, or lineSpacing. With an editor selection, pass selectedText as matchText and the browser start as nearTextPosition; the server finds the closest authoritative TX occurrence and formats its containing paragraph. Do not call search_text_ranges and do not pass browser offsets as paragraphIndex. If matchText occurs more than once, choose with nearTextPosition or occurrenceIndex, or set allMatches=true. alignment accepts left, right, center, or justify. unit defaults to pt. The tool preserves text and returns the exact paragraphIndexes changed. |
| `format_table` | `FormatTable(FormatTableRequest request)` | Primary tool for table formatting requests such as 'give the selected cells a red background' or 'make the selected table header green'. Required: sessionId, scope, and at least one formatting property. scope is selectedCells, header, cell, row, column, or table. With an editor selection, pass selectedText as matchText, browser start as nearTextPosition, and browser selection length as selectionLength; the server resolves the authoritative TX table/cells using TableCell.Start and Length. Do not call search_text_ranges and do not translate browser offsets into table, row, or column indexes. For header scope, rowIndex defaults to 0. Explicit targeting may use one-based tableNumber (preferred for imported documents) or tableId plus zero-based rowIndex/columnIndex. Cell appearance properties include backgroundColorHex, borderWidth/borderColorHex, padding, horizontalAlignment, and verticalAlignment. Text properties include bold, italic, underline, textColorHex, fontName, and fontSize. The result returns the actual tableId, tableNumber, cellCount, and cell coordinates changed. |
| `format_text` | `FormatText(string sessionId, FormatTextRequest request)` | Applies character appearance to either (a) an explicit MCP text range or (b) all characters in one paragraph by zero-based MCP paragraph index. Required: sessionId and request payload. Range mode requires request.start and request.length. Paragraph mode requires request.paragraphIndex, where the first paragraph is 0 and the second is 1. Do not combine range and paragraph inputs. Supported properties: bold, italic, underline, color_hex, font_name, font_size (points). This tool does not change paragraph alignment or spacing; use format_paragraph for those requests. For every/all occurrence of text, use format_text_occurrences. |
| `format_text_occurrences` | `FormatTextOccurrences(FormatTextOccurrencesRequest request)` | Primary tool for requests to format every/all occurrence of text. Required: sessionId, matchText, and at least one of bold, italic, underline, colorHex, fontName, or fontSize. The server uses TX Text Control Find and applies formatting atomically to authoritative server ranges; do not call search_text_ranges or format_text repeatedly. Set wholeWord=true when the user names a word, so matching 'information' does not also format it inside a larger word. Optional matchCase and maxOccurrences narrow the matches. fontSizeUnit is pt by default. Success returns one applied operation whose occurrenceCount is the number actually formatted; never claim a different count. |
| `get_as_base64` | `GetAsBase64(GetAsBase64Request request)` | Exports the current session document as base64. Required fields: request.sessionId and request.format. Supported formats: tx, rtf, docx, pdf, html, md, txt. Returns sessionId, normalized format, and base64Document. Use this tool as the final step when the caller needs inline file data. |
| `get_authoring_guide` | `GetAuthoringGuide()` | Returns a complete self-contained authoring guide for advanced document construction. Includes workflows, schemas, examples, presets, valid values, and troubleshooting. This is a heavyweight response; ordinary fixed-content documents should use create_document_from_markdown directly. |
| `get_document_automation_capabilities` | `GetDocumentAutomationCapabilities()` | Returns a compact overview of enabled automation capabilities, operation names, configured style names, and output formats. Use get_authoring_guide only when complete schemas, examples, and troubleshooting guidance are required. |
| `get_document_fields` | `GetDocumentFields(string sessionId)` | Returns merge/application fields represented by the automation model, including field ids, names, values, properties, and model locations. |
| `get_document_headers_footers` | `GetDocumentHeadersFooters(string sessionId)` | Returns headers and footers represented by the automation model for each section, including type, text preview, and contained blocks. |
| `get_document_model` | `GetDocumentModel(string sessionId)` | Returns the neutral AI-facing document model for a session, including Document, Section, Paragraph, Run, Table, Image, Style, HeaderFooter, and Field structures captured by supported operations. |
| `get_document_structure` | `GetDocumentStructure(string sessionId)` | Returns a compact structure summary for a session document: sections, block types, paragraph previews, authoritative live table count/dimensions, image alt text, field names, and header/footer presence. Use get_document_tables for ordered table details and ordinal table edits. |
| `get_document_styles` | `GetDocumentStyles(string sessionId)` | Returns authoritative native TX paragraph styles for a session, including exact name, base/following style, character and paragraph definitions, built-in status, and live paragraph usage count. Prefer list_document_styles for the focused style workflow. |
| `get_document_tables` | `GetDocumentTables(string sessionId)` | Authoritative live-table inspection. Returns tableCount and all tables in document order with zero-based tableIndex, one-based tableNumber, actual TX table id, row/column counts, and cell text previews. Use this to answer how many tables exist and before requests such as 'the second table'. For row additions, pass the returned id or tableNumber to add_table_rows; do not infer tables from the neutral document model. |
| `get_paragraphs` | `GetParagraphs(string sessionId, int? start = null, int? end = null)` | Advanced compatibility read tool. Prefer inspect_document for ordinary questions and edit planning. Reads paragraph text values from a session document with optional start/end indexes. |
| `get_session` | `GetSession(string sessionId)` | Validates that a session exists and returns its sessionId. Useful for guard checks before content operations. If the session does not exist, a not_found error is returned. |
| `get_template_form_fields` | `GetTemplateFormFields(string sessionId)` | Returns actual TX Text Control form fields from the current session document, including text, selection/dropdown, checkbox, date, and whether each field is in the body, header, or footer. Use this to verify insertion. |
| `get_template_merge_blocks` | `GetTemplateMergeBlocks(string sessionId)` | Returns actual TX Text Control merge-block SubTextParts from the current session document. Merge blocks are named txmb_<blockName>. |
| `get_template_merge_fields` | `GetTemplateMergeFields(string sessionId)` | Returns actual TX Text Control MERGEFIELD ApplicationFields from the current session document, including whether each field is in the body, header, or footer. Use this to verify insertion and inspect a template before MailMerge. |
| `get_text` | `GetText(string sessionId)` | Advanced compatibility read tool returning complete plain text. Prefer inspect_document because it includes stable paragraph indexes, query focus, and paging. |
| `insert_form_field` | `InsertFormField(InsertFormFieldRequest request)` | Inserts one or more real TX Text Control text, selection, checkbox, or date form fields into an existing document. Required: sessionId, fieldName, and formFieldType. Replace existing text with matchText plus replaceAll, occurrenceIndex, or nearTextPosition; the latter selects the server match closest to a browser-editor position. Alternatively target an MCP-inspected start/length range with expectedText, an absolute textPosition, a paragraphIndex with placement start/end/replace, a table cell, or a header/footer. Omit every target for the body end. This creates field markup, not placeholder text. |
| `insert_merge_field` | `InsertMergeField(InsertMergeFieldRequest request)` | Inserts one or more real Word-compatible MERGEFIELD ApplicationFields into an existing document; never insert '{{name}}' placeholder text. Required: sessionId and fieldName. To replace names or placeholders, set matchText and one of replaceAll=true, occurrenceIndex, or nearTextPosition. nearTextPosition is a non-authoritative browser-position hint that selects the closest server-side match and is ideal for editor selections inside tables. Set fieldText to the original matched text when its visible value must be preserved. Use start, length, and expectedText only with coordinates returned by MCP inspection/search tools. To insert without replacing text, set textPosition, or paragraphIndex with placement start/end. A paragraph placement of replace replaces its text. For a table cell set tableId, rowIndex, columnIndex and placement start/end/replace. For a header/footer set headerFooterType and placement start/end/replace; optional textPosition is relative to that header/footer. Omit every target to insert at the body end. Use exactly one target kind. |
| `insert_table` | `InsertTable(InsertTableRequest request)` | Primary tool for adding a table to an existing document. Required: sessionId and rows, where rows is an array of row arrays and each inner value is one cell. The first row is treated as the header by the default table preset. Optional placement is end (default), before, or after; paragraphIndex is required for before/after. Optional styleName and column widths should be omitted unless explicitly requested. This tool supplies the internal operation type automatically; do not use apply_operations for a simple table insertion. |
| `inspect_document` | `InspectDocument(InspectDocumentRequest request)` | Primary token-safe read tool for questions about an uploaded or existing document. Returns one bounded paragraph chunk with stable zero-based paragraph indexes, returnedCharacters, truncated, and nextParagraphIndex. Required: request.sessionId. Optional request.query focuses the response around relevant paragraphs; omit query to read sequentially. Optional startParagraphIndex, paragraphCount, contextParagraphs, and maxCharacters support paging. maxCharacters defaults to 8000; keep it at or below 12000 during a model tool-call loop. When truncated is true, continue from nextParagraphIndex only if the question requires more content. Never call get_text to work around paging. For a question, answer only from returned content and do not call any mutation or creation tool. |
| `inspect_document_section` | `InspectDocumentSection(InspectDocumentSectionRequest request)` | Resolves and reads a complete section in an existing document by its visible heading. Required: sessionId and heading. Heading numbering and case may be omitted. Returns the preserved heading, its style, exact body paragraph range, complete body text, and contentHash. Use this for requests referring to a named part such as 'No Warranty', 'Payment', or 'Termination'. Inspect any definitions or related clauses needed to draft the replacement separately. Before changing the section, pass this tool's exact heading and contentHash to replace_document_section. |
| `list_document_recipes` | `ListDocumentRecipes()` | Lists compact server-owned templates and advanced document recipes by name and goal. Use this when the user requests reusable merge fields, repeating blocks, form fields, or another template workflow. For an ordinary document with concrete fixed content, use create_document_from_markdown instead. |
| `list_document_styles` | `ListDocumentStyles(string sessionId)` | Lists authoritative native paragraph styles in the current TX document, including exact name, base style, following style, character formatting, paragraph formatting, built-in status, and usage count. Call this before changing, renaming, deleting, or applying a style when its exact name is uncertain. |
| `load_document` | `LoadFromBase64(LoadFromBase64Request request, string? sessionId = null)` | Loads one uploaded base64 document without changing its content. Required: request.data. Optional request.sourceFormat: auto, tx, rtf, docx, html, pdf, md, or txt; specify it when known for deterministic import. Optional sessionId overwrites that session, otherwise a new session is created. Returns sessionId. After loading: use inspect_document for questions, edit_document for text changes, or convert_document for conversion. |
| `merge_template` | `MergeTemplate(MergeTemplateRequest request)` | Merges JSON data into the current session template using TX Text Control MailMerge.MergeJsonData. Build templates with insert_merge_field, create_merge_block, and insert_form_field (or their batched append_* operations), then verify the real fields before merging. Set formFieldMergeType to preselect to keep form fields editable or replace to flatten them. |
| `rename_document_style` | `RenameDocumentStyle(RenameDocumentStyleRequest request)` | Renames a native paragraph style and preserves all paragraph links. Required: sessionId, styleName, and newStyleName. Built-in [Normal] cannot be renamed. |
| `replace_document_section` | `ReplaceDocumentSection(ReplaceDocumentSectionRequest request)` | Replaces only the body of a named section in an existing document; it never recreates the document and preserves the heading and surrounding content. Required: sessionId, heading, expectedContentHash from the immediately preceding inspect_document_section result, and replacementText containing only the new body. If the section changed, the call fails and must be inspected again. Use this instead of paragraph indexes when the user identifies a clause or part by heading. After success, call inspect_document_section again only when the user needs verification details. |
| `search_text` | `SearchText(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false)` | Searches paragraph text and returns paragraph indices where matches occur. Input: sessionId, text, optional matchCase, optional wholeWord. This is paragraph-level matching, not character-position matching. Use search_text_ranges when exact character offsets are required. |
| `search_text_ranges` | `SearchTextRanges(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false)` | Searches text and returns exact match ranges as (start, length) using TX Text Control Find. Input: sessionId, text, optional matchCase, optional wholeWord. Returned values are authoritative server selection coordinates safe for format_text, edit_document, insert_merge_field, insert_form_field, and merge-block ranges, including text inside tables. Do not substitute browser-editor offsets. |
| `set_document_style` | `SetDocumentStyle(SetDocumentStyleRequest request)` | Creates or updates one native named paragraph style. Call this directly when the exact style name is supplied; no document inspection is required. Example: 'change the style Heading 1 to font color red' => { sessionId, styleName: 'Heading 1', text: { colorHex: '#FF0000' } }. Existing styles are mutated in place, so all linked paragraphs inherit the change. Required: sessionId, styleName, and at least one requested change. Put character changes in text (fontName, fontSize in pt/px, bold, italic, underline, strikeout, colorHex, backgroundColorHex, characterSpacing, characterScaling, baseline, capitals). Put paragraph changes in paragraph (alignment, spaceBefore, spaceAfter, lineSpacing, absoluteLineSpacing, leftIndent, rightIndent, hangingIndent, backgroundColorHex, keepLinesTogether, keepWithNext, pageBreakBefore, widowOrphanLines). Omit unchanged properties. basedOn applies when creating a style; followingStyle may be set for either a new or existing style. Never use format_text or format_paragraph to change a named style definition. |
| `update_form_field` | `UpdateFormField(UpdateFormFieldRequest request)` | Updates every real TX Text Control form field with fieldName in the body, headers, and footers. Supports text/date/checked/items/editable/enabled values. The call fails when no matching field exists; inspect with get_template_form_fields first when uncertain. |
| `update_merge_field` | `UpdateMergeField(UpdateMergeFieldRequest request)` | Updates every real MERGEFIELD ApplicationField with fieldName in the body, headers, and footers. Set fieldText to change visible text and/or parameters to rename or replace its field parameters. The call fails when no matching field exists; inspect with get_template_merge_fields first when uncertain. |

## Public C# reference

Source-derived public types, signatures, parameter defaults and DTO fields for this version.
Bodies are omitted: these signatures are not a standalone compilable program. Concise
initializers and JSON-name/required attributes are preserved. Workflow validation may
require more than C# nullability alone. External types retain their package contracts.
Public engine/service implementation types are advanced integration surfaces; prefer
the documented registration and facade APIs for ordinary applications.

### TxTextControl.McpServer.McpServerExtensions

```csharp
/// <summary>Registers the document MCP implementation without admin pages or authentication policy.</summary>
public static class McpServerExtensions
{
    /// <summary>Registers tools, presets, sessions, exports, and the configured document engine.</summary>
    /// <param name = "services">The host service collection.</param>
    /// <param name = "configuration">The application configuration root, with McpServer, DocumentAutomation and DocumentWorkerPool sections.</param>
    public static IServiceCollection AddTextControlMcpServer(this IServiceCollection services, IConfiguration configuration);
    /// <summary>Maps the MCP transport and structured download endpoints. Apply authorization to the returned group.</summary>
    /// <remarks>Call on the root application. Downloads are mapped at /exports; the host owns authentication and access policy.</remarks>
    public static RouteGroupBuilder MapTextControlMcp(this IEndpointRouteBuilder endpoints, string pattern = "/mcp");
}
```

### TxTextControl.McpServer.TextControlMcpWorker

```csharp
/// <summary>Dispatches worker mode when the worker pool relaunches the consuming host.</summary>
public static class TextControlMcpWorker
{
    /// <summary>Runs worker mode and returns its exit code, or null for a normal host launch.</summary>
    /// <remarks>Call before building the web host or writing anything to standard output. Required for the default self-hosted worker pool.</remarks>
    public static async Task<int?> RunIfRequestedAsync(string[] args);
}
```

### TxTextControl.McpServer.Models.DocumentContentSnapshot

```csharp
/// <summary>
/// Immutable text content extracted from one document revision.
/// </summary>
public sealed record DocumentContentSnapshot(string Text, IReadOnlyList<string> Paragraphs)
{
    /// <summary>Paragraph text plus structural formatting metadata in document order.</summary>
    public IReadOnlyList<DocumentParagraphSnapshot> ParagraphDetails { get; init; } = [];
    /// <summary>Tables read directly from the authoritative TX document in document order.</summary>
    public IReadOnlyList<DocumentTableSnapshot> Tables { get; init; } = [];
}
```

### TxTextControl.McpServer.Models.DocumentEditEngineResult

```csharp
public sealed record DocumentEditEngineResult(DocumentState State, string TargetKind, int EditsApplied, IReadOnlyList<SearchTextRange> ReplacedRanges, IReadOnlyList<int> ParagraphIndexes);
```

### TxTextControl.McpServer.Models.DocumentParagraphSnapshot

```csharp
/// <summary>Immutable structural metadata for one document paragraph.</summary>
public sealed record DocumentParagraphSnapshot(string Text, string? StyleName);
```

### TxTextControl.McpServer.Models.DocumentPresetStyleEngineResult

```csharp
/// <summary>Contains the document state and metrics produced by server-owned preset styling.</summary>
public sealed record DocumentPresetStyleEngineResult(DocumentState State, IReadOnlyDictionary<string, int> AppliedStyles, int TablesStyled, bool PageLayoutApplied, IReadOnlyList<string> Warnings);
```

### TxTextControl.McpServer.Models.DocumentSession

```csharp
public sealed class DocumentSession
{
    public string SessionId { get; init; } = default!;
    public string WorkingDirectory { get; init; } = default!;
    public string StatePath { get; init; } = default!;
    public string WorkingDocumentPath { get; init; } = default!;
    public string? LoadedTemplateName { get; set; }
    public DateTime CreatedUtc { get; init; }
    public DateTime LastAccessUtc { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentState

```csharp
public sealed class DocumentState
{
    /// <summary>
    /// Monotonically increasing durable session revision. It changes after each committed document mutation.
    /// </summary>
    public long Revision { get; set; }
    public string WorkingDocumentPath { get; set; } = string.Empty;
    public Document Document { get; set; } = new();
    public Dictionary<string, TextStyleDefinition> Styles { get; set; } = new();
    public List<OperationResult> LastOperationResults { get; set; } = [];
    /// <summary>
    /// Hash of the source bytes used by the most recent load operation. Mutations clear this value.
    /// </summary>
    public string? SourceContentHash { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentTableCellSnapshot

```csharp
/// <summary>One zero-based TX table cell.</summary>
public sealed record DocumentTableCellSnapshot(int RowIndex, int ColumnIndex, string Text, int Start, int Length);
```

### TxTextControl.McpServer.Models.DocumentTableRowSnapshot

```csharp
/// <summary>One zero-based TX table row.</summary>
public sealed record DocumentTableRowSnapshot(int RowIndex, IReadOnlyList<DocumentTableCellSnapshot> Cells);
```

### TxTextControl.McpServer.Models.DocumentTableSnapshot

```csharp
/// <summary>Immutable table metadata extracted from the live TX document.</summary>
public sealed record DocumentTableSnapshot(string Id, int RowCount, int ColumnCount, IReadOnlyList<DocumentTableRowSnapshot> Rows);
```

### TxTextControl.McpServer.Models.MergeTemplateEngineResult

```csharp
/// <summary>
/// Result of a single-pass template merge and its before/after field inspection.
/// </summary>
public sealed record MergeTemplateEngineResult(DocumentState State, IReadOnlyList<TemplateMergeFieldInfo> FieldsBefore, IReadOnlyList<TemplateMergeFieldInfo> FieldsAfter, IReadOnlyList<TemplateFormFieldInfo> FormFieldsBefore, IReadOnlyList<TemplateFormFieldInfo> FormFieldsAfter);
```

### TxTextControl.McpServer.Models.TemplateContentSnapshot

```csharp
/// <summary>
/// Template fields and repeating blocks extracted from one document revision.
/// </summary>
public sealed record TemplateContentSnapshot(IReadOnlyList<TemplateMergeFieldInfo> MergeFields, IReadOnlyList<TemplateMergeBlockInfo> MergeBlocks, IReadOnlyList<TemplateFormFieldInfo> FormFields);
```

### TxTextControl.McpServer.Models.DocumentModel.CellBorderDefinition

```csharp
public sealed class CellBorderDefinition
{
    [JsonPropertyName("width")]
    public int? Width { get; set; }

    [JsonPropertyName("colorHex")]
    public string? ColorHex { get; set; }

    [JsonPropertyName("left")]
    public CellBorderSideDefinition? Left { get; set; }

    [JsonPropertyName("top")]
    public CellBorderSideDefinition? Top { get; set; }

    [JsonPropertyName("right")]
    public CellBorderSideDefinition? Right { get; set; }

    [JsonPropertyName("bottom")]
    public CellBorderSideDefinition? Bottom { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.CellBorderSideDefinition

```csharp
public sealed class CellBorderSideDefinition
{
    [JsonPropertyName("width")]
    public int? Width { get; set; }

    [JsonPropertyName("colorHex")]
    public string? ColorHex { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.CellStyleDefinition

```csharp
public sealed class CellStyleDefinition
{
    [JsonPropertyName("backgroundColorHex")]
    public string? BackgroundColorHex { get; set; }

    [JsonPropertyName("border")]
    public CellBorderDefinition? Border { get; set; }

    [JsonPropertyName("paddingLeft")]
    public float? PaddingLeft { get; set; }

    [JsonPropertyName("paddingRight")]
    public float? PaddingRight { get; set; }

    [JsonPropertyName("paddingTop")]
    public float? PaddingTop { get; set; }

    [JsonPropertyName("paddingBottom")]
    public float? PaddingBottom { get; set; }

    [JsonPropertyName("paddingUnit")]
    public string PaddingUnit { get; set; } = "pt";

    [JsonPropertyName("horizontalAlignment")]
    public string? HorizontalAlignment { get; set; }

    [JsonPropertyName("verticalAlignment")]
    public string? VerticalAlignment { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.Document

```csharp
public sealed class Document
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("styles")]
    public List<Style> Styles { get; set; } = [];

    [JsonPropertyName("sections")]
    public List<Section> Sections { get; set; } = [];

    [JsonPropertyName("metadata")]
    public Dictionary<string, string> Metadata { get; set; } = new();
}
```

### TxTextControl.McpServer.Models.DocumentModel.DocumentBlock

```csharp
public sealed class DocumentBlock
{
    [JsonPropertyName("type")]
    [JsonRequired]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("paragraph")]
    public Paragraph? Paragraph { get; set; }

    [JsonPropertyName("table")]
    public Table? Table { get; set; }

    [JsonPropertyName("image")]
    public Image? Image { get; set; }

    [JsonPropertyName("field")]
    public Field? Field { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.Field

```csharp
public sealed class Field
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public string? Value { get; set; }

    [JsonPropertyName("properties")]
    public Dictionary<string, string> Properties { get; set; } = new();
}
```

### TxTextControl.McpServer.Models.DocumentModel.HeaderFooter

```csharp
public sealed class HeaderFooter
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "default";

    [JsonPropertyName("blocks")]
    public List<DocumentBlock> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.DocumentModel.Image

```csharp
public sealed class Image
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("altText")]
    public string? AltText { get; set; }

    [JsonPropertyName("width")]
    public float? Width { get; set; }

    [JsonPropertyName("height")]
    public float? Height { get; set; }

    [JsonPropertyName("unit")]
    public string Unit { get; set; } = "px";

    [JsonPropertyName("horizontalScaling")]
    public int? HorizontalScaling { get; set; }

    [JsonPropertyName("verticalScaling")]
    public int? VerticalScaling { get; set; }

    [JsonPropertyName("insertionMode")]
    public string? InsertionMode { get; set; }

    [JsonPropertyName("alignment")]
    public string? Alignment { get; set; }

    [JsonPropertyName("locationX")]
    public float? LocationX { get; set; }

    [JsonPropertyName("locationY")]
    public float? LocationY { get; set; }

    [JsonPropertyName("locationUnit")]
    public string? LocationUnit { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.PageLayoutDefinition

```csharp
public sealed class PageLayoutDefinition
{
    [JsonPropertyName("pageSize")]
    public string? PageSize { get; set; }

    [JsonPropertyName("orientation")]
    public string? Orientation { get; set; }

    [JsonPropertyName("pageWidth")]
    public float? PageWidth { get; set; }

    [JsonPropertyName("pageHeight")]
    public float? PageHeight { get; set; }

    [JsonPropertyName("unit")]
    public string? Unit { get; set; }

    [JsonPropertyName("marginLeft")]
    public float? MarginLeft { get; set; }

    [JsonPropertyName("marginRight")]
    public float? MarginRight { get; set; }

    [JsonPropertyName("marginTop")]
    public float? MarginTop { get; set; }

    [JsonPropertyName("marginBottom")]
    public float? MarginBottom { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.Paragraph

```csharp
public sealed class Paragraph
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string? Role { get; set; }

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("runs")]
    public List<Run> Runs { get; set; } = [];

    [JsonPropertyName("alignment")]
    public string? Alignment { get; set; }

    [JsonPropertyName("paragraphStyle")]
    public ParagraphStyleDefinition? ParagraphStyle { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.ParagraphStyleDefinition

```csharp
public sealed class ParagraphStyleDefinition
{
    [JsonPropertyName("alignment")]
    public string? Alignment { get; set; }

    [JsonPropertyName("spaceBefore")]
    public float? SpaceBefore { get; set; }

    [JsonPropertyName("spaceAfter")]
    public float? SpaceAfter { get; set; }

    [JsonPropertyName("lineSpacing")]
    public float? LineSpacing { get; set; }

    [JsonPropertyName("absoluteLineSpacing")]
    public float? AbsoluteLineSpacing { get; set; }

    [JsonPropertyName("leftIndent")]
    public float? LeftIndent { get; set; }

    [JsonPropertyName("rightIndent")]
    public float? RightIndent { get; set; }

    [JsonPropertyName("hangingIndent")]
    public float? HangingIndent { get; set; }

    [JsonPropertyName("backgroundColorHex")]
    public string? BackgroundColorHex { get; set; }

    [JsonPropertyName("keepLinesTogether")]
    public bool? KeepLinesTogether { get; set; }

    [JsonPropertyName("keepWithNext")]
    public bool? KeepWithNext { get; set; }

    [JsonPropertyName("pageBreakBefore")]
    public bool? PageBreakBefore { get; set; }

    [JsonPropertyName("widowOrphanLines")]
    public int? WidowOrphanLines { get; set; }

    [JsonPropertyName("unit")]
    public string Unit { get; set; } = "pt";
}
```

### TxTextControl.McpServer.Models.DocumentModel.Run

```csharp
public sealed class Run
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("style")]
    public TextStyleDefinition? Style { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.Section

```csharp
public sealed class Section
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("pageLayout")]
    public PageLayoutDefinition? PageLayout { get; set; }

    [JsonPropertyName("header")]
    public HeaderFooter? Header { get; set; }

    [JsonPropertyName("footer")]
    public HeaderFooter? Footer { get; set; }

    [JsonPropertyName("blocks")]
    public List<DocumentBlock> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.DocumentModel.Style

```csharp
public sealed class Style
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "paragraph";

    [JsonPropertyName("basedOn")]
    public string? BasedOn { get; set; }

    [JsonPropertyName("text")]
    public TextStyleDefinition? Text { get; set; }

    [JsonPropertyName("paragraph")]
    public ParagraphStyleDefinition? Paragraph { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.StyleRoleDefinition

```csharp
public sealed class StyleRoleDefinition
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = "Title";

    [JsonPropertyName("heading1")]
    public string Heading1 { get; set; } = "Heading";

    [JsonPropertyName("heading2")]
    public string Heading2 { get; set; } = "Heading2";

    [JsonPropertyName("body")]
    public string Body { get; set; } = "Body";
}
```

### TxTextControl.McpServer.Models.DocumentModel.Table

```csharp
public sealed class Table
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("columnWidths")]
    public List<float?> ColumnWidths { get; set; } = [];

    [JsonPropertyName("columnWidthUnit")]
    public string? ColumnWidthUnit { get; set; }

    [JsonPropertyName("rows")]
    public List<TableRow> Rows { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.DocumentModel.TableCell

```csharp
public sealed class TableCell
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("blocks")]
    public List<DocumentBlock> Blocks { get; set; } = [];

    [JsonPropertyName("cellStyle")]
    public CellStyleDefinition? CellStyle { get; set; }

    [JsonPropertyName("columnSpan")]
    public int ColumnSpan { get; set; } = 1;

    [JsonPropertyName("rowSpan")]
    public int RowSpan { get; set; } = 1;
}
```

### TxTextControl.McpServer.Models.DocumentModel.TableRow

```csharp
public sealed class TableRow
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("cells")]
    public List<TableCell> Cells { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.DocumentModel.TableStylePresetDefinition

```csharp
public sealed class TableStylePresetDefinition
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("headerRowIndex")]
    public int HeaderRowIndex { get; set; }

    [JsonPropertyName("headerStyle")]
    public TextStyleDefinition? HeaderStyle { get; set; }

    [JsonPropertyName("headerCellStyle")]
    public CellStyleDefinition? HeaderCellStyle { get; set; }

    [JsonPropertyName("bodyStyle")]
    public TextStyleDefinition? BodyStyle { get; set; }

    [JsonPropertyName("bodyCellStyle")]
    public CellStyleDefinition? BodyCellStyle { get; set; }

    [JsonPropertyName("alternatingRowStyle")]
    public TextStyleDefinition? AlternatingRowStyle { get; set; }

    [JsonPropertyName("alternatingRowCellStyle")]
    public CellStyleDefinition? AlternatingRowCellStyle { get; set; }
}
```

### TxTextControl.McpServer.Models.DocumentModel.TextStyleDefinition

```csharp
public sealed class TextStyleDefinition
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("fontName")]
    public string? FontName { get; set; }

    [JsonPropertyName("fontSize")]
    public float? FontSize { get; set; }

    [JsonPropertyName("fontSizeUnit")]
    public string FontSizeUnit { get; set; } = "pt";

    [JsonPropertyName("bold")]
    public bool? Bold { get; set; }

    [JsonPropertyName("italic")]
    public bool? Italic { get; set; }

    [JsonPropertyName("underline")]
    public bool? Underline { get; set; }

    [JsonPropertyName("strikeout")]
    public bool? Strikeout { get; set; }

    [JsonPropertyName("colorHex")]
    public string? ColorHex { get; set; }

    [JsonPropertyName("backgroundColorHex")]
    public string? BackgroundColorHex { get; set; }

    [JsonPropertyName("characterSpacing")]
    public float? CharacterSpacing { get; set; }

    [JsonPropertyName("characterScaling")]
    public int? CharacterScaling { get; set; }

    [JsonPropertyName("baseline")]
    public float? Baseline { get; set; }

    [JsonPropertyName("capitals")]
    public string? Capitals { get; set; }

    [JsonPropertyName("paragraph")]
    public ParagraphStyleDefinition? Paragraph { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.AddTableRowsRequest

```csharp
/// <summary>Adds one or more rows to a table selected by id or document order.</summary>
public sealed class AddTableRowsRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    /// <summary>Authoritative table id returned by get_document_tables.</summary>
    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    /// <summary>One-based table number in document order, for example 2 for the second table.</summary>
    [JsonPropertyName("tableNumber")]
    public int? TableNumber { get; set; }

    /// <summary>Number of empty rows to add when rows is omitted.</summary>
    [JsonPropertyName("count")]
    public int? Count { get; set; }

    /// <summary>Optional row data. Each inner array is one new row.</summary>
    [JsonPropertyName("rows")]
    public List<List<string>> Rows { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Requests.ApplyDocumentPresetStylesRequest

```csharp
/// <summary>Identifies an existing document session whose configured presets should be applied.</summary>
public sealed class ApplyDocumentPresetStylesRequest
{
    /// <summary>Gets or sets the existing MCP document session identifier.</summary>
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Requests.ApplyDocumentStyleRequest

```csharp
public sealed class ApplyDocumentStyleRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("styleName"), JsonRequired]
    public string StyleName { get; set; } = string.Empty;

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("endParagraphIndex")]
    public int? EndParagraphIndex { get; set; }

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("allMatches")]
    public bool AllMatches { get; set; }

    [JsonPropertyName("allParagraphs")]
    public bool AllParagraphs { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.ApplyOperationsRequest

```csharp
public sealed class ApplyOperationsRequest
{
    [JsonPropertyName("sessionId")]
    public string? SessionId { get; set; }

    [JsonPropertyName("createIfMissing")]
    public bool CreateIfMissing { get; set; } = true;

    [JsonPropertyName("operations"), JsonRequired]
    public List<DocumentOperation> Operations { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Requests.ClassifyDocumentRequest

```csharp
/// <summary>Classifies the active document into a broad business category.</summary>
public sealed class ClassifyDocumentRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Requests.ClearFieldsRequest

```csharp
/// <summary>Removes field markup from a document session.</summary>
public sealed class ClearFieldsRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("keepText")]
    public bool KeepText { get; set; } = true;
}
```

### TxTextControl.McpServer.Models.Requests.ConvertDocumentRequest

```csharp
public sealed class ConvertDocumentRequest
{
    [JsonPropertyName("sessionId")]
    public string? SessionId { get; set; }

    [JsonPropertyName("data")]
    public string? Data { get; set; }

    [JsonPropertyName("sourceFormat")]
    public string? SourceFormat { get; set; }

    [JsonPropertyName("outputFormat"), JsonRequired]
    public string OutputFormat { get; set; } = "pdf";

    [JsonPropertyName("fileName")]
    public string? FileName { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.CreateDocumentExportRequest

```csharp
public sealed class CreateDocumentExportRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("format"), JsonRequired]
    public string Format { get; set; } = "pdf";

    [JsonPropertyName("fileName")]
    public string? FileName { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.CreateDocumentFromMarkdownRequest

```csharp
/// <summary>Contains semantic Markdown for creating a preset-styled document.</summary>
public sealed class CreateDocumentFromMarkdownRequest
{
    /// <summary>Gets or sets the Markdown document content.</summary>
    [JsonPropertyName("markdown"), JsonRequired]
    public string Markdown { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Requests.CreateDocumentFromRecipeRequest

```csharp
public sealed class CreateDocumentFromRecipeRequest
{
    [JsonPropertyName("recipeName"), JsonRequired]
    public string RecipeName { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Requests.CreateMergeBlockRequest

```csharp
/// <summary>Wraps an existing table row, paragraph range, or character range as a repeating merge block.</summary>
public sealed class CreateMergeBlockRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("blockName"), JsonRequired]
    public string BlockName { get; set; } = string.Empty;

    [JsonPropertyName("blockId")]
    public int? BlockId { get; set; }

    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    [JsonPropertyName("rowIndex")]
    public int? RowIndex { get; set; }

    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    [JsonPropertyName("expectedText")]
    public string? ExpectedText { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("endParagraphIndex")]
    public int? EndParagraphIndex { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.CreateStylesFromParagraphsRequest

```csharp
public sealed class CreateStylesFromParagraphsRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("styleNamePrefix")]
    public string StyleNamePrefix { get; set; } = "Generated Style";

    [JsonPropertyName("minimumOccurrences")]
    public int MinimumOccurrences { get; set; } = 1;

    [JsonPropertyName("includeStyledParagraphs")]
    public bool IncludeStyledParagraphs { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.DeleteDocumentStyleRequest

```csharp
public sealed class DeleteDocumentStyleRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("styleName"), JsonRequired]
    public string StyleName { get; set; } = string.Empty;

    [JsonPropertyName("replacementStyleName")]
    public string? ReplacementStyleName { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.DocumentOperation

```csharp
public sealed class DocumentOperation
{
    [JsonPropertyName("type"), JsonRequired]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("style")]
    public TextStyleDefinition? Style { get; set; }

    [JsonPropertyName("cellStyle")]
    public CellStyleDefinition? CellStyle { get; set; }

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("newStyleName")]
    public string? NewStyleName { get; set; }

    [JsonPropertyName("replacementStyleName")]
    public string? ReplacementStyleName { get; set; }

    [JsonPropertyName("basedOn")]
    public string? BasedOn { get; set; }

    [JsonPropertyName("followingStyle")]
    public string? FollowingStyle { get; set; }

    [JsonPropertyName("styleNamePrefix")]
    public string? StyleNamePrefix { get; set; }

    [JsonPropertyName("minimumOccurrences")]
    public int? MinimumOccurrences { get; set; }

    [JsonPropertyName("includeStyledParagraphs")]
    public bool IncludeStyledParagraphs { get; set; }

    [JsonPropertyName("tableStyleName")]
    public string? TableStyleName { get; set; }

    [JsonPropertyName("paragraph")]
    public ParagraphStyleDefinition? Paragraph { get; set; }

    [JsonPropertyName("pageLayout")]
    public PageLayoutDefinition? PageLayout { get; set; }

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("fieldId")]
    public string? FieldId { get; set; }

    [JsonPropertyName("fieldName")]
    public string? FieldName { get; set; }

    [JsonPropertyName("blockName")]
    public string? BlockName { get; set; }

    [JsonPropertyName("blockId")]
    public int? BlockId { get; set; }

    [JsonPropertyName("fieldText")]
    public string? FieldText { get; set; }

    [JsonPropertyName("formFieldType")]
    public string? FormFieldType { get; set; }

    [JsonPropertyName("items")]
    public List<string> Items { get; set; } = [];

    [JsonPropertyName("checked")]
    public bool? Checked { get; set; }

    [JsonPropertyName("editable")]
    public bool? Editable { get; set; }

    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    [JsonPropertyName("emptyWidth")]
    public int? EmptyWidth { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("dateFormat")]
    public string? DateFormat { get; set; }

    [JsonPropertyName("typeName")]
    public string? TypeName { get; set; }

    [JsonPropertyName("parameters")]
    public List<string> Parameters { get; set; } = [];

    [JsonPropertyName("keepText")]
    public bool KeepText { get; set; } = true;

    [JsonPropertyName("placement")]
    public string? Placement { get; set; }

    [JsonPropertyName("headerFooterType")]
    public string? HeaderFooterType { get; set; }

    [JsonPropertyName("includePageNumber")]
    public bool IncludePageNumber { get; set; }

    [JsonPropertyName("sectionIndex")]
    public int? SectionIndex { get; set; }

    [JsonPropertyName("breakKind")]
    public string? BreakKind { get; set; }

    [JsonPropertyName("pageSize")]
    public string? PageSize { get; set; }

    [JsonPropertyName("orientation")]
    public string? Orientation { get; set; }

    [JsonPropertyName("pageWidth")]
    public float? PageWidth { get; set; }

    [JsonPropertyName("pageHeight")]
    public float? PageHeight { get; set; }

    [JsonPropertyName("marginLeft")]
    public float? MarginLeft { get; set; }

    [JsonPropertyName("marginRight")]
    public float? MarginRight { get; set; }

    [JsonPropertyName("marginTop")]
    public float? MarginTop { get; set; }

    [JsonPropertyName("marginBottom")]
    public float? MarginBottom { get; set; }

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("replacementText")]
    public string? ReplacementText { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }

    [JsonPropertyName("maxOccurrences")]
    public int? MaxOccurrences { get; set; }

    [JsonPropertyName("runs")]
    public List<Run> Runs { get; set; } = [];

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("endParagraphIndex")]
    public int? EndParagraphIndex { get; set; }

    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    [JsonPropertyName("expectedText")]
    public string? ExpectedText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("replaceAll")]
    public bool ReplaceAll { get; set; }

    [JsonPropertyName("allParagraphs")]
    public bool AllParagraphs { get; set; }

    [JsonPropertyName("rowIndex")]
    public int? RowIndex { get; set; }

    [JsonPropertyName("columnIndex")]
    public int? ColumnIndex { get; set; }

    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    [JsonPropertyName("tableNumber")]
    public int? TableNumber { get; set; }

    [JsonPropertyName("tableScope")]
    public string? TableScope { get; set; }

    [JsonPropertyName("selectionLength")]
    public int? SelectionLength { get; set; }

    [JsonPropertyName("rows")]
    public List<List<string>> Rows { get; set; } = [];

    [JsonPropertyName("columnWidths")]
    public List<float?> ColumnWidths { get; set; } = [];

    [JsonPropertyName("columnWidthUnit")]
    public string? ColumnWidthUnit { get; set; }

    [JsonPropertyName("imagePath")]
    public string? ImagePath { get; set; }

    [JsonPropertyName("imageBase64")]
    public string? ImageBase64 { get; set; }

    [JsonPropertyName("imageFormat")]
    public string? ImageFormat { get; set; }

    [JsonPropertyName("filterIndex")]
    public int? FilterIndex { get; set; }

    [JsonPropertyName("imageName")]
    public string? ImageName { get; set; }

    [JsonPropertyName("target")]
    public string? Target { get; set; }

    [JsonPropertyName("altText")]
    public string? AltText { get; set; }

    [JsonPropertyName("width")]
    public float? Width { get; set; }

    [JsonPropertyName("height")]
    public float? Height { get; set; }

    [JsonPropertyName("unit")]
    public string? Unit { get; set; }

    [JsonPropertyName("horizontalScaling")]
    public int? HorizontalScaling { get; set; }

    [JsonPropertyName("verticalScaling")]
    public int? VerticalScaling { get; set; }

    [JsonPropertyName("insertionMode")]
    public string? InsertionMode { get; set; }

    [JsonPropertyName("alignment")]
    public string? Alignment { get; set; }

    [JsonPropertyName("textPosition")]
    public int? TextPosition { get; set; }

    [JsonPropertyName("pageNumber")]
    public int? PageNumber { get; set; }

    [JsonPropertyName("locationX")]
    public float? LocationX { get; set; }

    [JsonPropertyName("locationY")]
    public float? LocationY { get; set; }

    [JsonPropertyName("locationUnit")]
    public string? LocationUnit { get; set; }

    [JsonPropertyName("sizeable")]
    public bool? Sizeable { get; set; }

    [JsonPropertyName("moveable")]
    public bool? Moveable { get; set; }

    [JsonPropertyName("saveMode")]
    public string? SaveMode { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.EditDocumentRequest

```csharp
public sealed class EditDocumentRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("replacementText"), JsonRequired]
    public string ReplacementText { get; set; } = string.Empty;

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("endParagraphIndex")]
    public int? EndParagraphIndex { get; set; }

    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    /// <summary>
    /// Optional stale-range guard for start/length edits. The operation is rejected unless the
    /// current text in the selected range is exactly this value.
    /// </summary>
    [JsonPropertyName("expectedText")]
    public string? ExpectedText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("replaceAll")]
    public bool ReplaceAll { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.FormatParagraphRequest

```csharp
/// <summary>Focused request for applying paragraph-level formatting or a named style.</summary>
public sealed class FormatParagraphRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("endParagraphIndex")]
    public int? EndParagraphIndex { get; set; }

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("allMatches")]
    public bool AllMatches { get; set; }

    [JsonPropertyName("allParagraphs")]
    public bool AllParagraphs { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }

    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    [JsonPropertyName("alignment")]
    public string? Alignment { get; set; }

    [JsonPropertyName("spaceBefore")]
    public float? SpaceBefore { get; set; }

    [JsonPropertyName("spaceAfter")]
    public float? SpaceAfter { get; set; }

    [JsonPropertyName("lineSpacing")]
    public float? LineSpacing { get; set; }

    [JsonPropertyName("unit")]
    public string Unit { get; set; } = "pt";
}
```

### TxTextControl.McpServer.Models.Requests.FormatTableRequest

```csharp
/// <summary>Focused request for formatting table cells resolved by semantic scope or editor selection.</summary>
public sealed class FormatTableRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("scope"), JsonRequired]
    public string Scope { get; set; } = string.Empty;

    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    /// <summary>One-based table number in document order.</summary>
    [JsonPropertyName("tableNumber")]
    public int? TableNumber { get; set; }

    [JsonPropertyName("rowIndex")]
    public int? RowIndex { get; set; }

    [JsonPropertyName("columnIndex")]
    public int? ColumnIndex { get; set; }

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("selectionLength")]
    public int? SelectionLength { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("bold")]
    public bool? Bold { get; set; }

    [JsonPropertyName("italic")]
    public bool? Italic { get; set; }

    [JsonPropertyName("underline")]
    public bool? Underline { get; set; }

    [JsonPropertyName("textColorHex")]
    public string? TextColorHex { get; set; }

    [JsonPropertyName("fontName")]
    public string? FontName { get; set; }

    [JsonPropertyName("fontSize")]
    public float? FontSize { get; set; }

    [JsonPropertyName("fontSizeUnit")]
    public string FontSizeUnit { get; set; } = "pt";

    [JsonPropertyName("backgroundColorHex")]
    public string? BackgroundColorHex { get; set; }

    [JsonPropertyName("borderWidth")]
    public int? BorderWidth { get; set; }

    [JsonPropertyName("borderColorHex")]
    public string? BorderColorHex { get; set; }

    [JsonPropertyName("paddingLeft")]
    public float? PaddingLeft { get; set; }

    [JsonPropertyName("paddingRight")]
    public float? PaddingRight { get; set; }

    [JsonPropertyName("paddingTop")]
    public float? PaddingTop { get; set; }

    [JsonPropertyName("paddingBottom")]
    public float? PaddingBottom { get; set; }

    [JsonPropertyName("paddingUnit")]
    public string PaddingUnit { get; set; } = "pt";

    [JsonPropertyName("horizontalAlignment")]
    public string? HorizontalAlignment { get; set; }

    [JsonPropertyName("verticalAlignment")]
    public string? VerticalAlignment { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.FormatTextOccurrencesRequest

```csharp
/// <summary>Formats text found by TX Text Control without exposing character offsets to the caller.</summary>
public sealed class FormatTextOccurrencesRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("matchText"), JsonRequired]
    public string MatchText { get; set; } = string.Empty;

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }

    [JsonPropertyName("maxOccurrences")]
    public int? MaxOccurrences { get; set; }

    [JsonPropertyName("bold")]
    public bool? Bold { get; set; }

    [JsonPropertyName("italic")]
    public bool? Italic { get; set; }

    [JsonPropertyName("underline")]
    public bool? Underline { get; set; }

    [JsonPropertyName("colorHex")]
    public string? ColorHex { get; set; }

    [JsonPropertyName("fontName")]
    public string? FontName { get; set; }

    [JsonPropertyName("fontSize")]
    public float? FontSize { get; set; }

    [JsonPropertyName("fontSizeUnit")]
    public string FontSizeUnit { get; set; } = "pt";
}
```

### TxTextControl.McpServer.Models.Requests.FormatTextRequest

```csharp
public sealed class FormatTextRequest
{
    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("bold")]
    public bool? Bold { get; set; }

    [JsonPropertyName("italic")]
    public bool? Italic { get; set; }

    [JsonPropertyName("underline")]
    public bool? Underline { get; set; }

    [JsonPropertyName("color_hex")]
    public string? ColorHex { get; set; }

    [JsonPropertyName("font_name")]
    public string? FontName { get; set; }

    [JsonPropertyName("font_size")]
    public float? FontSize { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.GetAsBase64Request

```csharp
public sealed class GetAsBase64Request
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("format")]
    public string Format { get; set; } = "docx";
}
```

### TxTextControl.McpServer.Models.Requests.InsertFormFieldRequest

```csharp
/// <summary>Inserts a real TX Text Control form field at a deterministic body or table location.</summary>
public sealed class InsertFormFieldRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("fieldName"), JsonRequired]
    public string FieldName { get; set; } = string.Empty;

    [JsonPropertyName("formFieldType"), JsonRequired]
    public string FormFieldType { get; set; } = "text";

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("checked")]
    public bool? Checked { get; set; }

    [JsonPropertyName("items")]
    public List<string> Items { get; set; } = [];

    [JsonPropertyName("editable")]
    public bool? Editable { get; set; }

    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    [JsonPropertyName("emptyWidth")]
    public int? EmptyWidth { get; set; }

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("replaceAll")]
    public bool ReplaceAll { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }

    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    [JsonPropertyName("expectedText")]
    public string? ExpectedText { get; set; }

    [JsonPropertyName("textPosition")]
    public int? TextPosition { get; set; }

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    [JsonPropertyName("rowIndex")]
    public int? RowIndex { get; set; }

    [JsonPropertyName("columnIndex")]
    public int? ColumnIndex { get; set; }

    [JsonPropertyName("headerFooterType")]
    public string? HeaderFooterType { get; set; }

    [JsonPropertyName("sectionIndex")]
    public int? SectionIndex { get; set; }

    [JsonPropertyName("placement")]
    public string? Placement { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.InsertMergeFieldRequest

```csharp
/// <summary>Inserts real MERGEFIELD ApplicationFields at deterministic document locations.</summary>
public sealed class InsertMergeFieldRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("fieldName"), JsonRequired]
    public string FieldName { get; set; } = string.Empty;

    [JsonPropertyName("fieldText")]
    public string? FieldText { get; set; }

    [JsonPropertyName("parameters")]
    public List<string> Parameters { get; set; } = [];

    [JsonPropertyName("matchText")]
    public string? MatchText { get; set; }

    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }

    [JsonPropertyName("nearTextPosition")]
    public int? NearTextPosition { get; set; }

    [JsonPropertyName("replaceAll")]
    public bool ReplaceAll { get; set; }

    [JsonPropertyName("matchCase")]
    public bool MatchCase { get; set; }

    [JsonPropertyName("wholeWord")]
    public bool WholeWord { get; set; }

    [JsonPropertyName("start")]
    public int? Start { get; set; }

    [JsonPropertyName("length")]
    public int? Length { get; set; }

    [JsonPropertyName("expectedText")]
    public string? ExpectedText { get; set; }

    [JsonPropertyName("textPosition")]
    public int? TextPosition { get; set; }

    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    [JsonPropertyName("rowIndex")]
    public int? RowIndex { get; set; }

    [JsonPropertyName("columnIndex")]
    public int? ColumnIndex { get; set; }

    [JsonPropertyName("headerFooterType")]
    public string? HeaderFooterType { get; set; }

    [JsonPropertyName("sectionIndex")]
    public int? SectionIndex { get; set; }

    [JsonPropertyName("placement")]
    public string? Placement { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.InsertTableRequest

```csharp
/// <summary>Compact request for inserting a table into an existing document session.</summary>
public sealed class InsertTableRequest
{
    /// <summary>Existing document session to update.</summary>
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    /// <summary>Table data represented as rows containing cell text.</summary>
    [JsonPropertyName("rows"), JsonRequired]
    public List<List<string>> Rows { get; set; } = [];

    /// <summary>Optional TX Text Control table identifier.</summary>
    [JsonPropertyName("tableId")]
    public string? TableId { get; set; }

    /// <summary>Optional configured table style name.</summary>
    [JsonPropertyName("styleName")]
    public string? StyleName { get; set; }

    /// <summary>Optional width for each table column.</summary>
    [JsonPropertyName("columnWidths")]
    public List<float?> ColumnWidths { get; set; } = [];

    /// <summary>Unit used by <see cref = "ColumnWidths"/>.</summary>
    [JsonPropertyName("columnWidthUnit")]
    public string? ColumnWidthUnit { get; set; }

    /// <summary>Zero-based paragraph index used for before or after placement.</summary>
    [JsonPropertyName("paragraphIndex")]
    public int? ParagraphIndex { get; set; }

    /// <summary>Placement mode: end, before, or after.</summary>
    [JsonPropertyName("placement")]
    public string? Placement { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.InspectDocumentRequest

```csharp
public sealed class InspectDocumentRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("query")]
    public string? Query { get; set; }

    [JsonPropertyName("startParagraphIndex")]
    public int? StartParagraphIndex { get; set; }

    [JsonPropertyName("paragraphCount")]
    public int? ParagraphCount { get; set; }

    [JsonPropertyName("contextParagraphs")]
    public int ContextParagraphs { get; set; } = 1;

    [JsonPropertyName("maxCharacters")]
    public int MaxCharacters { get; set; } = 8000;
}
```

### TxTextControl.McpServer.Models.Requests.InspectDocumentSectionRequest

```csharp
/// <summary>Resolves a document section from its visible heading.</summary>
public sealed class InspectDocumentSectionRequest
{
    /// <summary>Existing document session.</summary>
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    /// <summary>Visible section heading, with numbering optional.</summary>
    [JsonPropertyName("heading"), JsonRequired]
    public string Heading { get; set; } = string.Empty;

    /// <summary>Zero-based occurrence when the same heading appears more than once.</summary>
    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.LoadFromBase64Request

```csharp
public sealed class LoadFromBase64Request
{
    [JsonPropertyName("data"), JsonRequired]
    public string Data { get; set; } = string.Empty;

    [JsonPropertyName("sourceFormat")]
    public string? SourceFormat { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.MergeTemplateRequest

```csharp
public sealed class MergeTemplateRequest
{
    [JsonPropertyName("sessionId")]
    public string? SessionId { get; set; }

    [JsonPropertyName("jsonData")]
    public string? JsonData { get; set; }

    [JsonPropertyName("data")]
    public JsonElement? Data { get; set; }

    [JsonPropertyName("append")]
    public bool Append { get; set; }

    [JsonPropertyName("removeEmptyFields")]
    public bool RemoveEmptyFields { get; set; } = true;

    [JsonPropertyName("removeEmptyBlocks")]
    public bool RemoveEmptyBlocks { get; set; } = true;

    [JsonPropertyName("removeEmptyImages")]
    public bool RemoveEmptyImages { get; set; } = true;

    [JsonPropertyName("removeEmptyLines")]
    public bool RemoveEmptyLines { get; set; } = true;

    [JsonPropertyName("removeTrailingWhitespace")]
    public bool RemoveTrailingWhitespace { get; set; } = true;

    [JsonPropertyName("formFieldMergeType")]
    public string? FormFieldMergeType { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.RenameDocumentStyleRequest

```csharp
public sealed class RenameDocumentStyleRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("styleName"), JsonRequired]
    public string StyleName { get; set; } = string.Empty;

    [JsonPropertyName("newStyleName"), JsonRequired]
    public string NewStyleName { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Requests.RenderDocumentModelRequest

```csharp
public sealed class RenderDocumentModelRequest
{
    [JsonPropertyName("sessionId")]
    public string? SessionId { get; set; }

    [JsonPropertyName("createIfMissing")]
    public bool CreateIfMissing { get; set; } = true;

    [JsonPropertyName("document"), JsonRequired]
    public Document? Document { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.ReplaceDocumentSectionRequest

```csharp
/// <summary>Replaces the body of a previously inspected document section.</summary>
public sealed class ReplaceDocumentSectionRequest
{
    /// <summary>Existing document session.</summary>
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    /// <summary>Visible section heading returned by inspect_document_section.</summary>
    [JsonPropertyName("heading"), JsonRequired]
    public string Heading { get; set; } = string.Empty;

    /// <summary>Content hash returned by inspect_document_section.</summary>
    [JsonPropertyName("expectedContentHash"), JsonRequired]
    public string ExpectedContentHash { get; set; } = string.Empty;

    /// <summary>New section body. The heading itself is preserved.</summary>
    [JsonPropertyName("replacementText"), JsonRequired]
    public string ReplacementText { get; set; } = string.Empty;

    /// <summary>Zero-based occurrence when the same heading appears more than once.</summary>
    [JsonPropertyName("occurrenceIndex")]
    public int? OccurrenceIndex { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.SetDocumentStyleRequest

```csharp
public sealed class SetDocumentStyleRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("styleName"), JsonRequired]
    public string StyleName { get; set; } = string.Empty;

    [JsonPropertyName("basedOn")]
    public string? BasedOn { get; set; }

    [JsonPropertyName("followingStyle")]
    public string? FollowingStyle { get; set; }

    [JsonPropertyName("text")]
    public TextStyleDefinition? Text { get; set; }

    [JsonPropertyName("paragraph")]
    public ParagraphStyleDefinition? Paragraph { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.UpdateFormFieldRequest

```csharp
/// <summary>Updates existing real TX Text Control form fields by name.</summary>
public sealed class UpdateFormFieldRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("fieldName"), JsonRequired]
    public string FieldName { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("checked")]
    public bool? Checked { get; set; }

    [JsonPropertyName("items")]
    public List<string> Items { get; set; } = [];

    [JsonPropertyName("editable")]
    public bool? Editable { get; set; }

    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }
}
```

### TxTextControl.McpServer.Models.Requests.UpdateMergeFieldRequest

```csharp
/// <summary>Updates existing real MERGEFIELD ApplicationFields by name.</summary>
public sealed class UpdateMergeFieldRequest
{
    [JsonPropertyName("sessionId"), JsonRequired]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("fieldName"), JsonRequired]
    public string FieldName { get; set; } = string.Empty;

    [JsonPropertyName("fieldText")]
    public string? FieldText { get; set; }

    [JsonPropertyName("parameters")]
    public List<string> Parameters { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.ApplyDocumentPresetStylesResponse

```csharp
/// <summary>Reports the preset styles applied to an existing document.</summary>
public sealed class ApplyDocumentPresetStylesResponse
{
    /// <summary>Gets or sets the unchanged MCP document session identifier.</summary>
    public string SessionId { get; set; } = string.Empty;
    /// <summary>Gets or sets the number of paragraphs styled.</summary>
    public int ParagraphsStyled { get; set; }
    /// <summary>Gets or sets the paragraph count grouped by configured style name.</summary>
    public IReadOnlyDictionary<string, int> AppliedStyles { get; set; } = new Dictionary<string, int>();
    /// <summary>Gets or sets the number of imported tables styled with the default table preset.</summary>
    public int TablesStyled { get; set; }
    /// <summary>Gets or sets whether the configured default page layout was applied.</summary>
    public bool PageLayoutApplied { get; set; }
    /// <summary>Gets or sets non-fatal configuration warnings.</summary>
    public List<string> Warnings { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.ApplyOperationsResponse

```csharp
public sealed class ApplyOperationsResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<OperationResult> Results { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.AuthoringGuideResponse

```csharp
public sealed class AuthoringGuideResponse
{
    [JsonPropertyName("summary")]
    public string Summary { get; set; } = string.Empty;

    [JsonPropertyName("recommendedWorkflow")]
    public List<string> RecommendedWorkflow { get; set; } = [];

    [JsonPropertyName("toolMap")]
    public AuthoringToolMap ToolMap { get; set; } = new();

    [JsonPropertyName("documentModelContract")]
    public DocumentModelContractResponse DocumentModelContract { get; set; } = new();

    [JsonPropertyName("operationSchemas")]
    public IReadOnlyList<DocumentOperationDescriptor> OperationSchemas { get; set; } = [];

    [JsonPropertyName("styleRoles")]
    public StyleRoleDefinition StyleRoles { get; set; } = new();

    [JsonPropertyName("defaultParagraphStyleName")]
    public string DefaultParagraphStyleName { get; set; } = "Body";

    [JsonPropertyName("defaultPageLayout")]
    public PageLayoutDefinition? DefaultPageLayout { get; set; }

    [JsonPropertyName("stylePresets")]
    public List<TextStyleDefinition> StylePresets { get; set; } = [];

    [JsonPropertyName("tableStylePresets")]
    public List<TableStylePresetDefinition> TableStylePresets { get; set; } = [];

    [JsonPropertyName("stylePolicy")]
    public StylePolicyResponse StylePolicy { get; set; } = new();

    [JsonPropertyName("sessionPolicy")]
    public SessionPolicyResponse SessionPolicy { get; set; } = new();

    [JsonPropertyName("valueSets")]
    public Dictionary<string, IReadOnlyList<string>> ValueSets { get; set; } = new();

    [JsonPropertyName("recipes")]
    public List<AuthoringRecipe> Recipes { get; set; } = [];

    [JsonPropertyName("bestPractices")]
    public List<string> BestPractices { get; set; } = [];

    [JsonPropertyName("troubleshooting")]
    public List<string> Troubleshooting { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.AuthoringRecipe

```csharp
public sealed class AuthoringRecipe
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("goal")]
    public string Goal { get; set; } = string.Empty;

    [JsonPropertyName("preferredTool")]
    public string PreferredTool { get; set; } = string.Empty;

    [JsonPropertyName("toolSequence")]
    public List<string> ToolSequence { get; set; } = [];

    [JsonPropertyName("exampleRequest")]
    public Dictionary<string, object?> ExampleRequest { get; set; } = new();

    [JsonPropertyName("followUp")]
    public List<string> FollowUp { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.AuthoringToolMap

```csharp
public sealed class AuthoringToolMap
{
    [JsonPropertyName("discover")]
    public string Discover { get; set; } = "get_authoring_guide";

    [JsonPropertyName("listRecipes")]
    public string ListRecipes { get; set; } = "list_document_recipes";

    [JsonPropertyName("createFromRecipe")]
    public string CreateFromRecipe { get; set; } = "create_document_from_recipe";

    [JsonPropertyName("createModelFirst")]
    public string CreateModelFirst { get; set; } = "create_document";

    [JsonPropertyName("createMarkdown")]
    public string CreateMarkdown { get; set; } = "create_document_from_markdown";

    [JsonPropertyName("inspectPrimary")]
    public string InspectPrimary { get; set; } = "inspect_document";

    [JsonPropertyName("editPrimary")]
    public string EditPrimary { get; set; } = "edit_document";

    [JsonPropertyName("inspectSection")]
    public string InspectSection { get; set; } = "inspect_document_section";

    [JsonPropertyName("replaceSection")]
    public string ReplaceSection { get; set; } = "replace_document_section";

    [JsonPropertyName("convert")]
    public string Convert { get; set; } = "convert_document";

    [JsonPropertyName("editOperationFirst")]
    public string EditOperationFirst { get; set; } = "apply_operations";

    [JsonPropertyName("formatParagraph")]
    public string FormatParagraph { get; set; } = "format_paragraph";

    [JsonPropertyName("formatTable")]
    public string FormatTable { get; set; } = "format_table";

    [JsonPropertyName("addTableRows")]
    public string AddTableRows { get; set; } = "add_table_rows";

    [JsonPropertyName("formatTextOccurrences")]
    public string FormatTextOccurrences { get; set; } = "format_text_occurrences";

    [JsonPropertyName("export")]
    public string Export { get; set; } = "create_document_export";

    [JsonPropertyName("loadExisting")]
    public string LoadExisting { get; set; } = "load_document";

    [JsonPropertyName("styleImported")]
    public string StyleImported { get; set; } = "apply_document_preset_styles";

    [JsonPropertyName("mergeTemplate")]
    public string MergeTemplate { get; set; } = "merge_template";

    [JsonPropertyName("inspect")]
    public List<string> Inspect { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.CapabilityPackResponse

```csharp
public sealed class CapabilityPackResponse
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool Enabled { get; set; }
    public List<string> OperationTypes { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.CreateDocumentFromMarkdownResponse

```csharp
/// <summary>Reports a document created and styled from semantic Markdown.</summary>
public sealed class CreateDocumentFromMarkdownResponse
{
    /// <summary>Gets or sets the new MCP document session identifier.</summary>
    public string SessionId { get; set; } = string.Empty;
    /// <summary>Gets or sets the number of paragraphs styled.</summary>
    public int ParagraphsStyled { get; set; }
    /// <summary>Gets or sets the paragraph count grouped by configured style name.</summary>
    public IReadOnlyDictionary<string, int> AppliedStyles { get; set; } = new Dictionary<string, int>();
    /// <summary>Gets or sets the number of native tables styled with the default table preset.</summary>
    public int TablesStyled { get; set; }
    /// <summary>Gets or sets whether the configured default page layout was applied.</summary>
    public bool PageLayoutApplied { get; set; }
    /// <summary>Gets or sets non-fatal import or configuration warnings.</summary>
    public List<string> Warnings { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentAutomationCapability

```csharp
public sealed class DocumentAutomationCapability
{
    public string Type { get; set; } = string.Empty;
    public string CapabilityPack { get; set; } = string.Empty;
    public bool Enabled { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.DocumentBase64Response

```csharp
public sealed class DocumentBase64Response
{
    public string SessionId { get; set; } = string.Empty;
    public string Format { get; set; } = "docx";
    public string Base64Document { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.DocumentBlockInspection

```csharp
public sealed class DocumentBlockInspection
{
    public int BlockIndex { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? Id { get; set; }
    public string? StyleName { get; set; }
    public string? TextPreview { get; set; }
    public string? TableId { get; set; }
    public int? RowCount { get; set; }
    public int? ColumnCount { get; set; }
    public string? FieldName { get; set; }
    public string? ImageAltText { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.DocumentCategoryResponse

```csharp
public sealed class DocumentCategoryResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string Category { get; set; } = "General";
    public double Confidence { get; set; }
    public List<string> Signals { get; set; } = [];
    public List<DocumentSuggestedAction> SuggestedActions { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentEditResponse

```csharp
public sealed class DocumentEditResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string TargetKind { get; set; } = string.Empty;
    public bool Changed { get; set; }
    public int EditsApplied { get; set; }
    public long Revision { get; set; }
    public IReadOnlyList<SearchTextRange> ReplacedRanges { get; set; } = [];
    public IReadOnlyList<int> ParagraphIndexes { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentExportFile

```csharp
public sealed class DocumentExportFile
{
    public string Path { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/octet-stream";
}
```

### TxTextControl.McpServer.Models.Responses.DocumentExportResponse

```csharp
public sealed class DocumentExportResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string ExportId { get; set; } = string.Empty;
    public string Format { get; set; } = "pdf";
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/octet-stream";
    public long ByteCount { get; set; }
    public string DownloadUri { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.DocumentFieldsResponse

```csharp
public sealed class DocumentFieldsResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<FieldInspection> Fields { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentHeadersFootersResponse

```csharp
public sealed class DocumentHeadersFootersResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<HeaderFooterLocationInspection> HeadersFooters { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentInspectionResponse

```csharp
public sealed class DocumentInspectionResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int TotalParagraphs { get; set; }
    public string? Query { get; set; }
    public int MatchCount { get; set; }
    public IReadOnlyList<int> MatchParagraphIndexes { get; set; } = [];
    public IReadOnlyList<IndexedParagraphResponse> Paragraphs { get; set; } = [];
    public int ReturnedCharacters { get; set; }
    public bool Truncated { get; set; }
    public int? NextParagraphIndex { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.DocumentModelContractResponse

```csharp
public sealed class DocumentModelContractResponse
{
    [JsonPropertyName("primaryTool")]
    public string PrimaryTool { get; set; } = "create_document";

    [JsonPropertyName("fallbackTool")]
    public string FallbackTool { get; set; } = "apply_operations";

    [JsonPropertyName("supportedBlockTypes")]
    public List<string> SupportedBlockTypes { get; set; } = [];

    [JsonPropertyName("renderableFieldTypes")]
    public List<string> RenderableFieldTypes { get; set; } = [];

    [JsonPropertyName("minimalDocumentShape")]
    public Dictionary<string, object?> MinimalDocumentShape { get; set; } = new();

    [JsonPropertyName("notes")]
    public List<string> Notes { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentModelResponse

```csharp
public sealed class DocumentModelResponse
{
    public string SessionId { get; set; } = string.Empty;
    public Document Document { get; set; } = new();
}
```

### TxTextControl.McpServer.Models.Responses.DocumentOperationDescriptor

```csharp
public sealed class DocumentOperationDescriptor
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("capabilityPack")]
    public string CapabilityPack { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("intent")]
    public string Intent { get; set; } = string.Empty;

    [JsonPropertyName("requiredProperties")]
    public List<string> RequiredProperties { get; set; } = [];

    [JsonPropertyName("optionalProperties")]
    public List<string> OptionalProperties { get; set; } = [];

    [JsonPropertyName("properties")]
    public Dictionary<string, string> Properties { get; set; } = new();

    [JsonPropertyName("example")]
    public Dictionary<string, object?> Example { get; set; } = new();

    [JsonPropertyName("modelEffects")]
    public List<string> ModelEffects { get; set; } = [];

    [JsonPropertyName("requiresTxExecution")]
    public bool RequiresTxExecution { get; set; } = true;

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.DocumentRecipeResponse

```csharp
public sealed class DocumentRecipeResponse
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("recipeName")]
    public string RecipeName { get; set; } = string.Empty;

    [JsonPropertyName("operationCount")]
    public int OperationCount { get; set; }

    [JsonPropertyName("mergeFields")]
    public IReadOnlyList<string> MergeFields { get; set; } = [];

    [JsonPropertyName("repeatingBlocks")]
    public IReadOnlyList<string> RepeatingBlocks { get; set; } = [];

    [JsonPropertyName("formFields")]
    public IReadOnlyList<string> FormFields { get; set; } = [];

    [JsonPropertyName("warnings")]
    public IReadOnlyList<string> Warnings { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentRecipeSummary

```csharp
public sealed class DocumentRecipeSummary
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("goal")]
    public string Goal { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.DocumentResponse

```csharp
public sealed class DocumentResponse
{
    public string SessionId { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.DocumentSectionEditResponse

```csharp
/// <summary>Result of replacing one resolved section body.</summary>
public sealed class DocumentSectionEditResponse
{
    /// <summary>Document session containing the edited section.</summary>
    public string SessionId { get; set; } = string.Empty;
    /// <summary>Heading of the edited section.</summary>
    public string Heading { get; set; } = string.Empty;
    /// <summary>Hash supplied by the caller for the previous content.</summary>
    public string PreviousContentHash { get; set; } = string.Empty;
    /// <summary>Hash of the section after replacement.</summary>
    public string ContentHash { get; set; } = string.Empty;
    /// <summary>Zero-based paragraph index of the preserved heading.</summary>
    public int HeadingParagraphIndex { get; set; }
    /// <summary>First zero-based paragraph index in the resulting body.</summary>
    public int BodyStartParagraphIndex { get; set; }
    /// <summary>Last zero-based paragraph index in the resulting body.</summary>
    public int BodyEndParagraphIndex { get; set; }
    /// <summary>Number of section bodies replaced.</summary>
    public int EditsApplied { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.DocumentSectionInspection

```csharp
public sealed class DocumentSectionInspection
{
    public int SectionIndex { get; set; }
    public string Id { get; set; } = string.Empty;
    public string? StyleName { get; set; }
    public PageLayoutDefinition? PageLayout { get; set; }
    public HeaderFooterInspection? Header { get; set; }
    public HeaderFooterInspection? Footer { get; set; }
    public List<DocumentBlockInspection> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentSectionResponse

```csharp
/// <summary>A heading-resolved document section.</summary>
public sealed class DocumentSectionResponse
{
    /// <summary>Document session containing the section.</summary>
    public string SessionId { get; set; } = string.Empty;
    /// <summary>Heading text as stored in the document.</summary>
    public string Heading { get; set; } = string.Empty;
    /// <summary>Formatting style applied to the heading paragraph.</summary>
    public string? HeadingStyleName { get; set; }
    /// <summary>Zero-based paragraph index of the heading.</summary>
    public int HeadingParagraphIndex { get; set; }
    /// <summary>First zero-based paragraph index in the section body.</summary>
    public int BodyStartParagraphIndex { get; set; }
    /// <summary>Last zero-based paragraph index in the section body.</summary>
    public int BodyEndParagraphIndex { get; set; }
    /// <summary>Hash used to reject edits against stale section content.</summary>
    public string ContentHash { get; set; } = string.Empty;
    /// <summary>Resolved body paragraphs with their document indexes and styles.</summary>
    public IReadOnlyList<IndexedParagraphResponse> Paragraphs { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentStructureResponse

```csharp
public sealed class DocumentStructureResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string DocumentId { get; set; } = string.Empty;
    public int SectionCount { get; set; }
    public int ParagraphCount { get; set; }
    public int TableCount { get; set; }
    public int ImageCount { get; set; }
    public int FieldCount { get; set; }
    public int HeaderFooterCount { get; set; }
    public List<DocumentSectionInspection> Sections { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentStylesResponse

```csharp
public sealed class DocumentStylesResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<StyleInspection> Styles { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentSuggestedAction

```csharp
public sealed class DocumentSuggestedAction
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Prompt { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.DocumentTablesResponse

```csharp
public sealed class DocumentTablesResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int TableCount { get; set; }
    public List<TableInspection> Tables { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.DocumentTextResponse

```csharp
public sealed class DocumentTextResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.FieldInspection

```csharp
public sealed class FieldInspection
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Value { get; set; }
    public string Location { get; set; } = string.Empty;
    public Dictionary<string, string> Properties { get; set; } = new();
}
```

### TxTextControl.McpServer.Models.Responses.HeaderFooterInspection

```csharp
public sealed class HeaderFooterInspection
{
    public string Type { get; set; } = string.Empty;
    public string? TextPreview { get; set; }
    public List<DocumentBlockInspection> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.HeaderFooterLocationInspection

```csharp
public sealed class HeaderFooterLocationInspection
{
    public int SectionIndex { get; set; }
    public string SectionId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? TextPreview { get; set; }
    public List<DocumentBlockInspection> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.IndexedParagraphResponse

```csharp
public sealed class IndexedParagraphResponse
{
    public int Index { get; set; }
    public string Text { get; set; } = string.Empty;
    public string? StyleName { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.KnowledgeDocumentExtractionResponse

```csharp
public sealed record KnowledgeDocumentExtractionResponse(string Version, IReadOnlyList<KnowledgeExtractionBlock> Blocks);
```

### TxTextControl.McpServer.Models.Responses.KnowledgeExtractionBlock

```csharp
/// <summary>Lossless, bounded blocks for host-controlled ingestion; locators are not editor offsets.</summary>
public sealed record KnowledgeExtractionBlock(string Text, string Locator, string? Heading = null, string? TableHeader = null);
```

### TxTextControl.McpServer.Models.Responses.KnowledgeExtractionResponse

```csharp
public sealed record KnowledgeExtractionResponse(IReadOnlyList<KnowledgeExtractionBlock> Blocks, int? NextBlock);
```

### TxTextControl.McpServer.Models.Responses.MergeTemplateResponse

```csharp
public sealed class MergeTemplateResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int MergedFieldCount { get; set; }
    public int RemainingFieldCount { get; set; }
    public int MergedFormFieldCount { get; set; }
    public int RemainingFormFieldCount { get; set; }
    public IReadOnlyList<string> MergedFieldNames { get; set; } = [];
    public IReadOnlyList<TemplateMergeFieldInfo> RemainingFields { get; set; } = [];
    public IReadOnlyList<string> MergedFormFieldNames { get; set; } = [];
    public IReadOnlyList<TemplateFormFieldInfo> RemainingFormFields { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.OperationResult

```csharp
public sealed class OperationResult
{
    public int Index { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Status { get; set; } = "applied";
    public string? Detail { get; set; }
    public string? TargetType { get; set; }
    public string? TargetId { get; set; }
    public string? Location { get; set; }
    public Dictionary<string, object?> Metadata { get; set; } = new();
}
```

### TxTextControl.McpServer.Models.Responses.ParagraphListResponse

```csharp
public sealed class ParagraphListResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<string> Paragraphs { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.SearchTextRange

```csharp
public sealed class SearchTextRange
{
    public int Start { get; set; }
    public int Length { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.SearchTextRangesResponse

```csharp
public sealed class SearchTextRangesResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<SearchTextRange> Matches { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.SearchTextResponse

```csharp
public sealed class SearchTextResponse
{
    public string SessionId { get; set; } = string.Empty;
    public List<int> Matches { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.SessionPolicyResponse

```csharp
public sealed class SessionPolicyResponse
{
    [JsonPropertyName("summary")]
    public string Summary { get; set; } = string.Empty;

    [JsonPropertyName("reuseSessionForFollowUpEdits")]
    public bool ReuseSessionForFollowUpEdits { get; set; } = true;

    [JsonPropertyName("followUpEditTriggers")]
    public List<string> FollowUpEditTriggers { get; set; } = [];

    [JsonPropertyName("recommendedInspectionToolsBeforeEditing")]
    public List<string> RecommendedInspectionToolsBeforeEditing { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.StyleInspection

```csharp
public sealed class StyleInspection
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public TextStyleDefinition? Text { get; set; }
    public ParagraphStyleDefinition? Paragraph { get; set; }
    public CellStyleDefinition? Cell { get; set; }
    public string? BasedOn { get; set; }
    public string? FollowingStyle { get; set; }
    public int UsageCount { get; set; }
    public bool IsBuiltIn { get; set; }
}
```

### TxTextControl.McpServer.Models.Responses.StylePolicyResponse

```csharp
public sealed class StylePolicyResponse
{
    [JsonPropertyName("summary")]
    public string Summary { get; set; } = string.Empty;

    [JsonPropertyName("omitStylePropertiesWhenPromptHasNoStyleInstructions")]
    public bool OmitStylePropertiesWhenPromptHasNoStyleInstructions { get; set; } = true;

    [JsonPropertyName("propertiesToOmitUnlessExplicitlyRequested")]
    public List<string> PropertiesToOmitUnlessExplicitlyRequested { get; set; } = [];

    [JsonPropertyName("automaticDefaults")]
    public List<string> AutomaticDefaults { get; set; } = [];

    [JsonPropertyName("explicitStyleTriggers")]
    public List<string> ExplicitStyleTriggers { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TableCellInspection

```csharp
public sealed class TableCellInspection
{
    public int RowIndex { get; set; }
    public int ColumnIndex { get; set; }
    public string Id { get; set; } = string.Empty;
    public string? TextPreview { get; set; }
    public CellStyleDefinition? CellStyle { get; set; }
    public int ColumnSpan { get; set; }
    public int RowSpan { get; set; }
    public List<string> FieldNames { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TableInspection

```csharp
public sealed class TableInspection
{
    public string Id { get; set; } = string.Empty;
    public int TableIndex { get; set; }
    public int TableNumber { get; set; }
    public int SectionIndex { get; set; }
    public int BlockIndex { get; set; }
    public string? StyleName { get; set; }
    public int RowCount { get; set; }
    public int ColumnCount { get; set; }
    public List<TableRowInspection> Rows { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TableRowInspection

```csharp
public sealed class TableRowInspection
{
    public int RowIndex { get; set; }
    public string Id { get; set; } = string.Empty;
    public List<TableCellInspection> Cells { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TemplateFormFieldInfo

```csharp
public sealed class TemplateFormFieldInfo
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public bool? Checked { get; set; }
    public string? Date { get; set; }
    public bool? Editable { get; set; }
    public bool Enabled { get; set; }
    public IReadOnlyList<string> Items { get; set; } = [];
    public string Location { get; set; } = "body";
}
```

### TxTextControl.McpServer.Models.Responses.TemplateFormFieldsResponse

```csharp
public sealed class TemplateFormFieldsResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int FieldCount { get; set; }
    public IReadOnlyList<TemplateFormFieldInfo> Fields { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TemplateMergeBlockInfo

```csharp
public sealed class TemplateMergeBlockInfo
{
    public string Name { get; set; } = string.Empty;
    public string BlockName { get; set; } = string.Empty;
    public int Id { get; set; }
    public int Start { get; set; }
    public int Length { get; set; }
    public string TextPreview { get; set; } = string.Empty;
}
```

### TxTextControl.McpServer.Models.Responses.TemplateMergeBlocksResponse

```csharp
public sealed class TemplateMergeBlocksResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int BlockCount { get; set; }
    public IReadOnlyList<TemplateMergeBlockInfo> Blocks { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.TemplateMergeFieldInfo

```csharp
public sealed class TemplateMergeFieldInfo
{
    public string Name { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string TypeName { get; set; } = string.Empty;
    public IReadOnlyList<string> Parameters { get; set; } = [];
    public string Location { get; set; } = "body";
}
```

### TxTextControl.McpServer.Models.Responses.TemplateMergeFieldsResponse

```csharp
public sealed class TemplateMergeFieldsResponse
{
    public string SessionId { get; set; } = string.Empty;
    public int FieldCount { get; set; }
    public IReadOnlyList<TemplateMergeFieldInfo> Fields { get; set; } = [];
}
```

### TxTextControl.McpServer.Models.Responses.ToolErrorResponse

```csharp
public sealed class ToolErrorResponse
{
    public bool IsError { get; init; } = true;
    public string Code { get; init; } = "internal_error";
    public string Message { get; init; } = "An unexpected error occurred.";
}
```

### TxTextControl.McpServer.Options.AdminOptions

```csharp
public sealed class AdminOptions
{
    public const string SectionName = "Admin";
    public string Username { get; set; } = "admin";
    public string Password { get; set; } = "admin";
}
```

### TxTextControl.McpServer.Options.DocumentAutomationOptions

```csharp
public sealed class DocumentAutomationOptions
{
    public const string SectionName = "DocumentAutomation";
    public List<string>? EnabledCapabilityPacks { get; set; }
    public List<string>? EnabledOperations { get; set; }
    public List<TextStyleDefinition> StylePresets { get; set; } = [];
    public string DefaultParagraphStyleName { get; set; } = "Body";
    public StyleRoleDefinition StyleRoles { get; set; } = new();
    public PageLayoutDefinition? DefaultPageLayout { get; set; }
    public List<TableStylePresetDefinition> TableStylePresets { get; set; } = [];
}
```

### TxTextControl.McpServer.Options.DocumentWorkerPoolOptions

```csharp
/// <summary>Configures the bounded out-of-process document engine worker pool.</summary>
public sealed class DocumentWorkerPoolOptions
{
    public const string SectionName = "DocumentWorkerPool";
    public bool Enabled { get; set; } = true;
    public int WorkerCount { get; set; } = 2;
    public int InteractiveWorkerCount { get; set; }
    public int QueueCapacity { get; set; } = 128;
    public int StartupTimeoutSeconds { get; set; } = 30;
    public int CommandTimeoutSeconds { get; set; } = 180;
    public int SessionAffinityIdleSeconds { get; set; } = 120;
    public int MaximumHotSessions { get; set; } = 2;
    public int WorkerRestartLimit { get; set; } = 5;
    public int WorkerRestartBackoffMilliseconds { get; set; } = 500;
    public int MaximumInputMegabytes { get; set; } = 64;
    public int MaximumOutputMegabytes { get; set; } = 128;
    public string? WorkerExecutablePath { get; set; }

    public void Validate();
}
```

### TxTextControl.McpServer.Options.McpServerOptions

```csharp
public sealed class McpServerOptions
{
    public const string SectionName = "McpServer";
    public string Name { get; set; } = "TX Text Control Document MCP Server";
    public string BasePath { get; set; } = "samples";
    public int SessionMaxAgeHours { get; set; } = 12;
}
```

### TxTextControl.McpServer.Services.AuthoringGuideService

```csharp
public sealed class AuthoringGuideService
{
    public AuthoringGuideService(DocumentOperationRegistry registry, IOptions<DocumentAutomationOptions> options);
    public AuthoringGuideResponse Build();
    public IReadOnlyList<AuthoringRecipe> GetRecipes();
    public AuthoringRecipe GetRecipe(string recipeName);
}
```

### TxTextControl.McpServer.Services.DocumentModelOperationCompiler

```csharp
public static class DocumentModelOperationCompiler
{
    public sealed class CompileResult
    {
        public ApplyOperationsRequest Request { get; init; } = new();
        public List<string> Warnings { get; init; } = [];
    }

    public static ApplyOperationsRequest Compile(RenderDocumentModelRequest request, DocumentAutomationOptions? options = null);
    public static CompileResult CompileDetailed(RenderDocumentModelRequest request, DocumentAutomationOptions? options = null);
}
```

### TxTextControl.McpServer.Services.DocumentSessionService

```csharp
public sealed class DocumentSessionService
{
    public DocumentSessionService(PathResolver paths);
    public DocumentSession Create(string? sessionId = null);
    public DocumentSession Get(string sessionId);
    public DocumentState LoadState(DocumentSession session);
    public void SaveState(DocumentSession session, DocumentState state, bool documentChanged = true);
    public bool Delete(string sessionId);
    public IEnumerable<string> CleanupOlderThan(TimeSpan age);
}
```

### TxTextControl.McpServer.Services.DocumentWorkflowService

```csharp
/// <summary>
/// Simplified document workflow service.
/// </summary>
public sealed class DocumentWorkflowService
{
    public DocumentWorkflowService(DocumentSessionService sessions, ITxDocumentEngine engine, IOptions<DocumentAutomationOptions> automationOptions);
    /// <summary>
    /// Create a new document session with a generated session id.
    /// </summary>
    public DocumentResponse CreateDocument();
    /// <summary>
    /// Load a base64-encoded document into an existing session document (overwrite).
    /// </summary>
    public DocumentResponse LoadFromBase64(LoadFromBase64Request request, string? sessionId = null);
    /// <summary>
    /// Applies the configured page and paragraph style presets to an imported document without
    /// changing its text or recreating its session.
    /// </summary>
    public ApplyDocumentPresetStylesResponse ApplyDocumentPresetStyles(ApplyDocumentPresetStylesRequest request);
    /// <summary>
    /// Creates a new document directly from semantic Markdown and applies all configured presets.
    /// </summary>
    public CreateDocumentFromMarkdownResponse CreateDocumentFromMarkdown(CreateDocumentFromMarkdownRequest request);
    /// <summary>
    /// Return the current session document as base64-encoded DOCX.
    /// </summary>
    public DocumentBase64Response GetAsBase64(GetAsBase64Request request);
    /// <summary>
    /// Apply a sequence of AI-friendly document operations to a session.
    /// </summary>
    public ApplyOperationsResponse ApplyOperations(ApplyOperationsRequest request);
    /// <summary>
    /// Render a neutral AI-facing document model into a real TX document.
    /// </summary>
    public ApplyOperationsResponse RenderDocumentModel(RenderDocumentModelRequest request);
    /// <summary>
    /// Creates a server-side export artifact that can be transferred as a binary HTTP stream.
    /// </summary>
    public DocumentExportResponse CreateDocumentExport(CreateDocumentExportRequest request);
    /// <summary>
    /// Converts uploaded content or an existing session without invoking authoring operations.
    /// </summary>
    public DocumentExportResponse ConvertDocument(ConvertDocumentRequest request);
    /// <summary>Resolves an export artifact for streaming.</summary>
    public DocumentExportFile GetDocumentExport(string sessionId, string exportId);
    /// <summary>
    /// Format the entire text in the session document.
    /// </summary>
    public DocumentResponse FormatText(string sessionId, FormatTextRequest request);
    /// <summary>
    /// Read paragraph texts for an existing session and optional start/end range.
    /// </summary>
    public ParagraphListResponse GetParagraphs(string sessionId, int? start = null, int? end = null);
    /// <summary>
    /// Search for text in the session document.
    /// </summary>
    public SearchTextResponse SearchText(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false);
    /// <summary>
    /// Search for text in the session document and return index ranges.
    /// </summary>
    public SearchTextRangesResponse SearchTextRanges(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false);
    /// <summary>
    /// Get the complete text of the document in the session.
    /// </summary>
    public DocumentTextResponse GetText(string sessionId);
    /// <summary>
    /// Get the neutral AI-facing document model for a session.
    /// </summary>
    public DocumentModelResponse GetDocumentModel(string sessionId);
    /// <summary>
    /// Get an AI-friendly structural summary for the session document.
    /// </summary>
    public DocumentStructureResponse GetDocumentStructure(string sessionId);
    /// <summary>
    /// Get styles known to the automation model for the session document.
    /// </summary>
    public DocumentStylesResponse GetDocumentStyles(string sessionId);
    /// <summary>
    /// Get table summaries, including rows, cells, text previews, and field names.
    /// </summary>
    public KnowledgeExtractionResponse ExtractKnowledgeBlocks(string sessionId, int startBlock = 0);
    public DocumentTablesResponse GetDocumentTables(string sessionId);
    /// <summary>
    /// Get merge/application fields represented by the automation model.
    /// </summary>
    public DocumentFieldsResponse GetDocumentFields(string sessionId);
    /// <summary>
    /// Get headers and footers represented by the automation model.
    /// </summary>
    public DocumentHeadersFootersResponse GetDocumentHeadersFooters(string sessionId);
    /// <summary>
    /// Get actual TX Text Control merge fields from the current session document.
    /// </summary>
    public TemplateMergeFieldsResponse GetTemplateMergeFields(string sessionId);
    /// <summary>
    /// Get actual TX Text Control merge-block SubTextParts from the current session document.
    /// </summary>
    public TemplateMergeBlocksResponse GetTemplateMergeBlocks(string sessionId);
    /// <summary>
    /// Get actual TX Text Control form fields from the current session document.
    /// </summary>
    public TemplateFormFieldsResponse GetTemplateFormFields(string sessionId);
    /// <summary>
    /// Merge JSON data into the current session template using TX Text Control MailMerge.
    /// </summary>
    public MergeTemplateResponse MergeTemplate(MergeTemplateRequest request);
    /// <summary>Classifies a document and returns category-specific, client-renderable actions.</summary>
    public DocumentCategoryResponse ClassifyDocument(ClassifyDocumentRequest request);
    /// <summary>
    /// Returns indexed document paragraphs, optionally focused around query matches.
    /// </summary>
    public DocumentInspectionResponse InspectDocument(InspectDocumentRequest request);
    /// <summary>Resolves one section from its visible heading and returns its complete body.</summary>
    public DocumentSectionResponse InspectDocumentSection(InspectDocumentSectionRequest request);
    /// <summary>Atomically replaces one heading-resolved section body when its inspected content is unchanged.</summary>
    public DocumentSectionEditResponse ReplaceDocumentSection(ReplaceDocumentSectionRequest request);
    /// <summary>
    /// Applies one deterministic text replacement to an existing document.
    /// </summary>
    public DocumentEditResponse EditDocument(EditDocumentRequest request);
    /// <summary>
    /// Get session information.
    /// </summary>
    public DocumentResponse GetSession(string sessionId);
    /// <summary>
    /// Delete a session.
    /// </summary>
    public bool DeleteSession(string sessionId);
}
```

### TxTextControl.McpServer.Services.FileCleanupService

```csharp
public sealed class FileCleanupService : BackgroundService
{
    public FileCleanupService(DocumentSessionService sessions, IOptions<McpServerOptions> options);
    public FileCleanupService(DocumentSessionService sessions, IOptions<McpServerOptions> options, ILogger<FileCleanupService> logger);
    protected override async Task ExecuteAsync(CancellationToken stoppingToken);
}
```

### TxTextControl.McpServer.Services.ITxDocumentEngine

```csharp
/// <summary>
/// Simplified document engine interface for simplified implementation.
/// </summary>
public interface ITxDocumentEngine
{
    DocumentState CreateEmpty(string workingDocumentPath);
    DocumentState LoadFromBase64(string base64Document, string workingDocumentPath, DocumentState? existingState = null, string? sourceFormat = null);
    DocumentPresetStyleEngineResult LoadMarkdownWithPresetStyles(string markdown, string workingDocumentPath);
    DocumentPresetStyleEngineResult ApplyPresetStyles(string workingDocumentPath, DocumentState state);
    DocumentState ConvertFromBase64ToFile(string base64Document, string? sourceFormat, string workingDocumentPath, string outputPath, string outputFormat);
    string GetAsBase64(string workingDocumentPath, string format);
    void ExportToFile(string workingDocumentPath, string outputPath, string format);
    DocumentState ApplyOperations(string workingDocumentPath, DocumentState state, ApplyOperationsRequest request);
    DocumentState FormatText(string workingDocumentPath, FormatTextRequest request);
    IReadOnlyList<string> GetParagraphs(string workingDocumentPath, int? start = null, int? end = null);
    IReadOnlyList<int> SearchText(string workingDocumentPath, string text = "", bool matchCase = false, bool wholeWord = false);
    IReadOnlyList<SearchTextRange> SearchTextRanges(string workingDocumentPath, string text = "", bool matchCase = false, bool wholeWord = false);
    string GetText(string workingDocumentPath);
    DocumentEditEngineResult EditDocument(string workingDocumentPath, EditDocumentRequest request);
    DocumentContentSnapshot GetContentSnapshot(string workingDocumentPath);
    IReadOnlyList<StyleInspection> GetDocumentStyleSnapshots(string workingDocumentPath);
    IReadOnlyList<TemplateMergeFieldInfo> GetTemplateMergeFields(string workingDocumentPath);
    IReadOnlyList<TemplateMergeBlockInfo> GetTemplateMergeBlocks(string workingDocumentPath);
    IReadOnlyList<TemplateFormFieldInfo> GetTemplateFormFields(string workingDocumentPath);
    TemplateContentSnapshot GetTemplateContentSnapshot(string workingDocumentPath);
    MergeTemplateEngineResult MergeTemplate(string workingDocumentPath, DocumentState state, MergeTemplateRequest request);
}
```

### TxTextControl.McpServer.Services.KnowledgeDocumentExtractionService

```csharp
/// <summary>Extracts uploaded reference documents on the MCP host using an isolated, short-lived engine.</summary>
/// <remarks>No persistent document/editor session or LLM is involved.</remarks>
public sealed class KnowledgeDocumentExtractionService
{
    public KnowledgeDocumentExtractionService(int maximumCharacters = 2_000_000);
    public const string Version = "mcp-tx34-structure-v1";
    public async Task<IReadOnlyList<KnowledgeExtractionBlock>> ExtractAsync(string fileName, ReadOnlyMemory<byte> content, CancellationToken cancellationToken);
}
```

### TxTextControl.McpServer.Services.KnowledgeExtractionEndpoint

```csharp
/// <summary>Binary, host-controlled ingestion endpoint; not a model-facing tool.</summary>
public static class KnowledgeExtractionEndpoint
{
    public const int MaximumFileBytes = 32 * 1024 * 1024;
    public static async Task<IResult> ExtractAsync(HttpContext context, CancellationToken ct);
}
```

### TxTextControl.McpServer.Services.PathResolver

```csharp
public sealed class PathResolver
{
    public PathResolver(IOptions<McpServerOptions> options);
    public string GetBasePath();
    public string GetTemplatesRoot();
    public string GetDataRoot();
    public string GetOutputRoot();
    public string GetSessionsRoot();
}
```

### TxTextControl.McpServer.Services.ServerTextControlDocumentEngine

```csharp
/// <summary>
/// Simplified TX Text Control document engine.
/// Content-oriented operations.
/// </summary>
public sealed partial class ServerTextControlDocumentEngine
{
    /// <summary>
    /// Format either a character range (start/length) or an entire paragraph (paragraphIndex).
    /// </summary>
    public DocumentState FormatText(string workingDocumentPath, FormatTextRequest request);
    /// <summary>
    /// Extract paragraphs from the current document as InternalUnicodeFormat, with optional slicing.
    /// </summary>
    public IReadOnlyList<string> GetParagraphs(string workingDocumentPath, int? start = null, int? end = null);
    /// <summary>
    /// Search for the specified text in the document's paragraphs and return matching paragraph indices.
    /// </summary>
    public IReadOnlyList<int> SearchText(string workingDocumentPath, string text = "", bool matchCase = false, bool wholeWord = false);
    /// <summary>
    /// Search text and return exact (start, length) ranges using ServerTextControl.Find.
    /// </summary>
    public IReadOnlyList<SearchTextRange> SearchTextRanges(string workingDocumentPath, string text = "", bool matchCase = false, bool wholeWord = false);
    /// <summary>
    /// Extract the full text of the document as InternalUnicodeFormat.
    /// </summary>
    public string GetText(string workingDocumentPath);
    public DocumentEditEngineResult EditDocument(string workingDocumentPath, EditDocumentRequest request);
    public DocumentContentSnapshot GetContentSnapshot(string workingDocumentPath);
}
public sealed partial class ServerTextControlDocumentEngine
{
    public IReadOnlyList<TemplateMergeFieldInfo> GetTemplateMergeFields(string workingDocumentPath);
    public IReadOnlyList<TemplateMergeBlockInfo> GetTemplateMergeBlocks(string workingDocumentPath);
    public IReadOnlyList<TemplateFormFieldInfo> GetTemplateFormFields(string workingDocumentPath);
    public TemplateContentSnapshot GetTemplateContentSnapshot(string workingDocumentPath);
    public MergeTemplateEngineResult MergeTemplate(string workingDocumentPath, DocumentState state, MergeTemplateRequest request);
}
public sealed partial class ServerTextControlDocumentEngine
{
    public DocumentState ApplyOperations(string workingDocumentPath, DocumentState state, ApplyOperationsRequest request);
}
public sealed partial class ServerTextControlDocumentEngine
{
    public DocumentPresetStyleEngineResult LoadMarkdownWithPresetStyles(string markdown, string workingDocumentPath);
    public DocumentPresetStyleEngineResult ApplyPresetStyles(string workingDocumentPath, DocumentState state);
}
public sealed partial class ServerTextControlDocumentEngine
{
    public IReadOnlyList<StyleInspection> GetDocumentStyleSnapshots(string workingDocumentPath);
}
/// <summary>
/// Simplified TX Text Control document engine.
/// Document-oriented operations.
/// </summary>
public sealed partial class ServerTextControlDocumentEngine : ITxDocumentEngine, IDisposable
{
    public ServerTextControlDocumentEngine(DocumentOperationRegistry operationRegistry, IOptions<DocumentAutomationOptions> automationOptions);
    public DocumentState CreateEmpty(string workingDocumentPath);
    public DocumentState LoadFromBase64(string base64Document, string workingDocumentPath, DocumentState? existingState = null, string? sourceFormat = null);
    public DocumentState ConvertFromBase64ToFile(string base64Document, string? sourceFormat, string workingDocumentPath, string outputPath, string outputFormat);
    public string GetAsBase64(string workingDocumentPath, string format);
    public void ExportToFile(string workingDocumentPath, string outputPath, string format);
    public void Dispose();
}
```

### TxTextControl.McpServer.Services.TxTextControlLicensing

```csharp
/// <summary>
/// Configures TX Text Control to resolve its license from this wrapper assembly.
/// </summary>
public static class TxTextControlLicensing
{
    public static void Configure();
}
```

### TxTextControl.McpServer.Services.Admin.AutomationSettingsService

```csharp
public sealed class AutomationSettingsService
{
    public AutomationSettingsService(IOptions<DocumentAutomationOptions> options, IHostEnvironment environment, IEnumerable<ICapabilityPack> knownPacks, IEnumerable<IDocumentOperationHandler> knownOperations);
    public AutomationSettingsService(DocumentAutomationOptions options, string settingsPath, IEnumerable<ICapabilityPack> knownPacks, IEnumerable<IDocumentOperationHandler> knownOperations);
    public IReadOnlyList<string> GetEnabledCapabilityPacks();
    public IReadOnlyList<string> GetEnabledOperations();
    public bool IsCapabilityPackEnabled(string capabilityPack);
    public bool IsOperationEnabled(string operation);
    public IReadOnlyList<TextStyleDefinition> GetStylePresets();
    public IReadOnlyList<TableStylePresetDefinition> GetTableStylePresets();
    public string GetDefaultParagraphStyleName();
    public StyleRoleDefinition GetStyleRoles();
    public void Save(IEnumerable<string> enabledCapabilityPacks, IEnumerable<string> enabledOperations);
    public void SaveStylePresets(string? defaultParagraphStyleName, StyleRoleDefinition? styleRoles, IEnumerable<TextStyleDefinition> stylePresets, IEnumerable<TableStylePresetDefinition> tableStylePresets);
}
```

### TxTextControl.McpServer.Services.Admin.ServerSettingsService

```csharp
/// <summary>Reads and persists the MCP server settings presented by the admin UI.</summary>
public sealed class ServerSettingsService
{
    public ServerSettingsService(IOptions<McpServerOptions> server, IOptions<DocumentWorkerPoolOptions> workers, IOptions<DocumentAutomationOptions> automation, IOptions<AdminOptions> admin, IConfiguration configuration, IHostEnvironment environment);
    public ServerSettingsSnapshot Get();
    public void Save(ServerSettingsSnapshot value, string? newAdminPassword);
}
```

### TxTextControl.McpServer.Services.Admin.ServerSettingsSnapshot

```csharp
public sealed class ServerSettingsSnapshot
{
    public string ServerName { get; set; } = string.Empty;
    public string BasePath { get; set; } = string.Empty;
    public int SessionMaxAgeHours { get; set; }
    public string AllowedHosts { get; set; } = string.Empty;
    public bool WorkerPoolEnabled { get; set; }
    public int WorkerCount { get; set; }
    public int InteractiveWorkerCount { get; set; }
    public int QueueCapacity { get; set; }
    public int StartupTimeoutSeconds { get; set; }
    public int CommandTimeoutSeconds { get; set; }
    public int SessionAffinityIdleSeconds { get; set; }
    public int MaximumHotSessions { get; set; }
    public int WorkerRestartLimit { get; set; }
    public int WorkerRestartBackoffMilliseconds { get; set; }
    public int MaximumInputMegabytes { get; set; }
    public int MaximumOutputMegabytes { get; set; }
    public string? WorkerExecutablePath { get; set; }
    public string PageSize { get; set; } = "Letter";
    public string Orientation { get; set; } = "portrait";
    public string PageUnit { get; set; } = "in";
    public float? MarginLeft { get; set; }
    public float? MarginRight { get; set; }
    public float? MarginTop { get; set; }
    public float? MarginBottom { get; set; }
    public string AdminUsername { get; set; } = string.Empty;
    public string DefaultLogLevel { get; set; } = "Information";
    public string AspNetLogLevel { get; set; } = "Warning";
}
```

### TxTextControl.McpServer.Services.Admin.SupportedFontService

```csharp
public sealed class SupportedFontService
{
    public IReadOnlyList<string> GetSupportedFonts();
}
```

### TxTextControl.McpServer.Services.Operations.AddTableRowOperationHandler

```csharp
public sealed class AddTableRowOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendFormFieldOperationHandler

```csharp
public sealed class AppendFormFieldOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendImageOperationHandler

```csharp
public sealed class AppendImageOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendMergeBlockOperationHandler

```csharp
public sealed class AppendMergeBlockOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendMergeFieldOperationHandler

```csharp
public sealed class AppendMergeFieldOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendParagraphOperationHandler

```csharp
public sealed class AppendParagraphOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.AppendTableOperationHandler

```csharp
public sealed class AppendTableOperationHandler : IDocumentOperationHandler
{
    public AppendTableOperationHandler();
    public AppendTableOperationHandler(IOptions<DocumentAutomationOptions> options);
    public AppendTableOperationHandler(DocumentAutomationOptions options);
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.ApplyStyleToParagraphOperationHandler

```csharp
public sealed class ApplyStyleToParagraphOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.ApplyTableStylePresetOperationHandler

```csharp
public sealed class ApplyTableStylePresetOperationHandler : IDocumentOperationHandler
{
    public ApplyTableStylePresetOperationHandler(IOptions<DocumentAutomationOptions> options);
    public ApplyTableStylePresetOperationHandler(DocumentAutomationOptions options);
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.BasicTextCapabilityPack

```csharp
public sealed class BasicTextCapabilityPack : ICapabilityPack
{
    public const string PackName = "BasicText";
    public const string DefineStyle = "define_style";
    public const string RenameStyle = "rename_style";
    public const string DeleteStyle = "delete_style";
    public const string CreateStylesFromParagraphs = "create_styles_from_paragraphs";
    public const string AppendParagraph = "append_paragraph";
    public const string ApplyStyleToParagraph = "apply_style_to_paragraph";
    public const string FormatParagraphs = "format_paragraphs";
    public const string FormatTextOccurrences = "format_text_occurrences";
    public const string ReplaceText = "replace_text";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; }
}
```

### TxTextControl.McpServer.Services.Operations.ClearApplicationFieldsOperationHandler

```csharp
public sealed class ClearApplicationFieldsOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.ClearFormFieldsOperationHandler

```csharp
public sealed class ClearFormFieldsOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.CreateStylesFromParagraphsOperationHandler

```csharp
public sealed class CreateStylesFromParagraphsOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.DefineStyleOperationHandler

```csharp
public sealed class DefineStyleOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.DeleteStyleOperationHandler

```csharp
public sealed class DeleteStyleOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.DocumentOperationContext

```csharp
public sealed class DocumentOperationContext
{
    public DocumentOperationContext(ServerTextControl textControl, Document document, IDictionary<string, TextStyleDefinition> styles, string? defaultParagraphStyleName = null, string? titleStyleName = null);
    public DocumentOperationContext(Document document, IDictionary<string, TextStyleDefinition> styles, string? defaultParagraphStyleName = null, string? titleStyleName = null);
    public ServerTextControl TextControl { get; }

    public bool TryGetTextControl(out ServerTextControl textControl);
    public Document Document { get; }
    public IDictionary<string, TextStyleDefinition> Styles { get; }
    public string DefaultParagraphStyleName { get; }
    public string? TitleStyleName { get; }
    public int? InlineDocumentEndInsertionIndex { get; set; }
    public int? DocumentEndInsertionIndex { get; set; }
    public int DocumentPositionCorrection { get; set; }
    public bool HasOpenParagraph { get; set; }
    public int CurrentSectionIndex { get; set; }

    public DocumentModel.Section GetMainSection();
    public DocumentModel.Section GetSection(int sectionIndex);
    public DocumentModel.Section GetCurrentSection();
    public TextStyleDefinition GetStyle(string styleName);
    public TextStyleDefinition GetDefaultTextStyle();
    public string? GetDefaultParagraphStyleName();
    public string? GetTitleStyleName();
    public bool IsAtStartOfMainBody();
}
```

### TxTextControl.McpServer.Services.Operations.DocumentOperationRegistry

```csharp
public sealed class DocumentOperationRegistry
{
    public DocumentOperationRegistry(IEnumerable<IDocumentOperationHandler> handlers, IEnumerable<ICapabilityPack> capabilityPacks, AutomationSettingsService settings);
    public IDocumentOperationHandler GetRequiredHandler(string type);
    public IReadOnlyList<DocumentAutomationCapability> GetCapabilities();
    public IReadOnlyList<DocumentOperationDescriptor> GetOperationDescriptors();
    public IReadOnlyList<CapabilityPackResponse> GetCapabilityPacks();
}
```

### TxTextControl.McpServer.Services.Operations.FieldsCapabilityPack

```csharp
public sealed class FieldsCapabilityPack : ICapabilityPack
{
    public const string PackName = "Fields";
    public const string AppendMergeField = "append_merge_field";
    public const string UpdateMergeField = "update_merge_field";
    public const string ClearApplicationFields = "clear_application_fields";
    public const string AppendMergeBlock = "append_merge_block";
    public const string AppendFormField = "append_form_field";
    public const string UpdateFormField = "update_form_field";
    public const string ClearFormFields = "clear_form_fields";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; }
}
```

### TxTextControl.McpServer.Services.Operations.FormatParagraphsOperationHandler

```csharp
public sealed class FormatParagraphsOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.FormatTableCellOperationHandler

```csharp
public sealed class FormatTableCellOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.FormatTableColumnOperationHandler

```csharp
public sealed class FormatTableColumnOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.FormatTableHeaderRowOperationHandler

```csharp
public sealed class FormatTableHeaderRowOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.FormatTextOccurrencesOperationHandler

```csharp
public sealed class FormatTextOccurrencesOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.HeaderFooterCapabilityPack

```csharp
public sealed class HeaderFooterCapabilityPack : ICapabilityPack
{
    public const string PackName = "HeaderFooter";
    public const string SetHeaderFooter = "set_header_footer";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; } = [SetHeaderFooter];
}
```

### TxTextControl.McpServer.Services.Operations.ICapabilityPack

```csharp
public interface ICapabilityPack
{
    string Name { get; }

    string Description { get; }

    IReadOnlyCollection<string> OperationTypes { get; }
}
```

### TxTextControl.McpServer.Services.Operations.IDocumentOperationHandler

```csharp
public interface IDocumentOperationHandler
{
    string Type { get; }

    string CapabilityPack { get; }

    DocumentOperationDescriptor Descriptor { get; }

    OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.InsertSectionBreakOperationHandler

```csharp
public sealed class InsertSectionBreakOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.MediaCapabilityPack

```csharp
public sealed class MediaCapabilityPack : ICapabilityPack
{
    public const string PackName = "Media";
    public const string AppendImage = "append_image";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; } = [AppendImage];
}
```

### TxTextControl.McpServer.Services.Operations.RenameStyleOperationHandler

```csharp
public sealed class RenameStyleOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.ReplaceTextOperationHandler

```csharp
public sealed class ReplaceTextOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.SectionCapabilityPack

```csharp
public sealed class SectionCapabilityPack : ICapabilityPack
{
    public const string PackName = "Sections";
    public const string InsertSectionBreak = "insert_section_break";
    public const string SetSectionLayout = "set_section_layout";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; } = [InsertSectionBreak, SetSectionLayout];
}
```

### TxTextControl.McpServer.Services.Operations.SetHeaderFooterOperationHandler

```csharp
public sealed class SetHeaderFooterOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.SetSectionLayoutOperationHandler

```csharp
public sealed class SetSectionLayoutOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.SetTableCellTextOperationHandler

```csharp
public sealed class SetTableCellTextOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.TableCapabilityPack

```csharp
public sealed class TableCapabilityPack : ICapabilityPack
{
    public const string PackName = "Tables";
    public const string AppendTable = "append_table";
    public const string SetTableCellText = "set_table_cell_text";
    public const string FormatTableCell = "format_table_cell";
    public const string FormatTableHeaderRow = "format_table_header_row";
    public const string FormatTableColumn = "format_table_column";
    public const string ApplyTableStylePreset = "apply_table_style_preset";
    public const string AddTableRow = "add_table_row";
    public string Name { get; }
    public string Description { get; }
    public IReadOnlyCollection<string> OperationTypes { get; }
}
```

### TxTextControl.McpServer.Services.Operations.TextOccurrence

```csharp
public readonly record struct TextOccurrence(int Start, int Length);
```

### TxTextControl.McpServer.Services.Operations.TextOccurrenceUtilities

```csharp
public static class TextOccurrenceUtilities
{
    public static List<TextOccurrence> FindOccurrences(ServerTextControl tx, string matchText, bool matchCase, bool wholeWord, int? maxOccurrences);
    public static int FormatModelOccurrences(DocumentModel.Document document, string matchText, bool matchCase, bool wholeWord, int? maxOccurrences, DocumentModel.TextStyleDefinition style);
    public static int ReplaceModelOccurrences(DocumentModel.Document document, string matchText, string replacementText, bool matchCase, bool wholeWord, int? maxOccurrences);
}
```

### TxTextControl.McpServer.Services.Operations.UpdateFormFieldOperationHandler

```csharp
public sealed class UpdateFormFieldOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Operations.UpdateMergeFieldOperationHandler

```csharp
public sealed class UpdateMergeFieldOperationHandler : IDocumentOperationHandler
{
    public string Type { get; }
    public string CapabilityPack { get; }
    public DocumentOperationDescriptor Descriptor { get; }

    public OperationResult Apply(DocumentOperationContext context, DocumentOperation operation, int index);
}
```

### TxTextControl.McpServer.Services.Workers.DocumentWorkerCommandException

```csharp
public sealed class DocumentWorkerCommandException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
```

### TxTextControl.McpServer.Services.Workers.DocumentWorkerPool

```csharp
public sealed partial class DocumentWorkerPool : IHostedService, IAsyncDisposable
{
    public DocumentWorkerPool(IOptions<DocumentWorkerPoolOptions> options, IHostEnvironment environment, PathResolver paths, ILogger<DocumentWorkerPool> logger, TxTextControl.McpServer.Services.Admin.AutomationSettingsService? automationSettings = null);
    public int WorkerCount { get; }
    public int QueueDepth { get; }
    public int ActiveCommands { get; }

    public DocumentWorkerPoolStatus GetStatus();
    public async Task StartAsync(CancellationToken cancellationToken);
    public async Task StopAsync(CancellationToken cancellationToken);
    public async ValueTask DisposeAsync();
}
```

### TxTextControl.McpServer.Services.Workers.DocumentWorkerPoolStatus

```csharp
public sealed record DocumentWorkerPoolStatus(bool Enabled, bool Started, int WorkerCount, int QueueDepth, int ActiveCommands, IReadOnlyList<DocumentWorkerStatus> Workers);
```

### TxTextControl.McpServer.Services.Workers.DocumentWorkerStatus

```csharp
public sealed record DocumentWorkerStatus(int WorkerIndex, int ProcessId, bool Healthy, string? HotSessionKey, int RestartCount, bool ReservedForInteractiveCommands, long WorkingSetBytes, DateTime LastUsedUtc);
```

### TxTextControl.McpServer.Tools.ContentTools

```csharp
public sealed class ContentTools
{
    public ContentTools(DocumentWorkflowService workflow);
    public object ExtractKnowledgeBlocks(string sessionId, int startBlock = 0);
    public object InspectDocument(InspectDocumentRequest request);
    public object ClassifyDocument(ClassifyDocumentRequest request);
    public object EditDocument(EditDocumentRequest request);
    public object FormatText(string sessionId, FormatTextRequest request);
    public object FormatTextOccurrences(FormatTextOccurrencesRequest request);
    public object GetParagraphs(string sessionId, int? start = null, int? end = null);
    public object SearchText(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false);
    public object SearchTextRanges(string sessionId, string text = "", bool matchCase = false, bool wholeWord = false);
    public object GetText(string sessionId);
}
```

### TxTextControl.McpServer.Tools.DocumentTools

```csharp
public sealed class DocumentTools
{
    public DocumentTools(DocumentWorkflowService workflow, IHttpContextAccessor httpContextAccessor);
    public object CreateDocument();
    public object LoadFromBase64(LoadFromBase64Request request, string? sessionId = null);
    public object GetAsBase64(GetAsBase64Request request);
    public object ConvertDocument(ConvertDocumentRequest request);
    public object CreateDocumentExport(CreateDocumentExportRequest request);
    public object GetSession(string sessionId);
    public object DeleteSession(string sessionId);
}
```

### TxTextControl.McpServer.Tools.FieldTools

```csharp
public sealed class FieldTools(DocumentWorkflowService workflow)
{
    public object InsertMergeField(InsertMergeFieldRequest request);
    public object InsertFormField(InsertFormFieldRequest request);
    public object CreateMergeBlock(CreateMergeBlockRequest request);
    public object UpdateMergeField(UpdateMergeFieldRequest request);
    public object UpdateFormField(UpdateFormFieldRequest request);
    public object ClearApplicationFields(ClearFieldsRequest request);
    public object ClearFormFields(ClearFieldsRequest request);
}
```

### TxTextControl.McpServer.Tools.OperationTools

```csharp
public sealed class OperationTools
{
    public OperationTools(DocumentWorkflowService workflow, DocumentOperationRegistry registry, IOptions<DocumentAutomationOptions> options, AutomationSettingsService settings, AuthoringGuideService authoringGuide);
    public object ApplyOperations(ApplyOperationsRequest request);
    public object CreateDocumentFromMarkdown(CreateDocumentFromMarkdownRequest request);
    public object ApplyDocumentPresetStyles(ApplyDocumentPresetStylesRequest request);
    public object RenderDocumentModel(RenderDocumentModelRequest request);
    public object GetDocumentAutomationCapabilities();
    public object GetAuthoringGuide();
    public object ListDocumentRecipes();
    public object CreateDocumentFromRecipe(CreateDocumentFromRecipeRequest request);
    public object GetDocumentModel(string sessionId);
    public object GetDocumentStructure(string sessionId);
    public object GetDocumentStyles(string sessionId);
    public object GetDocumentTables(string sessionId);
    public object GetDocumentFields(string sessionId);
    public object GetDocumentHeadersFooters(string sessionId);
    public object GetTemplateMergeFields(string sessionId);
    public object GetTemplateMergeBlocks(string sessionId);
    public object GetTemplateFormFields(string sessionId);
    public object MergeTemplate(MergeTemplateRequest request);
}
```

### TxTextControl.McpServer.Tools.ParagraphTools

```csharp
public sealed class ParagraphTools(DocumentWorkflowService workflow)
{
    public object FormatParagraph(FormatParagraphRequest request);
}
```

### TxTextControl.McpServer.Tools.SectionTools

```csharp
public sealed class SectionTools
{
    /// <summary>Initializes section tools for the document workflow.</summary>
    public SectionTools(DocumentWorkflowService workflow);
    public object InspectDocumentSection(InspectDocumentSectionRequest request);
    public object ReplaceDocumentSection(ReplaceDocumentSectionRequest request);
}
```

### TxTextControl.McpServer.Tools.StyleTools

```csharp
public sealed class StyleTools(DocumentWorkflowService workflow)
{
    public object ListDocumentStyles(string sessionId);
    public object SetDocumentStyle(SetDocumentStyleRequest request);
    public object ApplyDocumentStyle(ApplyDocumentStyleRequest request);
    public object RenameDocumentStyle(RenameDocumentStyleRequest request);
    public object DeleteDocumentStyle(DeleteDocumentStyleRequest request);
    public object CreateStylesFromParagraphs(CreateStylesFromParagraphsRequest request);
}
```

### TxTextControl.McpServer.Tools.TableTools

```csharp
public sealed class TableTools
{
    /// <summary>Initializes table tools for the document workflow.</summary>
    public TableTools(DocumentWorkflowService workflow);
    public object InsertTable(InsertTableRequest request);
    public object FormatTable(FormatTableRequest request);
    public object AddTableRows(AddTableRowsRequest request);
}
```

<!-- END GENERATED PUBLIC REFERENCE -->
