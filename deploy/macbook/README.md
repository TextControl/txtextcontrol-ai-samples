# Apple Silicon: native AI plus Linux web/MCP

This private single-user bundle retains the full TXTextControl.AI.Web application. AI.Service and llama-server run natively on macOS ARM64, while the Document Editor/web host and MCP run in Linux amd64 Docker containers. Docker Desktop must support amd64 emulation. Models, runtime and Knowledge belong on the native AI host.

## Build from this public sample collection

With .NET 10 SDK, .NET 8 runtime/SDK, PowerShell 7, the published packages and required TX licensing:

```sh
pwsh -File scripts/New-MacBookBundle.ps1
```

This builds all three components from **package-only sample projects in this repository**. No sibling repository, library implementation source or signing key is required. AI.Service is framework-dependent and has no apphost or bundled .NET runtime. Copy the resulting `artifacts/macbook-bundle-...` directory to the Mac. Do not copy your working repository's models, databases, ignored artifacts or certificates.

Use `-ReleaseGate` for release validation; it rejects vulnerable dependency restores for each target runtime. Without that switch, advisories remain visible so a maintainer can investigate a candidate build; the output is not automatically release-approved.

The script prepares a bundle; it does not publish it or certify redistribution rights. Resolve the candidate SQLite advisory and all [release gates](../../docs/release-readiness.md) before distributing binaries. The source-checkout Dockerfiles are under deploy/docker; bundle-local Dockerfiles build prepublished files instead.

## Set up the Mac

1. Install Docker Desktop for Apple Silicon and enable amd64 emulation. Install Homebrew.
2. Install the tools: `brew install mkcert llama.cpp`. Install the Microsoft ARM64 .NET 8 SDK, for example `brew install --cask dotnet-sdk@8`. Both Microsoft.NETCore.App 8 and Microsoft.AspNetCore.App 8 must be listed by `dotnet --list-runtimes`.
3. In the copied bundle, run `bash setup.sh`.
4. Put your approved chat GGUF and optional embedding GGUF in `~/Library/Application Support/TXTextControl AI/models/`.
5. Run `bash start.sh`, keep the terminal open, and open `https://localhost:8443`.

Setup explicitly asks mkcert to install a local CA. It generates separate random web-login, MCP-admin and server-to-server credentials. Read the usernames/passwords from `~/Library/Application Support/TXTextControl AI/login.txt`. Never share that file, credential files or the CA private key. Existing complete credentials are preserved; incomplete sets cause setup to stop rather than rotating keys unexpectedly.

The full web UI uses its existing remote service mode. Open Runtime, verify the remote AI connection, select a model and load it. The native Homebrew llama-server path is supplied explicitly: do not install a Windows/Linux runtime on this Mac. Homebrew runtime versions are independent of the managed download catalog. Verify model compatibility when upgrading.

## Storage and lifecycle

- `bash start.sh` starts web/MCP containers and the native AI service. Ctrl+C stops those processes; no unrelated process is killed.
- `bash stop.sh` stops containers only; stop the native service in its start terminal too.
- Private state is under `~/Library/Application Support/TXTextControl AI`, outside the bundle. Back it up while services are stopped. No stop script deletes state.
- Web App_Data and artifacts plus MCP documents/configuration are persistent mounts. The AI host owns Knowledge and embedding configuration.
- Restart the AI service after changing global embedding settings, then reindex. TXT/Markdown extraction is local; DOCX/RTF/PDF/TX/HTML extraction goes to MCP in Linux.
- Use `TX_CONTEXT_SIZE=16384 bash start.sh` on limited RAM. Actual requirements depend on model size and simultaneous embeddings. The default is 32768; no model loads automatically.

## Security and troubleshooting

Web 8443 and MCP 58506 are bound to the Mac loopback interface. AI.Service listens on HTTPS 5081 on host interfaces so Docker can connect; restrict it with host firewall/network policy. It requires the strong service credential. Inference ports remain loopback-only. TLS validation stays enabled; only the public CA certificate is mounted into the web container.

The web login uses HTTPS Basic authentication for one private administrator. Use a separate browser profile to end that browser-managed login. This is not a shared/public identity architecture. MCP has a separate admin password and authenticated document APIs. Containers run as the Mac UID/GID with dropped capabilities and no Docker socket mount.

Check `docker compose logs --tail=100 web` / `mcp` and the AI terminal for failures. Check ARM64 `dotnet --info`, runtime availability, certificate trust/expiry, native libraries and available RAM. If macOS blocks a native binary, verify provenance and use the platform's normal approval process; these scripts do not disable Gatekeeper or remove quarantine.

Native Mac/Metal and Docker emulation must be smoke-tested on the target Mac before release. Test Chat, Studio selection/editing, PDF downloads, runtime controls, Knowledge indexing and remote authentication—not only `/health`.

In a generated bundle, repository-relative documentation links may not resolve; use the public sample repository's documentation for the complete API and security guides.
