using Microsoft.Extensions.AI;
using ModelContextProtocol.Client;
using System.Text.Json;
using TXTextControl.AI;
using TXTextControl.AI.Mcp;

string settingsPath = FindSettingsPath();
LocalAiSettings settings = File.Exists(settingsPath)
    ? JsonSerializer.Deserialize<LocalAiSettings>(await File.ReadAllTextAsync(settingsPath))
        ?? new LocalAiSettings()
    : new LocalAiSettings();

string modelPath = args.Length > 0
    ? args[0]
    : Environment.GetEnvironmentVariable("TXTEXTCONTROL_AI_MODEL")
        ?? ResolveConfiguredModelPath(settings.ModelPath, settingsPath);
string mcpEndpointValue = args.Length > 1 ? args[1] : settings.McpEndpoint;
if (!Uri.TryCreate(mcpEndpointValue, UriKind.Absolute, out Uri? mcpEndpoint)
    || (mcpEndpoint.Scheme != Uri.UriSchemeHttp && mcpEndpoint.Scheme != Uri.UriSchemeHttps))
{
    Console.Error.WriteLine("The MCP endpoint must be an absolute HTTP or HTTPS URL, for example http://127.0.0.1:5000/mcp.");
    return 1;
}

Console.WriteLine($"Model selection: {modelPath}");

HttpClientTransport transport = new(new HttpClientTransportOptions
{
    Name = "TX Text Control MCP Document Server",
    Endpoint = mcpEndpoint,
    TransportMode = HttpTransportMode.StreamableHttp,
});

await using McpClient mcp = await McpClient.CreateAsync(transport);
using HttpClient downloadClient = new();
McpDocumentToolSet toolSet = await McpDocumentToolSet.CreateAsync(
    mcp,
    downloadClient,
    new McpDocumentToolSetOptions
    {
        OutputDirectory = Path.Combine(Environment.CurrentDirectory, "artifacts"),
        ExportBaseUri = new Uri(mcpEndpoint.GetLeftPart(UriPartial.Authority)),
    });
IReadOnlyList<AITool> tools = toolSet.Tools;
Console.WriteLine($"Connected to {mcpEndpoint}.");
Console.WriteLine($"MCP tools discovered: {toolSet.DiscoveredToolCount}");
Console.WriteLine($"Tools exposed to the model: {tools.Count}");
if (toolSet.ReplacedBase64Tool)
{
    Console.WriteLine("Model-safe export: get_as_base64 replaced by save_document");
}
Console.WriteLine($"Export transfer: {(toolSet.UsesDirectExport ? "streaming HTTP" : "Base64 compatibility fallback")}");
Console.WriteLine("Loading local model...");
int lastReportedPercent = -5;
Progress<ModelLoadProgress> loadProgress = new(update =>
{
    int percent = (int)Math.Round(update.Fraction * 100);
    if (percent >= lastReportedPercent + 5)
    {
        lastReportedPercent = percent;
        Console.WriteLine($"  {update.Stage}: {percent}%");
    }
});

await using LocalLanguageModel model = await LocalLanguageModel.LoadAsync(
    modelPath,
    new LocalModelOptions
    {
        ContextSize = 32_768,
        GpuLayers = -1,
        HardwareBackend = HardwareBackend.Auto,
        InferenceTimeout = TimeSpan.FromSeconds(settings.InferenceTimeoutSeconds),
    },
    loadProgress);

using IChatClient agent = new ChatClientBuilder(model.CreateSession())
    .UseFunctionInvocation()
    .Build();

Console.WriteLine("TX Text Control Local Document AI\n");
Console.WriteLine($"Model: {model.Info.Name}");
Console.WriteLine($"Runtime: {model.Runtime.Engine}");
Console.WriteLine($"Hardware: {model.Runtime.Backend}");
if (model.Info.Metadata.TryGetValue("llama.cpp.gpu_layers", out string? gpuLayers))
{
    Console.WriteLine($"GPU layers: {gpuLayers}");
}
Console.WriteLine($"MCP server: {mcpEndpoint}");
Console.WriteLine($"Tools available: {tools.Count}\n");
Console.WriteLine("Enter a document request, or 'exit' to quit.");

string systemPrompt = """
    You are a TX Text Control document assistant. Follow the MCP server instructions and tool
    descriptions exactly. Classify each request as a document question, edit, conversion, or creation,
    and do not mix workflows. Reuse the active sessionId for follow-ups. Call dependent tools
    sequentially. Do not invent content, tool results, or successful exports. Do not reveal reasoning.
    """;
if (!string.IsNullOrWhiteSpace(toolSet.ServerInstructions))
{
    systemPrompt += $"\n\nMCP server instructions:\n{toolSet.ServerInstructions.Trim()}";
}

