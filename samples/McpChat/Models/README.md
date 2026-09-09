# Application models

Place GGUF model files used by `TXTextControl.MCP.LocalAI` in this directory. Model weights are application-owned and intentionally excluded from source control and NuGet packages.

`appsettings.json` selects the model at runtime through `ModelPath`. Relative paths are resolved from the directory containing that configuration file. GGUF files are not copied during normal builds; deploy or mount the configured file with the consuming application.
