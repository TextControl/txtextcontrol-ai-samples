using System.Security.Cryptography;
using System.Text;

namespace TxTextControl.McpServer;

/// <summary>Optional bearer protection for the standalone host's document APIs.</summary>
public static class McpHostAccess
{
    public static void UseMcpHostAccess(this WebApplication app)
    {
        string key = app.Configuration["McpServiceAuthentication:ApiKey"] ?? "";
        bool required = app.Configuration.GetValue<bool>("McpServiceAuthentication:Required");
        if (!required && key.Length == 0) return;
        if (key.Length < 32) throw new InvalidOperationException("MCP service authentication requires a random API key of at least 32 characters.");
        byte[] expected = SHA256.HashData(Encoding.UTF8.GetBytes("Bearer " + key));
        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/mcp") || context.Request.Path.StartsWithSegments("/exports"))
            {
                string supplied = context.Request.Headers.Authorization.ToString();
                if (!context.Request.IsHttps || supplied.Length > 2048 ||
                    !CryptographicOperations.FixedTimeEquals(expected, SHA256.HashData(Encoding.UTF8.GetBytes(supplied))))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.Headers.WWWAuthenticate = "Bearer";
                    context.Response.Headers.CacheControl = "no-store";
                    return;
                }
            }
            await next();
        });
    }
}
