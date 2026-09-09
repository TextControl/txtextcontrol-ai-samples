using TXTextControl.AI.AspNetCore;
using TXTextControl.AI.Web;
using TXTextControl.AI.Knowledge;
using TXTextControl.AI.LlamaServer;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 64 * 1024 * 1024);
if (!string.IsNullOrWhiteSpace(builder.Configuration["IntegrationApiBaseUrl"]))
    throw new InvalidOperationException("Use RemoteIntegration:ServiceUrl and AllowedServiceUrls instead of IntegrationApiBaseUrl. Remote traffic now uses an authenticated server-side proxy.");
var connection = new RemoteIntegrationConnection(builder.Configuration.GetSection("RemoteIntegration").Get<RemoteIntegrationOptions>() ?? new(),
    Path.Combine(builder.Environment.ContentRootPath, "App_Data", "integration-connection.json"));
builder.Services.AddTextControlAIRemoteConnection(connection);
bool useRemoteIntegration = connection.ServiceUri is not null;
bool knowledgeEnabled = !useRemoteIntegration && builder.Configuration.GetValue<bool>("Knowledge:Enabled");
if (!useRemoteIntegration) builder.Services.AddTextControlAI(builder.Configuration.GetSection(WebAiOptions.SectionName));
if (knowledgeEnabled)
{
    var local = builder.Configuration.GetSection(WebAiOptions.SectionName).Get<WebAiOptions>() ?? new();
    string privateDirectory = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "Knowledge");
    builder.Services.AddTextControlAIKnowledge(new(new KnowledgeOptions { DatabasePath = Path.Combine(privateDirectory, "knowledge.db") }, "LocalRuntimeAdmin"));
    builder.Services.AddTextControlAIKnowledgeEmbeddings(Path.GetFullPath(local.ModelDirectory, builder.Environment.ContentRootPath), Path.Combine(privateDirectory, "embedding.json"),
        new LlamaServerModelOptions { ForceCpu = true, ContextSize = 2048, BatchSize = 2048, UBatchSize = 2048, ExecutablePath = local.LlamaServerExecutablePath, RuntimeCacheDirectory = local.RuntimeCacheDirectory, RuntimeDownload = local.RuntimeDownload });
}
builder.Services.AddTextControlAIWorkspace(builder.Configuration.GetSection("DocumentEditorWorker"));
bool deploymentLogin = builder.Configuration.GetValue<bool>("DeploymentAuthentication:Enabled");
if (!builder.Environment.IsDevelopment() && !deploymentLogin)
    throw new InvalidOperationException("Outside Development, configure DeploymentAuthentication:Enabled and a strong password, or replace the sample authentication with your application's identity provider.");
var authentication = builder.Services.AddAuthentication("LocalRuntimeAdmin");
if (deploymentLogin)
{
    var credentials = builder.Configuration.GetSection("DeploymentAuthentication").Get<DeploymentAdminAuthenticationOptions>() ?? new();
    if (credentials.Password.Length < 32 || string.IsNullOrWhiteSpace(credentials.Username) || credentials.Username.Contains(':'))
        throw new InvalidOperationException("Deployment login requires a username without ':' and a random password of at least 32 characters.");
    authentication.AddScheme<DeploymentAdminAuthenticationOptions, DeploymentAdminAuthenticationHandler>("LocalRuntimeAdmin", options =>
    { options.Username = credentials.Username; options.Password = credentials.Password; });
}
else authentication.AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, LoopbackAdminAuthenticationHandler>("LocalRuntimeAdmin", _ => { });
builder.Services.AddAuthorization(options => options.AddPolicy("LocalRuntimeAdmin", policy =>
    policy.AddAuthenticationSchemes("LocalRuntimeAdmin").RequireAuthenticatedUser()));

WebApplication app = builder.Build();
if (!deploymentLogin)
{
    app.Use(async (context, next) =>
    {
        var peer = context.Connection.RemoteIpAddress;
        if (peer is null || !System.Net.IPAddress.IsLoopback(peer.IsIPv4MappedToIPv6 ? peer.MapToIPv4() : peer))
        { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
        await next();
    });
}
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
if (deploymentLogin)
{
    // Protect pages AND the Document Editor's middleware/WebSocket endpoint.
    app.Use(async (context, next) =>
    {
        if (context.User.Identity?.IsAuthenticated != true)
        { await Microsoft.AspNetCore.Authentication.AuthenticationHttpContextExtensions.ChallengeAsync(context, "LocalRuntimeAdmin"); return; }
        await next();
    });
}
app.UseAuthorization();
if (!useRemoteIntegration) app.UseTextControlAI();
app.UseTextControlAIWorkspace();
app.MapRazorPages();
app.MapTextControlAIConnectionAdministration("LocalRuntimeAdmin");
if (useRemoteIntegration) app.MapTextControlAIRemoteProxy("LocalRuntimeAdmin", "LocalRuntimeAdmin");
if (!useRemoteIntegration)
{
    app.MapTextControlAI(administrationPolicy: "LocalRuntimeAdmin");
    app.MapTextControlAIRuntimeAdministration("LocalRuntimeAdmin");
    if (knowledgeEnabled) app.MapTextControlAIKnowledge();
}
app.Run();
