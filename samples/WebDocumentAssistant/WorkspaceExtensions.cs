using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using TXTextControl.Web;
using TXTextControl.Web.DocumentEditor.Backend;

namespace TXTextControl.AI.Web;

public static class WorkspaceExtensions
{
    public static IServiceCollection AddTextControlAIWorkspace(this IServiceCollection services,
        IConfiguration? editorConfiguration = null)
    {
        services.AddRazorPages();
        if (editorConfiguration is not null) services.Configure<DocumentEditorWorkerOptions>(editorConfiguration);
        services.PostConfigure<DocumentEditorWorkerOptions>(options =>
        {
            options.Port ??= 4568;
            options.ListenAddress ??= "127.0.0.1";
        });
        services.AddHostedService<DocumentEditorWorkerManager>();
        return services;
    }

    public static IApplicationBuilder UseTextControlAIWorkspace(this IApplicationBuilder app,
        string? editorHost = null, int? editorPort = null)
    {
        var options = app.ApplicationServices.GetRequiredService<IOptions<DocumentEditorWorkerOptions>>().Value;
        app.UseWebSockets();
        app.UseTXWebSocketMiddleware(editorHost ?? options.ListenAddress ?? "127.0.0.1", editorPort ?? options.Port ?? 4568);
        return app;
    }
}
