# Security

These are reference applications, not a certified multi-tenant service. Minimal hosts are development-only and accept loopback peers only. Full hosts require explicit production credentials; keep TLS validation enabled, restrict ingress, and use a real identity provider and separate user/admin roles for shared deployments.

Never commit service keys, passwords, certificates, signing keys, GGUF files, Knowledge databases, uploaded documents, exports or logs containing document text. Use development user secrets, environment variables or a deployment secret store. `.gitignore` does not remove secrets that were already committed.

Report security concerns privately through [Text Control support](https://www.textcontrol.com/support/). Do not post credentials, private documents or exploit details in a public issue. Include affected package versions, platform and a minimal sanitized reproduction.

Run the release validation script with `-ReleaseGate` before distributing builds. A known high-severity SQLite advisory in the current candidate remains a release blocker; see [release readiness](docs/release-readiness.md).
