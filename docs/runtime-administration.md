# Runtime installation and administration

NuGet packages contain managed integration code, not native inference runtimes.
Neither restore/build nor ordinary startup downloads executables. The default is
`RuntimeAcquisitionPolicy.NeverDownload` (`LocalAI:AutoInstallRuntime = false`).
Model weights, GPU drivers and system packages are always supplied separately.

## Package responsibilities

| Component | Responsibility |
| --- | --- |
| TXTextControl.AI.LlamaServer | Pinned runtime catalog, downloads, verification, extraction, compatibility probes, cache and process lifecycle |
| TXTextControl.AI | Public `LocalRuntime` setup/inspection/removal APIs |
| TXTextControl.AI.AspNetCore | Installation job service, protected opt-in HTTP endpoints and browser client |
| Web sample | Admin panel markup, layout, styles and sample authentication |
| MCP server | Independent document processing; no inference runtime installation |

## First run in the web sample

1. Start the sample and open **Runtime** on the integration host.
2. Choose a supported backend. The panel shows platform, pinned version, download
   size and a hardware recommendation. A recommendation is only a local device hint.
3. Select **Install runtime**. Progress covers download, verification/extraction and
   compatibility testing. Cancel stops the job and removes its staging files. Retry
   starts a fresh download; partial downloads are not resumed.
4. Select the corresponding inference backend and your local GGUF model, then use
   the existing configuration/load controls. Installing alone does not load a model.

Closing the browser does not cancel a download; the integration service owns the job.
Host shutdown requests cancellation. Later startup reuses a managed installed runtime
without querying GitHub. A missing runtime leaves the application available for setup,
but inference cannot start until setup is complete.

The panel is sample-owned. Applications can build entirely different interfaces with
the same API; no Razor pages or branding are pulled into an application by AspNetCore.

## Public .NET API

```csharp
using TXTextControl.AI;

var options = new LocalModelOptions
{
    HardwareBackend = HardwareBackend.Cpu,
    // Optional: persistent writable directory owned by the application/service account.
    // RuntimeCacheDirectory = "/var/lib/my-application/runtimes"
};

var status = await LocalRuntime.InspectAsync(options);
var progress = new Progress<ModelLoadProgress>(p =>
    Console.WriteLine($"{p.Stage}: {p.Fraction:P0}"));
string executable = await LocalRuntime.InstallAsync(options, progress, cancellationToken);

// Offline lookup: returns the installed path; does not download by default.
string installed = await LocalRuntime.EnsureAvailableAsync(options);

// After disposing all models/hosts using this installation:
// await LocalRuntime.RemoveAsync(status.Installed[0].Id, options);
```

The `cancellationToken` above comes from your application's setup operation.
`Inspect` is a synchronous catalog/cache read. `InspectAsync` additionally uses cached
local hardware hints; neither contacts upstream or downloads files. Auto recommends
CUDA for detected NVIDIA devices on Windows, Vulkan for detected supported device
hints on Linux, otherwise CPU. Administrators can override it. Windows AMD/Intel
devices may require explicitly choosing Vulkan. Failed GPU probes are reported;
the installer does not silently switch backends. Choose CPU if necessary.

For explicitly unattended setup, set
`RuntimeAcquisition = RuntimeAcquisitionPolicy.DownloadIfMissing` in `LocalModelOptions`,
or `LocalAI:AutoInstallRuntime = true` in the web integration configuration.
This allows model loading to install a missing runtime. It is not the default and
does not acquire model weights or change system drivers.

## Web endpoints and authorization

