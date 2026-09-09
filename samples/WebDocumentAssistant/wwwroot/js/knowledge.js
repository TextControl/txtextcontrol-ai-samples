/* Sample-owned rendering. All transport and document binding stay in the reusable SDK. */
(() => {
    "use strict";
    const client = new TXTextControlAI.Client(window.textControlAIWorkspace);
    const q = selector => document.querySelector(selector);
    const status = q("[data-knowledge-status]"), scope = q("[data-knowledge-select]"), collection = q("[data-knowledge-admin-select]");
    let enabled = false, refreshing = false;
    const report = message => { status.textContent = message; };
    const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
    const button = (label, action) => {
        const node = element("button", label, "secondary-button"); node.type = "button";
        node.addEventListener("click", async () => { node.disabled = true; try { await action(); } catch (error) { report(error.message); } finally { node.disabled = false; } });
        return node;
    };
    const bind = (form, action, onError = report) => q(form).addEventListener("submit", async event => {
        event.preventDefault(); const submit = event.target.querySelector("button"); submit.disabled = true;
        try { await action(new FormData(event.target)); } catch (error) { onError(error.message); } finally { submit.disabled = false; }
    });
    const contextLabel = () => {
        const studio = q('[data-tab="document"]')?.classList.contains("is-active");
        q("[data-knowledge-context]").textContent = scope.value
            ? `${studio ? "Current document + " : "Chat/current attachment + "}reference knowledge · ${q("[data-knowledge-edit]").checked ? "explicit changes permitted" : "read-only"}`
            : "No reference knowledge · current workflow only";
    };
    const clearCollectionViews = () => {
        for (const selector of ["[data-knowledge-jobs]", "[data-knowledge-sources]", "[data-knowledge-results]"]) q(selector).replaceChildren();
    };
    const collectionControls = () => {
        q("[data-knowledge-rename]").disabled = !collection.value;
        q("[data-knowledge-delete]").disabled = !collection.value;
    };
    const collections = async () => {
        const items = await client.knowledgeCollections();
        const previous = scope.value, adminPrevious = collection.value;
        scope.replaceChildren(new Option("None · current workflow only", "")); collection.replaceChildren(new Option("Select a collection", ""));
        for (const item of items) { scope.add(new Option(item.name, item.id)); collection.add(new Option(item.name, item.id)); }
        scope.value = previous; collection.value = adminPrevious;
        if (!scope.value) {
            scope.value = ""; q("[data-knowledge-edit]").checked = false;
            q("[data-knowledge-version]").replaceChildren(new Option("All active sources", ""));
        }
        if (!collection.value) { collection.value = ""; clearCollectionViews(); }
        collectionControls(); contextLabel();
    };
    const openSource = async source => {
        // Reauthorize/re-resolve on every click. Never call the Document Editor or document export APIs.
        const current = await client.resolveKnowledgePassage(source.collectionId, source.id);
        const dialog = element("dialog", null, "knowledge-dialog");
        const heading = element("h2", current.fileName); const locator = element("p", `${current.locator} · version ${current.versionId.slice(0, 12)}`);
        const text = element("pre", current.text);
        const link = element("a", "Download reference source", "primary-button"); link.href = client.knowledgeSourceUrl(current.collectionId, current.versionId); link.target = "_blank"; link.rel = "noopener noreferrer";
        const close = button("Close", () => dialog.close());
        dialog.append(heading, locator, text, link, close); document.body.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true }); dialog.showModal();
    };
    const renderCitations = (container, result) => {
        if (!result.knowledgeMode) return;
        const section = element("section", null, "knowledge-citations");
        section.append(element("small", `${result.knowledgeMode} reference evidence · citations identify supplied passages, not proof of every claim.`));
        for (const citation of result.citations || []) {
            section.append(button(`[${citation.citationId}] ${citation.source.fileName} · ${citation.source.locator}`, async () => {
                try { await openSource(citation.source); } catch { section.append(element("p", "This source is unavailable or you no longer have access.")); }
            }));
        }
        if (!result.citations?.length) section.append(element("p", "No source citations were supplied in this answer. Treat private-document claims as unverified."));
        container.append(section);
    };
    window.sampleKnowledge = {
        scope: () => enabled && scope.value ? { collectionId: scope.value, allowDocumentChanges: q("[data-knowledge-edit]").checked, sourceVersionId: q("[data-knowledge-version]").value || null } : null,
        renderCitations
    };
    const renderJobs = (id, jobs) => {
        const host = q("[data-knowledge-jobs]");
        if (!host.firstChild) {
            const consolePanel = element("section", null, "knowledge-job-console");
            const header = element("div", null, "knowledge-job-header");
            const summary = element("span"); summary.dataset.jobSummary = ""; summary.setAttribute("role", "status");
            header.append(element("strong", "Indexing activity"), summary);
            const log = element("div", null, "knowledge-job-log"); log.dataset.jobLog = "";
            log.tabIndex = 0; log.setAttribute("role", "region"); log.setAttribute("aria-label", "Indexing jobs, newest first");
            consolePanel.append(header, log); host.append(consolePanel);
        }
        const summary = host.querySelector("[data-job-summary]");
        const active = jobs.filter(job => ["Running", "Queued"].includes(job.state)).length;
        const failed = jobs.filter(job => ["Failed", "Interrupted"].includes(job.state)).length;
        const statusText = jobs.length ? `${jobs.length} recent · ${active} active · ${failed} need attention` : "No jobs yet";
        if (summary.textContent !== statusText) summary.textContent = statusText;
        const log = host.querySelector("[data-job-log]"), scrollTop = log.scrollTop;
        const existing = new Map([...log.querySelectorAll("[data-job-id]")].map(row => [row.dataset.jobId, row]));
        const liveIds = new Set(jobs.map(job => job.id));
        for (const [jobId, row] of existing) if (!liveIds.has(jobId)) row.remove();
        log.querySelector(".knowledge-job-empty")?.remove();
        if (!jobs.length) log.append(element("div", "Upload documents to see indexing progress here.", "knowledge-job-empty"));
        jobs.forEach((job, index) => {
            let row = existing.get(job.id);
            if (!row) {
                row = element("div", null, "knowledge-job-row"); row.dataset.jobId = job.id;
                const state = element("span", null, "knowledge-job-state");
                const progress = element("span", null, "knowledge-job-progress");
                const name = element("span", job.fileName, "knowledge-job-name"); name.title = job.fileName;
                const actions = element("div", null, "knowledge-job-actions");
                const error = element("details", null, "knowledge-job-error"); error.hidden = true;
                const errorText = element("pre"); error.append(element("summary", "Error details"), errorText);
                row.append(state, progress, name, actions, error);
                row.jobParts = { state, progress, name, actions, error, errorText };
            }
            const parts = row.jobParts;
            if (parts.state.textContent !== job.state) {
                parts.state.textContent = job.state;
                row.dataset.state = job.state;
                parts.actions.replaceChildren();
                const action = (label, retry) => {
                    const control = button(label, async () => { await client.changeKnowledgeJob(id, job.id, retry); await refresh(); });
                    control.setAttribute("aria-label", `${label} indexing ${job.fileName}`); return control;
                };
                if (["Failed", "Interrupted"].includes(job.state)) parts.actions.append(action("Retry", true));
                if (!["Complete", "Unchanged", "Cancelled"].includes(job.state)) parts.actions.append(action("Cancel", false));
            }
            const progressText = `${job.progress}%`;
            if (parts.progress.textContent !== progressText) parts.progress.textContent = progressText;
            parts.error.hidden = !job.error;
            if (parts.errorText.textContent !== (job.error || "")) parts.errorText.textContent = job.error || "";
            // Keep row nodes stable: polling must not steal focus, collapse errors or reset scrolling.
            if (log.children[index] !== row) log.insertBefore(row, log.children[index] || null);
        });
        log.scrollTop = scrollTop;
    };
    const renderSources = (id, sources) => {
        const host = q("[data-knowledge-sources]");
        if (!host.firstChild || host.sourceBrowser?.id !== id) {
            const panel = element("details", null, "knowledge-source-browser");
            const summary = element("summary");
            const title = element("strong", "Sources"), count = element("span", null, "knowledge-source-count");
            summary.append(title, count, element("span", "Browse and manage", "knowledge-source-hint"));
            const body = element("div", null, "knowledge-source-body");
            const label = element("label", "Find a source"), search = element("input");
            search.type = "search"; search.placeholder = "Filter by filename…"; label.append(search);
            const list = element("div", null, "knowledge-source-list");
            const pager = element("nav", null, "knowledge-source-pager"); pager.setAttribute("aria-label", "Source pages");
            const previous = element("button", "Previous", "secondary-button"), next = element("button", "Next", "secondary-button");
            previous.type = next.type = "button";
            const pageLabel = element("span"); pageLabel.setAttribute("role", "status");
            pager.append(previous, pageLabel, next); body.append(label, list, pager); panel.append(summary, body);
            host.replaceChildren(panel);
            let items = [], page = 0, signature = null;
            const pageSize = 5;
            const draw = () => {
                const query = search.value.trim().toLocaleLowerCase();
                const matches = items.filter(source => source.fileName.toLocaleLowerCase().includes(query));
                page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
                const openRows = new Set([...list.querySelectorAll("details[open]")].map(row => row.dataset.documentId));
                list.replaceChildren();
                for (const source of matches.slice(page * pageSize, (page + 1) * pageSize)) {
                    const row = element("details", null, "knowledge-source-row"); row.dataset.documentId = source.documentId; row.open = openRows.has(source.documentId);
                    const rowSummary = element("summary"), name = element("span", source.fileName, "knowledge-source-name"); name.title = source.fileName;
                    rowSummary.append(name, element("span", `${source.chunkCount} passages`, "knowledge-source-size"));
                    const version = element("small", `Active version ${source.versionId}`, "knowledge-source-version");
                    const actions = element("div", null, "knowledge-source-actions");
                    const link = element("a", "Download", "secondary-button"); link.href = client.knowledgeSourceUrl(id, source.versionId); link.target = "_blank"; link.rel = "noopener noreferrer";
                    actions.append(link, button("Reindex", async () => { await client.reindexKnowledgeSource(id, source.versionId); await refresh(); }), button("Remove", async () => {
                        if (!confirm(`Remove ${source.fileName} and its live indexed passages? This does not erase backups.`)) return;
                        await client.removeKnowledgeSource(id, source.documentId); await refresh();
                    }));
                    row.append(rowSummary, version, actions); list.append(row);
                }
                if (!matches.length) list.append(element("p", items.length ? "No filenames match your search." : "No indexed sources yet. Completed uploads will appear here.", "knowledge-source-empty"));
                previous.disabled = page === 0; next.disabled = (page + 1) * pageSize >= matches.length;
                pageLabel.textContent = matches.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, matches.length)} of ${matches.length}` : "0 sources";
                pager.hidden = matches.length <= pageSize;
            };
            search.addEventListener("input", () => { page = 0; draw(); });
            previous.addEventListener("click", () => { if (page > 0) { page--; draw(); } });
            next.addEventListener("click", () => { page++; draw(); });
            host.sourceBrowser = { id, update: incoming => {
                const ordered = [...incoming].sort((left, right) => left.fileName.localeCompare(right.fileName) || left.documentId.localeCompare(right.documentId));
                const updated = JSON.stringify(ordered);
                if (signature === updated) return;
                signature = updated; items = ordered;
                count.textContent = `${items.length} document${items.length === 1 ? "" : "s"}`;
                draw();
            } };
        }
        host.sourceBrowser.update(sources);
    };
    const refresh = async () => {
        if (!collection.value || refreshing) return;
        refreshing = true;
        try {
            const id = collection.value;
            const [jobs, sources] = await Promise.all([client.knowledgeJobs(id), client.knowledgeSources(id)]);
            if (id !== collection.value) return;
            renderJobs(id, jobs);
            renderSources(id, sources);
        } finally { refreshing = false; }
    };
    bind("[data-knowledge-create]", async form => {
        const created = await client.createKnowledgeCollection(form.get("name")); await collections(); collection.value = created.id; collectionControls(); clearCollectionViews(); await refresh(); report("Collection created. Upload reference documents to begin.");
    });
    const collectionDialog = deleting => {
        const id = collection.value, name = collection.selectedOptions[0]?.text;
        if (!id || !name) return;
        const dialog = element("dialog", null, "knowledge-dialog");
        const title = element("h2", deleting ? "Delete collection" : "Rename collection");
        title.id = "knowledge-collection-dialog-title"; dialog.setAttribute("aria-labelledby", title.id);
        const form = element("form"), label = element("label", deleting ? `Type “${name}” to confirm deletion` : "Collection name");
        const input = element("input"); input.required = true; input.maxLength = 160;
        if (!deleting) input.value = name;
        label.append(input);
        const description = element("p", deleting
            ? `Delete “${name}” and all its stored sources, indexed passages, embeddings and jobs? This cannot be undone here. Original files on your computer, other collections and the open document are unaffected. Backups are not erased.`
            : "The collection keeps its documents, index and existing references. No reindexing is required.");
        const error = element("p"); error.setAttribute("role", "alert");
        const actions = element("div", null, "knowledge-actions"), submit = element("button", deleting ? "Delete collection" : "Save name", "primary-button");
        submit.type = "submit";
        actions.append(button("Cancel", () => dialog.close()), submit);
        input.addEventListener("input", () => input.setCustomValidity(""));
        form.append(label, error, actions);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (deleting ? input.value !== name : !input.value.trim()) {
                input.setCustomValidity(deleting ? "Enter the exact collection name to confirm." : "Enter a collection name."); input.reportValidity(); return;
            }
            submit.disabled = true;
            try {
                if (deleting) await client.deleteKnowledgeCollection(id);
                else await client.renameKnowledgeCollection(id, input.value.trim());
                dialog.close(); await collections();
                report(deleting ? "Collection and its live indexed data deleted. Original files and backups were not changed." : "Collection renamed. Its documents and index are unchanged.");
            } catch (failure) { error.textContent = failure.message; } finally { submit.disabled = false; }
        });
        dialog.append(title, description, form); document.body.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal(); input.focus(); if (!deleting) input.select();
    };
    q("[data-knowledge-rename]").addEventListener("click", () => collectionDialog(false));
    q("[data-knowledge-delete]").addEventListener("click", () => collectionDialog(true));
    q("[data-knowledge-upload]").addEventListener("change", async event => {
        const id = collection.value;
        if (!id) { report("Select a collection first."); return; }
        event.target.disabled = true;
        try {
            const files = [...event.target.files]; if (files.length > 32) throw new Error("Upload at most 32 files per batch.");
            for (const file of files) { if (file.size > 32 * 1024 * 1024) throw new Error(`${file.name} exceeds 32 MB.`); await client.uploadKnowledge(id, file); }
            report("References queued for local indexing. The working document was not changed."); await refresh();
        } catch (error) { report(error.message); } finally { event.target.disabled = false; event.target.value = ""; }
    });
    bind("[data-knowledge-search]", async form => {
        if (!collection.value) throw new Error("Select a collection first.");
        const id = collection.value;
        const result = await client.searchKnowledge({ collectionId: id, query: form.get("query"), mode: Number(form.get("mode")) });
        if (collection.value !== id) return;
        const area = q("[data-knowledge-results]"); area.replaceChildren(element("p", `${["Auto", "Keyword", "Semantic", "Hybrid"][result.mode]} · ${result.passages.length} passages · ${result.estimatedTokens} estimated evidence tokens`));
        for (const passage of result.passages) {
            const card = element("article", null, "knowledge-item"); card.append(button(`${passage.fileName} · ${passage.locator}`, () => openSource(passage)), element("p", passage.text)); area.append(card);
        }
        area.append(element("small", result.notice));
    });
    const embeddingReport = message => { q("[data-knowledge-embedding-status]").textContent = message; };
    const embeddingControls = () => {
        const fields = q("[data-knowledge-embedding]").elements;
        for (const key of ["dimensions", "pooling", "queryPrefix", "documentPrefix"]) fields[key].disabled = !fields.modelFileName.value;
    };
    bind("[data-knowledge-embedding]", async () => {
        const fields = q("[data-knowledge-embedding]").elements;
        const result = await client.configureKnowledgeEmbedding({ modelFileName: fields.modelFileName.value || null, dimensions: Number(fields.dimensions.value), pooling: fields.pooling.value, queryPrefix: fields.queryPrefix.value, documentPrefix: fields.documentPrefix.value });
        embeddingReport(result.message);
    }, embeddingReport);
    q("[data-knowledge-embedding]").elements.modelFileName.addEventListener("change", embeddingControls);
    embeddingControls();
    collection.addEventListener("change", () => { clearCollectionViews(); collectionControls(); refresh().catch(error => report(error.message)); });
    scope.addEventListener("change", async () => {
        q("[data-knowledge-edit]").checked = false; contextLabel();
        const versions = q("[data-knowledge-version]"); versions.replaceChildren(new Option("All active sources", ""));
        const id = scope.value;
        try { if (id) for (const source of await client.knowledgeSources(id)) { if (scope.value !== id) break; versions.add(new Option(`${source.fileName} · ${source.versionId.slice(0, 8)}`, source.versionId)); } }
        catch (error) { report(error.message); }
    });
    q("[data-knowledge-edit]").addEventListener("change", contextLabel);
    document.querySelectorAll("[data-tab]").forEach(tab => tab.addEventListener("click", () => queueMicrotask(contextLabel)));
    q("[data-knowledge-refresh]").addEventListener("click", () => refresh().catch(error => report(error.message)));
    (async () => {
        try {
            const state = await client.knowledgeStatus(); enabled = state.enabled; await collections(); q("[data-knowledge-scope]").hidden = false;
            report(state.embeddingConfigured ? "Hybrid retrieval configured for all collections. Upload documents, wait for indexing, then select a collection in Chat or Document Studio." : "Keyword search is ready. Create a collection and upload documents; no embedding setup is required.");
        } catch (error) { report(`Knowledge is unavailable or restricted: ${error.message}. For a local host, enable Knowledge:Enabled and use the authorized local address.`); }
        try {
            const settings = await client.knowledgeEmbedding(); const form = q("[data-knowledge-embedding]");
            for (const name of settings.availableModels) form.elements.modelFileName.add(new Option(name, name));
            for (const key of ["modelFileName", "dimensions", "pooling", "queryPrefix", "documentPrefix"]) form.elements[key].value = settings.current[key] ?? "";
            embeddingControls();
        } catch (error) { embeddingReport(`Global embedding settings are unavailable or restricted: ${error.message}`); }
    })();
    const timer = setInterval(() => { if (enabled && !document.hidden && q('[data-panel="knowledge"]').classList.contains("is-active")) refresh().catch(error => report(error.message)); }, 3000);
    window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();
