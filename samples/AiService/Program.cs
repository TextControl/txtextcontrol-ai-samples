using TXTextControl.AI.AspNetCore;
using TXTextControl.AI.Knowledge;
using TXTextControl.AI.LlamaServer;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 64 * 1024 * 1024);
builder.Services.AddTextControlAIServiceAuthentication(builder.Configuration.GetSection("ServiceAuthentication"));
builder.Services.AddTextControlAI(builder.Configuration.GetSection(WebAiOptions.SectionName), options => options.RestrictMcpEndpoints = true);
bool knowledgeEnabled = builder.Configuration.GetValue<bool>("Knowledge:Enabled");
if (knowledgeEnabled)
{
    var local = builder.Configuration.GetSection(WebAiOptions.SectionName).Get<WebAiOptions>() ?? new();
    string privateDirectory = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "Knowledge");
    builder.Services.AddTextControlAIKnowledge(new(new KnowledgeOptions { DatabasePath = Path.Combine(privateDirectory, "knowledge.db") }, RemoteServiceAuthenticationHandler.UserPolicy)
        { AdministrationPolicy = RemoteServiceAuthenticationHandler.AdminPolicy });
    builder.Services.AddTextControlAIKnowledgeEmbeddings(Path.GetFullPath(local.ModelDirectory, builder.Environment.ContentRootPath), Path.Combine(privateDirectory, "embedding.json"),
        new LlamaServerModelOptions { ForceCpu = true, ContextSize = 2048, BatchSize = 2048, UBatchSize = 2048, ExecutablePath = local.LlamaServerExecutablePath, RuntimeCacheDirectory = local.RuntimeCacheDirectory, RuntimeDownload = local.RuntimeDownload });
}
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("service",
        _ => new ConcurrencyLimiterOptions { PermitLimit = 32, QueueLimit = 0 }));
});
var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseTextControlAI();
app.MapTextControlAI(administrationPolicy: RemoteServiceAuthenticationHandler.AdminPolicy).RequireAuthorization(RemoteServiceAuthenticationHandler.UserPolicy);
app.MapTextControlAIRuntimeAdministration(RemoteServiceAuthenticationHandler.AdminPolicy);
if (knowledgeEnabled) app.MapTextControlAIKnowledge();
app.MapGet("/api/host", (IWebHostEnvironment environment, Microsoft.Extensions.Options.IOptions<WebAiOptions> options) => Results.Ok(new
{
    modelDirectory = Path.GetFullPath(options.Value.ModelDirectory, environment.ContentRootPath),
    storage = "Models, installed runtimes, knowledge and generated downloads are stored on this AI-service host."
})).RequireAuthorization(RemoteServiceAuthenticationHandler.AdminPolicy);
app.MapGet("/health", () => Results.Ok(new { service = "TX Text Control AI", status = "running" }));
app.Run();
