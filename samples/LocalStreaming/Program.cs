using Microsoft.Extensions.AI;
using TXTextControl.AI;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: LocalStreaming <model.gguf>");
    return 1;
}

await using LocalLanguageModel model = await LocalLanguageModel.LoadAsync(args[0]);
await foreach (ChatResponseUpdate update in model.GetStreamingResponseAsync(
    "Write a short article about electronic signatures."))
{
    Console.Write(update.Text);
}

Console.WriteLine();
return 0;