Register `AddTextControlAI` as usual. Configure real host authentication and an
administrator policy, then call:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.MapTextControlAIRuntimeAdministration("AiAdministrators");
```

Do not omit your authentication registration or policy definition. These are host
responsibilities; the package does not create accounts or grant administrator access.

| Method and default route | Request |
| --- | --- |
| GET `/api/runtime-installation` | None; returns catalog, installed IDs and job state |
| POST `/api/runtime-installation/install` | `{ "backend": "Cpu" }` (also Auto, Cuda, Vulkan) |
| POST `/api/runtime-installation/source` | `{ "version": "b10621", "baseUrl": "https://your-mirror.example/releases", "assets": [] }` |
| POST `/api/runtime-installation/cancel` | None |
| POST `/api/runtime-installation/unload` | None; stops the currently loaded model |
| POST `/api/runtime-installation/remove` | `{ "installationId": "<ID returned by GET>" }` |

All routes require the named authorization policy. Mutations additionally require
`X-TextControl-Runtime-Admin: 1`; the shared client supplies this automatically.
Use restrictive same-origin/CORS rules and HTTPS for network deployments. The header
is a cross-site form defense, not authentication. Installation accepts only configured
backend choices. A separate privileged `/source` operation lets administrators set a
fixed release, HTTPS mirror, and pinned asset manifest; it cannot set filesystem paths.
See [engine releases and mirrors](runtime-download-sources.md) for setup and persistence.

The sample's `LoopbackAdminAuthenticationHandler` is for local development: it permits
only loopback peers/hosts and rejects mismatched origins and cross-site requests.
It is **not production identity authentication**. Replace it with your real admin
policy for shared hosting, reverse proxies or deployments with multiple users.
Protect the existing model/runtime configuration endpoints with that policy too.

The browser client provides:

```javascript
const ai = new TXTextControlAI.Client({ apiBaseUrl: "/api" });
await ai.installRuntime("Cpu"); // Job accepted, not necessarily finished.
const status = await ai.runtimeInstallation(); // Poll until installed/failed/cancelled.
// await ai.cancelRuntimeInstallation();
// await ai.unloadModel();
// await ai.removeRuntime(status.runtime.installed[0].id);
```

With a remote integration service, install on that service host and expose its admin
UI through an authenticated same-origin proxy. The sample retains the same Runtime
and Knowledge screens in remote mode. Set/test the approved AI API URL in Runtime's
Integration service panel. See [Remote AI service](remote-ai-service.md).

## Catalog and compatibility

The bundled default is official llama.cpp release `b10621` (upstream revision
`c1d0e7a004015f23bc0233470b747b596f29b264`). Its compressed sizes and SHA-256 digests
are compiled into `LlamaServerRuntimeManager`. `RuntimeDownload` can override the
release and HTTPS download root; other releases require their own approved asset
manifest. No latest-release lookup is used.
Windows CUDA uses the CUDA 12.4 runtime plus the corresponding runtime-library archive.
Upstream binaries and included third-party licenses retain their own terms.

| Platform | Catalog backends | Prerequisites/limitations |
| --- | --- | --- |
| Windows x64 | CPU, CUDA, Vulkan | Compatible CPU/system libraries; compatible NVIDIA/Vulkan drivers for GPU |
| Linux x64/glibc | CPU, Vulkan | Upstream Ubuntu-compatible glibc/system libraries, including `libgomp.so.1` (`libgomp1` on Ubuntu); Vulkan drivers for GPU |
| Linux CUDA, musl, ARM64, macOS | No managed download | Supply an appropriate explicit runtime or external endpoint |

Archive integrity is checked before extraction. A CPU version probe or GPU device
probe must succeed before activation. This is a startup compatibility check, not a
guarantee that every model fits in memory or every inference operation is supported.
Missing dependencies cause a visible error; the installer does not install OS packages.

The installer checks for Linux `libgomp.so.1` before downloading any archive. The
status API exposes `installationBlocker`, and the sample disables installation with
instructions naming the missing package and the Linux host that needs it. Refresh
after installing the prerequisite. CPU/Vulkan device validation still runs after
extraction, so this check does not replace full backend compatibility testing.

Validation on the implementation machine: Windows CPU download/hash/extraction/probe
and offline reuse succeeded. Ubuntu x64 download/hash/extraction succeeded, but the
probe failed because `libgomp.so.1` was absent; staging was cleaned and no runtime was
activated. GPU and complete Linux inference qualification remain deployment tests.

Bundled catalog updates require a package update, but hosts can configure custom
releases and reviewed asset digests without rebuilding. Existing versions remain
side-by-side; new versions are not downloaded until explicitly installed or a host
opts into automatic acquisition. No silent in-place runtime upgrade occurs.

## Storage and offline deployment

Default cache uses .NET `LocalApplicationData`:

An omitted, JSON `null`, empty or whitespace-only `RuntimeCacheDirectory` selects this
default. This also handles configuration providers that bind JSON `null` as an empty string.

- Windows: `%LOCALAPPDATA%\TXTextControl.AI\runtimes\llama.cpp`.
- Linux: typically `$HOME/.local/share/TXTextControl.AI/runtimes/llama.cpp`, respecting
  the process account's .NET/XDG data directory.

Set `LocalAI:RuntimeCacheDirectory`/`LocalModelOptions.RuntimeCacheDirectory` explicitly
for service accounts or containers and mount a persistent writable volume. Use a
directory owned by the service account, not writable by untrusted users. Downloads
need free space for both compressed archives and extracted files during installation.
Unique staging directories, an in-process gate, and a cross-process installation lock
prevent competing installation jobs from activating partial files.

For offline hosts, install and test on a compatible connected machine, copy the complete
managed installation directory (including `runtime-installation.json`), then keep
`NeverDownload`. Alternatively specify `LlamaServerExecutablePath`, the environment
variable `TXTEXTCONTROL_AI_LLAMA_SERVER`, or `LlamaServerEndpoint`. Explicit runtimes
are not downloaded, adopted, or removed by the managed installer. An invalid explicit
executable fails instead of falling back to another executable on PATH.

Legacy script-installed or unmarked cache directories are not silently adopted. Select
their executable explicitly or install a catalog-managed runtime. The old PowerShell
installer remains separate and is not part of this pinned installation workflow.

Removal accepts an enumerated managed ID only and is permanent (reinstalling downloads
it again). The web service rejects removal while a model is loaded. Stop all other
hosts sharing the cache before removal as well. Never use a shared writable cache
across mutually untrusted applications.
