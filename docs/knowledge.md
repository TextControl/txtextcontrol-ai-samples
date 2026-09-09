# Reference knowledge

Knowledge runs on the host owning AI integration: the web process in local mode, or AiService in remote mode. The full web UI provides the same administration experience in both modes.

1. Create/select a collection.
2. Upload approved reference documents and watch the bounded indexing activity panel.
3. Browse active sources or test retrieval. Failed indexing does not silently replace the previous active version.
4. Select reference knowledge in Chat/Document Studio when you want it used as retrieval context.

Global embedding configuration is optional and independent of collections. Keyword retrieval works without an embedding model. To add semantic retrieval, configure an embedding GGUF and its correct dimensions/pooling/prefixes, restart the AI-owning host and reindex. A chat GGUF is not automatically an embedding model.

Collection/source ownership and approved context are distinct from instructions to modify a document. Reference content is data, not permission to run tools. Only enable explicitly requested document changes for workflows that need it.

TXT/Markdown extraction is local. DOCX, RTF, PDF, TX and HTML extraction uses the configured Windows/Linux MCP endpoint and its scoped credentials. Scanned PDF pages require OCR before ingestion. Private databases and uploaded bytes must remain outside source control and public web roots.

See [Knowledge API](api/TXTextControl.AI.Knowledge.md), [ASP.NET integration](api/TXTextControl.AI.AspNetCore.md), [detailed Knowledge design](private-knowledge.md) and [remote host setup](remote-ai-service.md).
