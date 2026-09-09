using Microsoft.Extensions.AI;
using TXTextControl.AI;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: LocalChat <model.gguf>");
    return 1;
}

await using LocalLanguageModel model = await LocalLanguageModel.LoadAsync(args[0]);
using ChatSession session = model.CreateSession();

Console.WriteLine($"Model: {model.Info.Name}");
Console.WriteLine($"Architecture: {model.Info.Architecture ?? "unknown"}");
Console.WriteLine($"Runtime: {model.Runtime.Engine} / {model.Runtime.Backend}");
if (model.Info.Metadata.TryGetValue("llama.cpp.gpu_layers", out string? gpuLayers))
{
    Console.WriteLine($"GPU layers: {gpuLayers}");
}
Console.WriteLine("Type 'exit' to quit.\n");

while (true)
{
    Console.Write("> ");
    string? prompt = Console.ReadLine();
    if (prompt is null || prompt.Equals("exit", StringComparison.OrdinalIgnoreCase))
    {
        break;
    }

    ChatResponse response = await session.GetResponseAsync(prompt);
    Console.WriteLine(response.Text);
    Console.WriteLine();
}

return 0;
