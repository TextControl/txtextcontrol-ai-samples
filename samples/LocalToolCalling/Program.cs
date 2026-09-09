using System.ComponentModel;
using Microsoft.Extensions.AI;
using TXTextControl.AI;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: LocalToolCalling <model.gguf>");
    return 1;
}

await using LocalLanguageModel model = await LocalLanguageModel.LoadAsync(args[0]);
using IChatClient client = new ChatClientBuilder(model.CreateSession())
    .UseFunctionInvocation()
    .Build();

ChatOptions options = new()
{
    Tools = [AIFunctionFactory.Create(GetCurrentTime)],
};

ChatResponse response = await client.GetResponseAsync(
    "What time is it now in Berlin? Use the available tool and answer in one sentence.",
    options);

Console.WriteLine(response.Text);
return 0;

[Description("Returns the current time for an IANA or Windows time-zone identifier.")]
static string GetCurrentTime(
    [Description("The time-zone identifier, such as Europe/Berlin.")] string timeZone)
{
    TimeZoneInfo zone = TimeZoneInfo.FindSystemTimeZoneById(timeZone);
    return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone).ToString("O");
}
