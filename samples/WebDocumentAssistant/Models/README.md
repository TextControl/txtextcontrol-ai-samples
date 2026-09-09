# Application-owned models

Place one or more `.gguf` files in this directory. The Runtime tab scans this folder and lets an administrator select which model to load.

Model weights are deliberately excluded from source control, builds, and NuGet packages. You can change `LocalAI:ModelDirectory` in `appsettings.json` to use an absolute shared model directory instead.
