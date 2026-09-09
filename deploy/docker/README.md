# Linux container builds

Build from the **sample repository root** after the pinned NuGet packages are available:

```sh
docker build --platform linux/amd64 -f deploy/docker/Dockerfile.web -t txtextcontrol-ai-web .
docker build --platform linux/amd64 -f deploy/docker/Dockerfile.mcp -t txtextcontrol-mcp .
```

These multi-stage builds restore binary packages, not private source projects. Native TX document components target Linux amd64 here; Apple Silicon uses Docker Desktop emulation. The AI engine may run natively on a separate host. These images do not contain models, credentials or a configured TLS certificate and intentionally cannot be deployed securely by a bare `docker run`.

For the ready-to-configure private Apple Silicon arrangement, use [the MacBook bundle](../macbook/README.md). It supplies Compose, generated credentials, local TLS and private persistent mounts.

For another environment, configure:

- Web: DeploymentAuthentication credentials, approved RemoteIntegration service URL/key, HTTPS certificate/key, writable private App_Data and artifacts volumes.
- MCP: Admin credentials, McpServiceAuthentication:Required plus API key, HTTPS certificate/key, writable document storage and (when using admin persistence) a writable appsettings.json mounted outside the image.
- AiService: separate process/service with its credential, exact MCP endpoint allowlist/token, model/runtime directories and private Knowledge storage. See [remote service](../../docs/remote-ai-service.md).

Run as a non-root user, grant only required volume access, expose only intended ingress ports and retain TLS verification. Base images use major-version tags; rebuild and retest to apply updates. Do not treat build success as native runtime validation or permission to redistribute commercial SDK files. See [security](../../docs/security-and-deployment.md) and [notices](../../THIRD-PARTY-NOTICES.md).
