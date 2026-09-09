# Third-party software and assets

The sample application source is covered by [LICENSE.txt](LICENSE.txt). That license does not replace dependency licenses or grant rights to redistribute commercial TX Text Control binaries, fonts or model weights.

- TX Text Control SDK, Document Editor and Markdown packages: inspect each package's license and product licensing requirements at [Text Control](https://www.textcontrol.com/).
- Microsoft .NET / ASP.NET Core, Microsoft.Extensions.AI, SQLite and their transitive components: preserve the notices and licenses supplied by the actual restored packages and deployment runtimes.
- Model Context Protocol C# SDK and Markdig: inspect the license metadata supplied with the resolved packages.
- llama.cpp is provisioned separately. Preserve its license and any backend/library notices when distributing a runtime; record and test its version.
- GGUF model weights are application-owned and have model-specific terms. This repository does not distribute or license model weights.
- Text Control logos and names are trademarks; branding does not imply permission to present modified applications as official products.
- The web sample requests Montserrat from Google Fonts. That creates an external browser request. Review the font's license before self-hosting; do not claim this UI is fully offline until external assets are replaced with licensed local copies.
- Document fonts are supplied by SDK packages at build/publish time. Preserve their individual notices when redistributing published output.

This is an inventory, not a replacement for upstream license texts or a completed legal review. Before publishing binary deployment bundles, generate a dependency inventory/SBOM and verify licenses and redistribution rights for the exact included versions and assets.
