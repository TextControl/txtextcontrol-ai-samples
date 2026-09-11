# OpenAI and other inference providers

TX Text Control AI supports local GGUF inference and host-configured external
Chat Completions providers. Existing local-model APIs, chat/document endpoints,
MCP workflows and the Document Editor JavaScript interface remain available.
Local inference is still the default. No automatic cloud fallback is performed.

## Two independent choices

1. **Integration location:** run the integration inside your website, or use
   `RemoteIntegration:ServiceUrl` to proxy to your own `TXTextControl.AI.Service`.
2. **Inference provider:** that integration host uses a local model or a named
   external provider profile.

OpenAI is accessed through its API, not by signing into the ChatGPT website.
An external model remains at its provider: no GGUF, GPU or chat runtime download
is needed on your AI host. Local embeddings still need their own model/runtime.
MCP stays independently hosted and is called by the integration, not directly
by OpenAI. It need not be exposed publicly for the model provider to reach it.

## Configure an OpenAI profile

Add this to the **AI host's** configuration (merge into the existing `LocalAI`
section). When using remote integration, this belongs to AI.Service, not Web.

```json
{
  "LocalAI": {
    "InferenceProfile": "Local",
    "InferenceProfiles": [
      {
        "Name": "OpenAI",
        "Provider": "OpenAI",
        "Endpoint": "https://api.openai.com/v1",
        "Model": "YOUR_MODEL_ID",
        "ContextSize": 32768,
        "MaxOutputTokens": 4096,
        "SupportsTools": true,
        "SendSamplingParameters": false
      }
    ]
  }
}
```

Replace `YOUR_MODEL_ID` with a Chat Completions model available to your API
project. Set context/output limits to values supported by that model; these
are host-enforced limits, not a way to increase a model's actual context window.
Choose a model with function calling for MCP document operations.

### Option 1: appsettings (local testing)

API keys can be set directly in the profile's `ApiKey` property in
`appsettings.json` or `appsettings.Development.json`. Both are supported by
the same configuration binding; no special setter is required.

```json
{
  "LocalAI": {
    "InferenceProfiles": [
      {
        "Name": "OpenAI",
        "Provider": "OpenAI",
        "Endpoint": "https://api.openai.com/v1",
        "Model": "YOUR_MODEL_ID",
        "ApiKey": "YOUR_TEST_API_KEY"
      }
    ]
  }
}

The Web and AI.Service samples include `appsettings.OpenAI.example.json` with
an empty key. It is a template, **not automatically loaded**. Merge its LocalAI
settings into your existing appsettings file, set Model and ApiKey, and restart.
Do not replace the entire existing settings file, which contains other settings.
With the default Local selection, choose OpenAI in Runtime and click Apply.

Appsettings stores the key in plaintext and may be copied into published output.
Use a dedicated test key, keep the populated file private, and never commit it.
No browser endpoint writes keys back into appsettings or returns stored keys.

### Option 2: user secrets, environment variables or a secret manager

Leave `ApiKey` empty in the JSON file and supply it from a higher-priority
server-side configuration source. For local development:

```powershell
dotnet user-secrets set "LocalAI:InferenceProfiles:0:ApiKey" "YOUR_API_KEY" --project samples/WebDocumentAssistant
```

Use `samples/AiService` instead when it hosts the integration.
The equivalent environment variable is `LocalAI__InferenceProfiles__0__ApiKey`.
Never put a real key in committed appsettings files or browser JavaScript.

Restart the AI host after changing profile definitions or credentials. In the
web sample's Runtime page, select **OpenAI** under **Inference provider**.
**Test provider** sends a small, potentially billable prompt, without documents
or MCP tools, and does not change the active profile. **Apply and load model**
activates the profile; it does not download a model or verify API access.
Normal chat and document actions then use that provider.

To make it the startup selection, set `LocalAI:InferenceProfile` to `OpenAI`.
`WarmupOnStartup=true` initializes the selected client at startup; when false,
use Apply first. UI changes to the active selection are in-memory, just like
the existing runtime settings. Set the host configuration for restart persistence.

## Profile settings

| Setting | Default | Meaning |
|---|---|---|
| `InferenceProfile` | `Local` | Startup profile; Local is reserved for GGUF/llama-server. |
| `InferenceProfiles` | empty | Server-approved external destinations. |
| `Name` | empty | Required unique profile name selected by browser requests. |
| `Provider` | `OpenAI` | Factory identifier; built-in aliases are OpenAI and OpenAICompatible. |
| `Endpoint` | `https://api.openai.com/v1` | Exact API base URL, including /v1 if needed, not /chat/completions. |
| `Model` | empty | Required provider model identifier; cannot be replaced by a browser-supplied ID. |
| `ApiKey` | empty | Server-only API credential; required by the built-in adapter, omitted from JSON. |
| `ContextSize` | 32768 | Maximum context budget accepted by the integration. |
| `MaxOutputTokens` | 4096 | Maximum output budget accepted by the integration; less than ContextSize. |
| `SupportsTools` | true | Whether document tool workflows are allowed; set false for chat-only models. |
| `SendSamplingParameters` | false | Opt in to temperature, top-p, penalties and seed for compatible models. |
| `ReasoningEffort` | null | Omit to keep the provider default. Set `None` to explicitly disable reasoning, or `Low`, `Medium`, `High`, or `ExtraHigh` for a model that supports that effort. Applies to Chat, Document Studio, and profile connection tests; independent of the local model's reasoning switch. |

### Document tools and reasoning

