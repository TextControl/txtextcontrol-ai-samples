using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TXTextControl.AI.Web;

// Optional single-user, HTTPS-only login for the private Docker sample.
// Shared/public deployments should use OIDC and separate user/admin roles instead.
public sealed class DeploymentAdminAuthenticationOptions : AuthenticationSchemeOptions
{
    public string Username { get; set; } = "admin";
    public string Password { get; set; } = "";
}

public sealed class DeploymentAdminAuthenticationHandler(
    IOptionsMonitor<DeploymentAdminAuthenticationOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<DeploymentAdminAuthenticationOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string origin = Request.Headers.Origin.ToString();
        bool sameOrigin = origin.Length == 0 || Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
            uri.GetLeftPart(UriPartial.Authority).Equals(Request.Scheme + "://" + Request.Host, StringComparison.OrdinalIgnoreCase);
        if (!Request.IsHttps || !sameOrigin || Request.Headers["Sec-Fetch-Site"] == "cross-site")
            return Task.FromResult(AuthenticateResult.Fail("HTTPS and same-origin access are required."));
        string value = Request.Headers.Authorization.ToString();
        if (value.Length > 2048 || !AuthenticationHeaderValue.TryParse(value, out var header) ||
            !header.Scheme.Equals("Basic", StringComparison.OrdinalIgnoreCase) || header.Parameter is null)
            return Task.FromResult(AuthenticateResult.NoResult());
        string supplied;
        try { supplied = new UTF8Encoding(false, true).GetString(Convert.FromBase64String(header.Parameter)); }
        catch (Exception error) when (error is FormatException or DecoderFallbackException)
        { return Task.FromResult(AuthenticateResult.Fail("Invalid credentials.")); }
        byte[] expected = SHA256.HashData(Encoding.UTF8.GetBytes(Options.Username + ":" + Options.Password));
        if (Options.Password.Length < 32 || !CryptographicOperations.FixedTimeEquals(expected, SHA256.HashData(Encoding.UTF8.GetBytes(supplied))))
            return Task.FromResult(AuthenticateResult.Fail("Invalid credentials."));
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "deployment:" + Options.Username),
            new Claim(ClaimTypes.Name, Options.Username)], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        if (Request.IsHttps) Response.Headers.WWWAuthenticate = "Basic realm=\"TX Text Control private sample\", charset=\"UTF-8\"";
        Response.Headers.CacheControl = "no-store";
        return Task.CompletedTask;
    }
}
