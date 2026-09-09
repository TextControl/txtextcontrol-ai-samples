# Security and deployment boundaries

MinimalWeb and MinimalMcpHost are deliberately loopback-only Development samples. The full web sample also restricts its unauthenticated Development mode to loopback. Do not use Development as a workaround for deployment authentication.

Outside Development, the full web sample requires its explicit private-deployment login. The full MCP host requires a strong separate admin password and mandatory bearer authentication, and rejects non-HTTPS requests. AiService requires a service key, enforces authenticated policies and permits plain HTTP only with explicit loopback opt-in.

These helpers serve private single-user deployments. For public/shared use, implement OIDC or another supported identity provider, stable tenant/user ownership, separate admin/user policies, rate limits, ingress restrictions, logging redaction and backups. Do not place service delegation keys in browser code. Keep inference/worker ports private.

The remote service URL is allowlisted and credentials are endpoint-scoped. Trust real certificates on the calling machine; do not add trust-all certificate callbacks. When using a reverse proxy, configure trusted forwarding deliberately rather than accepting arbitrary forwarded headers. The samples expect TLS on protected hops and do not auto-trust forwarding.

User secrets are only for local development. Use a deployment secret store/environment injection for production. Do not include generated documents, credentials, models, private databases or signing files in source ZIPs. Store application data in private persistent volumes and back up while writers are stopped.

See [Docker](../deploy/docker/README.md), [Apple Silicon](../deploy/macbook/README.md), [SECURITY.md](../SECURITY.md) and [release gates](release-readiness.md). Third-party/model/native redistribution rights must be checked separately from whether a publish command succeeds.
