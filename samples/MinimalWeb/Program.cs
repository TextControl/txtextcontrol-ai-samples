using TXTextControl.AI.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
if (!builder.Environment.IsDevelopment())
    throw new InvalidOperationException("MinimalWeb is a loopback-only Development sample. Use AiService or the secured full web sample for deployment.");
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 64 * 1024 * 1024);
builder.Services.AddRazorPages();
builder.Services.AddTextControlAI(builder.Configuration.GetSection(WebAiOptions.SectionName));
var app = builder.Build();
app.Use(async (context, next) =>
{
    var peer = context.Connection.RemoteIpAddress;
    if (peer is null || !System.Net.IPAddress.IsLoopback(peer.IsIPv4MappedToIPv6 ? peer.MapToIPv4() : peer))
    { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
    await next();
});
app.UseStaticFiles();
app.UseTextControlAI();
app.MapTextControlAI(enableRuntimeConfiguration: false);
app.MapRazorPages();
app.Run();
