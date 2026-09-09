using System;
using TxTextControl.McpServer;
using System.IO;
using System.Diagnostics;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using TxTextControl.McpServer.Services;
using TxTextControl.McpServer.Options;
using TxTextControl.McpServer.Services.Admin;
using TxTextControl.McpServer.Services.Operations;
using TxTextControl.McpServer.Services.Workers;
using TxTextControl.McpServer.Tools;

if (await TextControlMcpWorker.RunIfRequestedAsync(args) is int workerExitCode)
{
    Environment.ExitCode = workerExitCode;
    return;
}

var builder = WebApplication.CreateBuilder(args);
string adminPassword = builder.Configuration["Admin:Password"] ?? "";
if (adminPassword.Length < 32 || string.IsNullOrWhiteSpace(builder.Configuration["Admin:Username"]))
    throw new InvalidOperationException("Configure Admin:Username and a random Admin:Password of at least 32 characters using user secrets or a deployment secret store. There is no default password.");
if (!builder.Environment.IsDevelopment() && !builder.Configuration.GetValue<bool>("McpServiceAuthentication:Required"))
    throw new InvalidOperationException("Production requires McpServiceAuthentication:Required=true and a strong API key. Use HTTPS for the service and admin UI.");

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "TxMcpAdmin";
        options.LoginPath = "/admin/login";
        options.LogoutPath = "/admin/logout";
        options.SlidingExpiration = true;
    });
builder.Services.AddAuthorization();
builder.Services.AddHttpContextAccessor();
builder.Services.AddRazorPages(options =>
{
    options.Conventions.AuthorizeFolder("/Admin");
    options.Conventions.AllowAnonymousToPage("/Admin/Login");
});

builder.Services.AddTextControlMcpServer(builder.Configuration);
bool workerPoolEnabled = builder.Configuration.GetValue<bool?>(
    $"{DocumentWorkerPoolOptions.SectionName}:Enabled") ?? true;


var app = builder.Build();
app.Use(async (context, next) =>
{
    if (app.Environment.IsDevelopment())
    {
        var peer = context.Connection.RemoteIpAddress;
        if (peer is null || !System.Net.IPAddress.IsLoopback(peer.IsIPv4MappedToIPv6 ? peer.MapToIPv4() : peer))
        { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
    }
    else if (!context.Request.IsHttps)
    { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
    await next();
});
var mcpPerformanceLogger = app.Services
    .GetRequiredService<ILoggerFactory>()
    .CreateLogger("McpPerformance");

app.UseStaticFiles();
app.UseMcpHostAccess();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments("/mcp"))
    {
        await next();
        return;
    }

    var stopwatch = Stopwatch.StartNew();
    try
    {
        await next();
    }
    finally
    {
        stopwatch.Stop();
        if (stopwatch.ElapsedMilliseconds >= 1000)
        {
            mcpPerformanceLogger.LogWarning(
                "Slow MCP request {Method} {Path} completed with {StatusCode} in {ElapsedMilliseconds} ms",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
        else
        {
            mcpPerformanceLogger.LogDebug(
                "MCP request {Method} {Path} completed with {StatusCode} in {ElapsedMilliseconds} ms",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
    }
});

app.MapGet("/admin/automation", (
    IOptions<DocumentAutomationOptions> options,
    AutomationSettingsService settings,
    DocumentOperationRegistry registry) => Results.Ok(new
{
    capabilityPacks = registry.GetCapabilityPacks(),
    enabledCapabilityPacks = settings.GetEnabledCapabilityPacks(),
    enabledOperations = settings.GetEnabledOperations(),
    operations = registry.GetCapabilities(),
    defaultParagraphStyleName = options.Value.DefaultParagraphStyleName,
    styleRoles = options.Value.StyleRoles,
    defaultPageLayout = options.Value.DefaultPageLayout,
    stylePresets = options.Value.StylePresets,
    tableStylePresets = options.Value.TableStylePresets
})).RequireAuthorization();

if (workerPoolEnabled)
{
    app.MapGet("/health/document-workers", (DocumentWorkerPool pool) =>
    {
        DocumentWorkerPoolStatus status = pool.GetStatus();
        int healthyWorkers = status.Workers.Count(worker => worker.Healthy);
        return status.Started && healthyWorkers == status.WorkerCount
            ? Results.Ok(new
            {
                status = "healthy",
                status.WorkerCount,
                healthyWorkers,
                workerWorkingSetBytes = status.Workers.Sum(worker => worker.WorkingSetBytes),
                status.QueueDepth,
                status.ActiveCommands,
            })
            : Results.Json(
                new { status = "unhealthy", status.WorkerCount, healthyWorkers },
                statusCode: StatusCodes.Status503ServiceUnavailable);
    });
    app.MapGet("/admin/document-workers", (DocumentWorkerPool pool) =>
        Results.Ok(pool.GetStatus())).RequireAuthorization();
}

app.MapRazorPages();
app.MapTextControlMcp();
app.Run();

public partial class Program;
