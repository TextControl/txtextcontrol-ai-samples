# Configurable engine releases and mirrors

The default is still llama.cpp **b10621**, downloaded from GitHub. It does not mean
"latest". Both the release and the HTTPS mirror root are configurable without
rebuilding the NuGet packages. The separate MCP document server is unaffected.

## Web sample

Open **Runtime → Engine release and download source**:

1. Unload the model.
2. Set **Release** and **Download base URL**.
3. For b10621 with the bundled archives, leave **Custom asset manifest** as `[]`.
   A mirror must serve byte-identical files with the original filenames.
4. For a different release, provide a JSON array of approved assets (see below).
5. Select **Apply download settings**, then install the backend and load your model.

Applying settings does not download an engine, delete previous installations, or
switch a running model. Changes affect this integration host, not other applications.
The sample persists overrides in `App_Data/runtime-download.json`, outside `wwwroot`,
and excludes that file from source control and publishing. The file takes precedence
over `LocalAI:RuntimeDownload` on restart; remove the override while the host is stopped
to return to appsettings. Multiple hosts should not share this settings file.

## Package configuration

```csharp
using TXTextControl.AI;
using TXTextControl.AI.LlamaServer;

var options = new LocalModelOptions
{
    HardwareBackend = HardwareBackend.Cpu,
    RuntimeDownload = new RuntimeDownloadOptions
    {
        Version = "b10621",
        BaseUrl = "https://engines.example.com/llama/releases/download"
    }
};
// Your mirror must exist and contain the original archives.
await LocalRuntime.InstallAsync(options);
// Pass the same options to LocalLanguageModel.LoadAsync when loading a model.
```

The lower-level `LlamaServerModelOptions` has the same `RuntimeDownload` property.
Default policies still prohibit automatic downloads. `DownloadIfMissing` is an
explicit opt-in and uses these same settings during model loading.

For ASP.NET Core, configure `LocalAI:RuntimeDownload` (or `WebAiOptions.RuntimeDownload`):

```json
{
  "LocalAI": {
    "RuntimeDownload": {
      "Version": "b10621",
      "BaseUrl": "https://engines.example.com/llama/releases/download",
      "Assets": []
    },
    "RuntimeDownloadSettingsFile": "App_Data/runtime-download.json"
  }
}
```

`RuntimeDownloadSettingsFile` is optional in the package. If omitted, admin changes
last only until host restart. Relative paths resolve against the host content root.
Use an application-owned persistent volume for containers; keep the settings file
private and writable only by the service/administrator. Invalid saved settings fail
startup instead of silently falling back to a different engine.

## A different release

The download address is exactly:

```text
{BaseUrl}/{Version}/{FileName}
```

`Version` is a fixed identifier, not `latest`. A custom release requires **every
archive needed by each supported platform/backend**, including CUDA dependency
archives. `Assets` is a JSON array with entries having these properties:

| Property | Value |
| --- | --- |
| `platform` | `win-x64` or `linux-x64` |
| `backend` | `Cpu`, `Cuda`, or `Vulkan` (case-sensitive) |
| `fileName` | Exact plain archive filename ending in `.zip` or `.tar.gz` |
| `bytes` | Exact archive length, a positive integer |
| `sha256` | Approved archive digest, 64 hexadecimal digits |

Supply this list as `RuntimeDownload.Assets` in .NET/configuration or paste it into
the admin panel. Obtain sizes and digests from a trusted release process and test
the runtime/model/driver combination before rollout. The installer never downloads
an unverified catalog from the configured mirror or substitutes old release hashes.
Backends absent from your manifest are unavailable; a custom manifest replaces,
rather than merges with, the bundled catalog.

HTTPS is required. Credentials, query parameters, fragments, arbitrary per-asset
URLs and filesystem paths are not accepted. This feature does not add authenticated
mirror support. Archive size and SHA-256 verification remain mandatory. The existing
compatibility probe must pass before an installation is activated. Custom releases
are host-approved, not certified by the package; no new OS/architecture support is
implied. Models, drivers and OS dependencies remain separate.

Different versions are cached separately. Custom asset definitions also contribute
to the cache ID so changing a digest cannot reuse an older installation. Changing
only the mirror can reuse the same verified installation. Older runtimes remain
available for rollback by restoring their release/manifest settings.

## Protected admin API

`POST /api/runtime-installation/source` accepts the `RuntimeDownloadOptions` JSON
object. It uses the runtime-administration authorization policy and requires
`X-TextControl-Runtime-Admin: 1`. The shared client exposes
`configureRuntimeDownload({ version, baseUrl, assets })` and supplies that header.
Invalid definitions return 400; a loaded model or busy runtime manager returns 409.
Persistence errors do not apply the new settings.

Treat this as a privileged executable-source setting. Only trusted administrators
may change it; enforce network egress restrictions where required. The sample's
loopback development identity is not a production administrator identity.

## Verification

Tests cover mirror URL construction, unsafe input rejection, custom release/asset
validation, facade option mapping, cache isolation, download checksum rejection,
protected HTTP mutations, and persistence across host restart. Tests use fake archive
responses: no unapproved engine is downloaded or executed to verify this feature.