Some models accept text requests but reject tool-enabled requests with their default reasoning effort through Chat Completions. For example, `gpt-5.6-luna` requires `"ReasoningEffort": "None"` in its `LocalAI:InferenceProfiles` entry to use document tools with this integration's Chat Completions transport. This disables model reasoning for that profile; it does not disable document tools or ordinary generation. Other profiles retain the provider default unless explicitly configured. Restart the AI host after changing the profile (the Web sample for in-process inference, or AI.Service for remote integration).

`LocalAI:InferenceTimeoutSeconds` also applies to external requests. Top-k,
GPU layers, threads, flash attention and llama-specific reasoning switches are
not sent to the external API. Sampling controls default to omitted because
some models reject them. Unsupported provider capabilities are not emulated.
The integration keeps its token-aware context manager and bounded document analysis.

## Privacy and security

Selecting an external profile authorizes ordinary prompts and included working
document content/tool results to be sent there. The sample displays a disclosure
when external inference is active. It does not upload the whole knowledge store.

Private reference knowledge additionally requires an exact approved endpoint:

```json
{
  "LocalAI": {
    "TrustedInferenceEndpoints": ["https://api.openai.com/v1"]
  }
}
```

Only add this approval after reviewing your organization's data-handling rules
and provider terms. Retrieved passages included in prompts leave the AI host,
even if indexing and embedding generation remain local. Selecting a collection
does not itself approve a new external destination. Existing MCP trust checks
remain in effect. No claim of healthcare or legal compliance is implied.

Non-loopback endpoints must use HTTPS with normal certificate validation.
URL credentials, queries and fragments are rejected. Redirects and automatic
HTTP retries are disabled. Provider HTTP error bodies are not returned to the
browser because they may echo private content or credentials.

Protect runtime administration using `administrationPolicy`, authentication,
same-origin/CSRF protections and deployment access controls, as for existing
runtime configuration. Do not expose unauthenticated configuration endpoints.

## Use the API without ASP.NET Core

The AI package exposes a standard caller-owned `IChatClient`:

```csharp
using Microsoft.Extensions.AI;
using TXTextControl.AI;

using IChatClient client = OpenAIChatClientFactory.Create(new OpenAIChatClientOptions
{
    Model = "YOUR_MODEL_ID",
    ApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
        ?? throw new InvalidOperationException("Set OPENAI_API_KEY."),
    Endpoint = new Uri("https://api.openai.com/v1"),
    RequestTimeout = TimeSpan.FromMinutes(2)
});

ChatResponse response = await client.GetResponseAsync(
    [new ChatMessage(ChatRole.User, "Explain the document approval process.")],
    new ChatOptions { MaxOutputTokens = 1024 });
Console.WriteLine(response.Text);
```

Streaming uses `GetStreamingResponseAsync` on the same interface. For automatic
function execution, wrap the client in `ChatClientBuilder(...).UseFunctionInvocation()`
and provide approved tools through ChatOptions. The ASP.NET Core integration
already does this for MCP. Provider-specific built-in tools, Responses API-only
features and hosted conversation state are not part of this adapter.

## Other providers

For compatible Chat Completions APIs, use `Provider=OpenAICompatible` and change
the API base URL, credential and model. Compatibility must be tested with the
chosen server: streaming, tool calling and accepted parameters vary. Loopback
HTTP is permitted for development. A compatible server without authentication
can use a non-secret placeholder key if it accepts an Authorization header.

For a different API protocol, implement `IInferenceChatClientFactory`:

```csharp
public sealed class CompanyChatClientFactory : IInferenceChatClientFactory
{
    public bool CanCreate(string provider) => provider == "Company";
    public IChatClient Create(InferenceProfile profile, TimeSpan requestTimeout)
    {
        // Return a new client backed by your provider SDK.
        // Honor cancellation/timeouts and expose safe error messages.
        return CreateCompanyClient(profile, requestTimeout);
    }
}
// Register on the integration host:
builder.Services.AddSingleton<IInferenceChatClientFactory, CompanyChatClientFactory>();
```

`CreateCompanyClient` is an application-provided implementation, not a toolkit
method. The integration owns and disposes each returned client. Factories receive
host-owned configuration, never arbitrary browser destinations. Custom adapters
must honor the declared processing destination, preserve TLS/credential safety,
and avoid hidden fallback to unapproved endpoints. LocalLanguageModel remains
unchanged; existing local callers need no migration.

## Additive administration endpoints

- `GET /api/inference/profiles`: credential-free profile metadata, under the
  configured administration policy.
- `POST /api/inference/test` with `{ "inferenceProfile": "OpenAI" }`: small
  connection test, under the same administration policy.
- Existing `POST /api/runtime`: add `inferenceProfile` to the existing runtime
  configuration JSON. Omitted values retain legacy Local behavior.
- Existing `GET /api/runtime`: configuration includes `inferenceProfile`.
- `GET /api/models` still lists local GGUF files so embedding configuration
  remains independent of the active chat provider.

The remote AI.Service proxy forwards these endpoints with its existing
authentication/delegation protections. Update both AI host packages and website
assets together. Older package builds do not expose the new profile endpoints.

## Verification and scope

Automated tests use a local HTTP server to validate SDK request mapping, tool
roundtrips, streaming, redirect rejection and error redaction, plus provider
lifecycle, token limits and private-knowledge trust checks. They do not make
billable OpenAI requests. Perform the admin connection test with your own
credentials and selected model before deployment.

Reference: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart).