List<ChatMessage> conversation = [new ChatMessage(ChatRole.System, systemPrompt)];
string? activeDocumentSessionId = null;
const int maxConversationTurns = 6;

while (true)
{
    Console.Write("\n> ");
    string? prompt = Console.ReadLine();
    if (prompt is null || prompt.Equals("exit", StringComparison.OrdinalIgnoreCase))
    {
        break;
    }

    int historyCountBeforeTurn = conversation.Count;
    conversation.Add(new ChatMessage(ChatRole.User, prompt));

    try
    {
        List<ChatMessage> modelConversation = [conversation[0]];
        if (!string.IsNullOrWhiteSpace(activeDocumentSessionId))
        {
            modelConversation.Add(new ChatMessage(
                ChatRole.System,
                $"Active MCP document sessionId: {activeDocumentSessionId}. Inspect and modify this session for follow-up requests. Create a new session only when explicitly requested."));
        }
        modelConversation.AddRange(conversation.Skip(1));

        ChatResponse response = await agent.GetResponseAsync(
            modelConversation,
            new ChatOptions { Tools = [.. tools] });

        activeDocumentSessionId = ExtractLatestSessionId(response) ?? activeDocumentSessionId;
        string responseText = GetFinalAssistantText(response);
        conversation.Add(new ChatMessage(ChatRole.Assistant, responseText));
        int excessMessages = conversation.Count - 1 - (maxConversationTurns * 2);
        if (excessMessages > 0)
        {
            conversation.RemoveRange(1, excessMessages);
        }
        Console.WriteLine(responseText);
    }
    catch (Exception exception)
    {
        conversation.RemoveRange(historyCountBeforeTurn, conversation.Count - historyCountBeforeTurn);
        Console.Error.WriteLine($"Request failed: {exception.GetBaseException().Message}");
    }
}

return 0;

static string GetFinalAssistantText(ChatResponse response) =>
    response.Messages
        .LastOrDefault(message => message.Role == ChatRole.Assistant
            && !string.IsNullOrWhiteSpace(message.Text))
        ?.Text
    ?? response.Text;

static string? ExtractLatestSessionId(ChatResponse response)
{
    foreach (FunctionResultContent result in response.Messages
        .SelectMany(message => message.Contents)
        .OfType<FunctionResultContent>()
        .Reverse())
    {
        if (result.Result is DocumentExportResult export)
        {
            return export.SessionId;
        }

        try
        {
            JsonElement json = result.Result is JsonElement element
                ? element
                : JsonSerializer.SerializeToElement(result.Result);
            string? sessionId = FindString(json, "sessionId");
            if (!string.IsNullOrWhiteSpace(sessionId))
            {
                return sessionId;
            }
        }
        catch (JsonException)
        {
        }
        catch (NotSupportedException)
        {
        }
    }

    return null;
}

static string? FindString(JsonElement json, string name)
{
    if (json.ValueKind == JsonValueKind.Object)
    {
        foreach (JsonProperty property in json.EnumerateObject())
        {
            if (property.Name.Equals(name, StringComparison.OrdinalIgnoreCase)
                && property.Value.ValueKind == JsonValueKind.String)
            {
                return property.Value.GetString();
            }

            string? nested = FindString(property.Value, name);
            if (nested is not null)
            {
                return nested;
            }
        }
    }
    else if (json.ValueKind == JsonValueKind.Array)
    {
        foreach (JsonElement item in json.EnumerateArray())
        {
            string? nested = FindString(item, name);
            if (nested is not null)
            {
                return nested;
            }
        }
    }

    return null;
}

static string FindSettingsPath()
{
    string workingDirectorySettings = Path.Combine(Environment.CurrentDirectory, "appsettings.json");
    if (File.Exists(workingDirectorySettings))
    {
        return workingDirectorySettings;
    }

    for (DirectoryInfo? directory = new(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
    {
        string projectPath = Path.Combine(directory.FullName, "TXTextControl.MCP.LocalAI.csproj");
        string settingsPath = Path.Combine(directory.FullName, "appsettings.json");
        if (File.Exists(projectPath) && File.Exists(settingsPath))
        {
            return settingsPath;
        }
    }

    return Path.Combine(AppContext.BaseDirectory, "appsettings.json");
}

static string ResolveConfiguredModelPath(string modelPath, string settingsPath)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(modelPath);
    return Path.IsPathFullyQualified(modelPath)
        ? Path.GetFullPath(modelPath)
        : Path.GetFullPath(Path.Combine(Path.GetDirectoryName(settingsPath)!, modelPath));
}

internal sealed record LocalAiSettings
{
    public string ModelPath { get; init; } = "Models/Qwen_Qwen3.5-4B-Q4_K_M.gguf";

    public string McpEndpoint { get; init; } = "http://127.0.0.1:5000/mcp";

    public int InferenceTimeoutSeconds { get; init; } = 600;
}
