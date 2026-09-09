using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace TXTextControl.AI.Web;

// Developer sample only: the local machine's user may administer a loopback host.
// Production hosts should replace this scheme with their authenticated administrator policy.
public sealed class LoopbackAdminAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string host = Request.Host.Host.Trim('[', ']');
        bool localHost = host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address);
        bool localPeer = Context.Connection.RemoteIpAddress is { } peer && IPAddress.IsLoopback(peer);
        string origin = Request.Headers.Origin.ToString();
        bool sameOrigin = origin.Length == 0 || Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
            uri.GetLeftPart(UriPartial.Authority).Equals(Request.Scheme + "://" + Request.Host, StringComparison.OrdinalIgnoreCase);
        if (!localHost || !localPeer || !sameOrigin || Request.Headers["Sec-Fetch-Site"] == "cross-site")
            return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, "Local developer")], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
