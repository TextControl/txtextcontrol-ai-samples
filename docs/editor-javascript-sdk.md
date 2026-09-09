# Reusable Document Editor / AI JavaScript SDK

`TXTextControl.AI.AspNetCore` ships the HTTP client and an optional editor binding as
static web assets. No npm install, page templates, CSS framework, or global DOM selectors
are required. The host supplies its licensed TX Text Control Document Editor and its
own UI. The MCP server remains a separate document-processing service.

## Load and bind

Register the normal ASP.NET Core AI services/endpoints and static files as described in
the package README. Include the assets after your editor initialization script:

```html
<script src="/_content/TXTextControl.AI.AspNetCore/client.js"></script>
<script src="/_content/TXTextControl.AI.AspNetCore/editor.js"></script>
```

In Razor, use `~/...` paths and `asp-append-version="true"` for virtual directories
and cache invalidation, as the full sample does.

```javascript
const client = new TXTextControlAI.Client({ apiBaseUrl: "/api" });
const assistant = new TXTextControlAI.DocumentAssistant({
    client,
    editor: TXTextControl
});

const unsubscribe = assistant.on("selectionChanged", selection => {
    rephraseButton.disabled = selection.length === 0 || !selection.text.trim();
});
assistant.on("progress", event => {
    if (event.type === "status") statusLabel.textContent = event.message;
});

await assistant.ready();
const result = await assistant.execute('Change the style "Heading 1" to red.');
answerContainer.textContent = result.text || "Completed";
// result.applied tells you whether an editor mutation was applied.
// result.artifacts and result.answerId can drive your download/export controls.

// On component/page teardown:
// unsubscribe();
// assistant.dispose();
```

The UI elements in the example belong to the application. The SDK does not locate,
render, or style them. The request goes through your AI integration API, which talks
to MCP; editor code does not connect directly to the MCP server.

Bind before `textControlLoaded`. If your application already observed that event,
pass `editorOptions: { alreadyReady: true }`; there is no guessed global readiness flag.
The MVC bootstrap initially supplies only `addEventListener`. The SDK registers the
readiness callback at that stage and defers other subscriptions and API validation
until `textControlLoaded`, after the WebSocket has delivered the full editor API.
`timeoutMilliseconds` defaults to 30000 for readiness/native callbacks, independently
of the much longer server-side model timeout.

## Public interface

| Object | Responsibilities |
| --- | --- |
| `Client` | Auth-aware HTTP requests, streaming, chat, document assistance/classification/reset and exports |
| `EditorAdapter` | Readiness, selection, load/save, guarded replacement, events and callback error handling |
| `DocumentAssistant` | Captures editor context, serializes workflows, manages the document session, calls AI and applies results |

```javascript
await assistant.loadDocument("RichTextFormat", rtfBase64);
// await assistant.loadFile(fileInput.files[0]); // TX, RTF, DOCX, DOC, HTML, PDF.
const selection = await assistant.getSelection();
await assistant.selectRange(selection.start, selection.length, { focus: true });
const txBase64 = await assistant.saveDocument();
const category = await assistant.classify();
const summary = await assistant.summarize();
const rewritten = await assistant.rephrase("professional");
await assistant.reset(); // Resets conversation; does not clear the editor.
```

For standalone editor helpers, use `new TXTextControlAI.EditorAdapter(TXTextControl)`.
It additionally exposes `replaceSelection(text)`. An existing adapter can be passed
as the assistant's `editor`; the assistant then does not dispose that caller-owned
adapter. Do not create multiple adapters for the same native editor. `on(...)`
returns an unsubscribe function; disposal removes native listeners and timers.

The browser assets also include `client.d.ts` and `editor.d.ts`, with global namespace
declarations for script-tag integrations. Reference `editor.d.ts` from your TypeScript
project (it references `client.d.ts`). No ES-module or npm distribution is implied.

## Mutation safety and cancellation

All SDK operations sharing an adapter serialize; a later request captures the document
after the earlier request finishes. Reads used to update selection UI are debounced.
Content changes or document loads during analysis invalidate its snapshot. A returned
mutation targeting a selection is also rejected if the selection/text part moved.
`EditorConflictError` is thrown, no returned edit is dispatched, and the next request
resets the backend conversation to avoid reusing stale state. Read-only answers do
not fail merely because the selection moved.

The editor remains interactive during inference. Immediately before applying a result,
the SDK verifies the snapshot again and briefly uses `EditMode.ReadOnly` during the
commit, restoring the previous mode afterward. It refuses AI mutations when the
original mode is not `Edit`; it does not bypass document protection. Empty rewrites
do not delete selected text.

```javascript
const controller = new AbortController();
const pending = assistant.execute("Summarize the agreement", {
    signal: controller.signal,
    onProgress: event => console.log(event)
});
// controller.abort(); // Cancels this request.
// assistant.cancel(); // Cancels this assistant's running/queued operations.
const result = await pending;
```

Cancellation before commit prevents the returned edit from being dispatched. Native
editor callbacks do not support undoing a mutation already sent; once commit starts,
the SDK waits for it and restores edit mode. Cancellation is not a rollback mechanism.
A native timeout/disconnection fails the adapter closed: reinitialize the editor and
binding instead of submitting more mutations into an uncertain native operation.

Route application-initiated document mutations through the adapter as well. This is
optimistic local concurrency protection, not an editor/server transaction or a lock
against arbitrary external scripts or collaborative-editor clients. The API's existing
selection contract is unchanged; it does not add main-text/header/frame addressing
to MCP. Use main-document ranges for MCP selection edits until that contract supports
other text parts explicitly. Plain rephrasing stays local to the selected editor text.

## Sessions and security

The current server has one document conversation per browser session. Use one active
assistant per session/API, including across tabs. The SDK prevents duplicate ownership
of an editor or Client object; creating another Client does not create a new server
session. Multi-editor, concurrently isolated conversations require a corresponding
server-side session/authorization design and are not added by this extraction.

Keep the host's authentication, CORS, session-cookie and MCP authorization policies.
Classification and document questions send the native document snapshot to the configured
AI integration service; rephrase requests send selected text only. The SDK stores a
local snapshot for concurrency checks but never puts document bytes into progress events.
Your UI must render returned content safely; the SDK never inserts assistant HTML.

## Sample migration and tests

`samples/WebDocumentAssistant/wwwroot/js/app.js` uses the public assistant interface.
It retains its pages, chat rendering, quick-action layouts, upload controls, filenames,
toasts and runtime UI; it no longer contains direct `TXTextControl.selection`, load/save,
or native listener plumbing.

Run the JavaScript regressions with:

```powershell
node --test tests/TXTextControl.AI.AspNetCore.Tests/client.test.cjs tests/TXTextControl.AI.AspNetCore.Tests/editor.test.cjs
```

Tests use callback-faithful editor doubles and fake HTTP responses. They cover request
composition, mutation application, changed snapshots, cancellation, concurrency,
protection, failures and disposal; they do not substitute for testing a licensed live
editor against your chosen MCP/runtime deployment.

The adapter follows the documented TX editor [event API](https://docs.textcontrol.com/textcontrol/asp-dotnet/ref.javascript.txtextcontrol.addeventlistener.method.htm),
[listener removal](https://docs.textcontrol.com/textcontrol/asp-dotnet/ref.javascript.txtextcontrol.removeeventlistener.method.htm),
and [edit-mode API](https://docs.textcontrol.com/textcontrol/asp-dotnet/ref.javascript.txtextcontrol.seteditmode.method.htm).
