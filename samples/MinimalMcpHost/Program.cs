using TxTextControl.McpServer;

if (await TextControlMcpWorker.RunIfRequestedAsync(args) is int workerExitCode)
{
    Environment.ExitCode = workerExitCode;
    return;
}

var builder = WebApplication.CreateBuilder(args);
if (!builder.Environment.IsDevelopment())
    throw new InvalidOperationException("MinimalMcpHost is a loopback-only Development sample. Use the full MCP host with authentication for deployment.");
builder.Services.AddTextControlMcpServer(builder.Configuration);
var app = builder.Build();
app.Use(async (context, next) =>
{
    var peer = context.Connection.RemoteIpAddress;
    if (peer is null || !System.Net.IPAddress.IsLoopback(peer.IsIPv4MappedToIPv6 ? peer.MapToIPv4() : peer))
    { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
    await next();
});
// Local development only. Add host authentication and session ownership checks before public deployment.
app.MapTextControlMcp();
app.Run();
