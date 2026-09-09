(() => {
    "use strict";

    const ui = {
        tabs: [...document.querySelectorAll("[data-tab]")],
        panels: [...document.querySelectorAll("[data-panel]")],
        runtimePill: document.querySelector("[data-runtime-pill]"),
        runtimeShort: document.querySelector("[data-runtime-short]"),
        modelLabel: document.querySelector("[data-model-label]"),
        toolLabel: document.querySelector("[data-tool-label]"),
        messages: document.querySelector("[data-messages]"),
        chatForm: document.querySelector("[data-chat-form]"),
        chatInput: document.querySelector("[data-chat-input]"),
        chatFileInput: document.querySelector("[data-chat-file-input]"),
        chatAttachment: document.querySelector("[data-chat-attachment]"),
        chatAttachmentType: document.querySelector("[data-chat-attachment-type]"),
        chatAttachmentName: document.querySelector("[data-chat-attachment-name]"),
        chatAttachmentMeta: document.querySelector("[data-chat-attachment-meta]"),
        removeChatAttachment: document.querySelector("[data-remove-chat-attachment]"),
        chatDropZone: document.querySelector("[data-chat-drop-zone]"),
        chatDropOverlay: document.querySelector("[data-chat-drop-overlay]"),
        chatCategory: document.querySelector("[data-chat-category]"),
        chatQuickActions: document.querySelector("[data-chat-quick-actions]"),
        runtimeForm: document.querySelector("[data-runtime-form]"),
        testMcpButton: document.querySelector("[data-test-mcp]"),
        mcpTestResult: document.querySelector("[data-mcp-test-result]"),
        temperatureOutput: document.querySelector("[data-temperature-output]"),
        modelSelect: document.querySelector("#modelFile"),
        sampleSelect: document.querySelector("[data-sample-select]"),
        fileInput: document.querySelector("[data-file-input]"),
        documentName: document.querySelector("[data-document-name]"),
        documentMessages: document.querySelector("[data-document-messages]"),
        documentQuestion: document.querySelector("[data-document-question]"),
        rewriteTone: document.querySelector("[data-rewrite-tone]"),
        rewriteButton: document.querySelector('[data-document-action="rewrite"]'),
        documentCategory: document.querySelector("[data-document-category]"),
        documentQuickActions: document.querySelector("[data-document-quick-actions]"),
        selectionPanel: document.querySelector("[data-selection-panel]"),
        selectionStatus: document.querySelector("[data-selection-status]"),
        resetDocumentChat: document.querySelector("[data-reset-document-chat]"),
        toast: document.querySelector("[data-toast]"),
        statusOrb: document.querySelector("[data-status-orb]"),
        statusHeading: document.querySelector("[data-status-heading]"),
        statusDetail: document.querySelector("[data-status-detail]"),
        statusModel: document.querySelector("[data-status-model]"),
        statusEngine: document.querySelector("[data-status-engine]"),
        statusHardware: document.querySelector("[data-status-hardware]"),
        statusLayers: document.querySelector("[data-status-layers]"),
        statusMcpEndpoint: document.querySelector("[data-status-mcp-endpoint]"),
        statusTools: document.querySelector("[data-status-tools]")
    };

    let runtime = null;
    let editorReady = false;
    let chatAttachment = null;
    let chatDragDepth = 0;
    let toastTimer = 0;
    // The sample owns its UI; reusable HTTP/streaming behavior comes from AspNetCore.
    const workspaceOptions = window.textControlAIWorkspace || {};
    const client = new window.TXTextControlAI.Client(workspaceOptions);
    const documentAssistant = window.TXTextControl
        ? new window.TXTextControlAI.DocumentAssistant({ client, editor: window.TXTextControl }) : null;
    const defaultSampleName = workspaceOptions.defaultSampleName || "";
    let defaultSampleLoadStarted = false;

    const creationQuickActions = [
        { title: "Project proposal", description: "Create a polished one-page proposal.", prompt: "Create a one-page project proposal with a heading, executive summary, three benefits, and next steps. Save it as PDF." },
        { title: "Invoice", description: "Generate a professional invoice.", prompt: "Create a professional invoice with three line items, subtotal, tax, total, and payment terms. Save it as PDF." },
        { title: "Meeting agenda", description: "Plan a focused meeting.", prompt: "Create a meeting agenda for a product launch review with five agenda items and an action-items table." }
    ];

    const api = async (url, options = {}) => {
        const response = await client.fetch(url.replace(/^\/api\//, ""), {
            ...options,
            headers: { "Content-Type": "application/json", ...(options.headers || {}) }
        });
        if (response.status === 204) return null;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || payload.error || `Request failed (${response.status})`);
        return payload;
    };

    const showToast = (message, isError = false) => {
        window.clearTimeout(toastTimer);
        ui.toast.textContent = message;
        ui.toast.classList.toggle("is-error", isError);
        ui.toast.classList.add("is-visible");
        toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-visible"), 3800);
    };

    const allowedMarkdownTags = new Set([
        "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
        "hr", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"
    ]);

    const appendSafeMarkdownNode = (source, destination) => {
        if (source.nodeType === Node.TEXT_NODE) {
            destination.append(document.createTextNode(source.textContent || ""));
            return;
        }
        if (source.nodeType !== Node.ELEMENT_NODE) return;

        const tag = source.tagName.toLowerCase();
        const target = allowedMarkdownTags.has(tag)
            ? document.createElement(tag)
            : document.createDocumentFragment();

        if (tag === "a" && target instanceof HTMLElement) {
            const href = source.getAttribute("href");
            if (href) {
                try {
                    const url = new URL(href, window.location.origin);
                    if (["http:", "https:", "mailto:"].includes(url.protocol)) {
                        target.setAttribute("href", url.href);
                        target.setAttribute("rel", "noopener noreferrer");
                        if (url.origin !== window.location.origin) target.setAttribute("target", "_blank");
                    }
                } catch { /* Invalid links are rendered as text. */ }
            }
            const title = source.getAttribute("title");
            if (title) target.setAttribute("title", title);
        }

        if (tag === "code" && target instanceof HTMLElement) {
            const language = [...source.classList].find(name => /^language-[a-z0-9_+-]+$/i.test(name));
            if (language) target.classList.add(language);
        }

        [...source.childNodes].forEach(child => appendSafeMarkdownNode(child, target));
        destination.append(target);
    };

    const renderMarkdown = (container, html, fallbackText = "") => {
        container.classList.add("markdown-content");
        if (!html) {
            container.textContent = fallbackText;
            return;
        }

        const template = document.createElement("template");
        template.innerHTML = html;
        const fragment = document.createDocumentFragment();
        [...template.content.childNodes].forEach(node => appendSafeMarkdownNode(node, fragment));
        container.replaceChildren(fragment);
    };

    const createQuickAction = (action, attribute, value) => {
        const button = document.createElement("button");
        button.className = "quick-action-card";
        button.type = "button";
        button.dataset[attribute] = value;

        const icon = document.createElement("span");
        icon.textContent = "✦";
        icon.setAttribute("aria-hidden", "true");
        const title = document.createElement("strong");
        title.textContent = action.title;
        const description = document.createElement("small");
        description.textContent = action.description;
        button.append(icon, title, description);
        return button;
    };

    const renderChatCreationActions = () => {
        ui.chatCategory.textContent = "Start something new";
        ui.chatQuickActions.replaceChildren(...creationQuickActions.map(action =>
            createQuickAction(action, "prompt", action.prompt)));
    };

    const renderChatQuickActions = classification => {
        if (!classification?.category) return;
        ui.chatCategory.textContent = `${classification.category} document`;
        const actions = [
            { title: "Summarize document", description: "Extract its key points.", prompt: "Summarize the current document and list its key points." },
            { title: "Download PDF", description: "Export the current document.", prompt: "Return the current document as PDF." },
            ...(classification.suggestedActions || [])
        ];
        ui.chatQuickActions.replaceChildren(...actions.map(action =>
            createQuickAction(action, "prompt", action.prompt)));
    };

    const renderDocumentQuickActions = classification => {
        const summary = createQuickAction(
            { title: "Create summary", description: "Extract the key points." },
            "documentAction",
            "summary");
        summary.firstElementChild.textContent = "≡";
        const download = createQuickAction(
            { title: "Download PDF", description: "Export the current document." },
            "documentPrompt",
            "Return the current document as PDF.");
        download.firstElementChild.textContent = "↓";

        const actions = (classification?.suggestedActions || []).map(action =>
            createQuickAction(action, "documentPrompt", action.prompt));
        ui.documentQuickActions.replaceChildren(summary, download, ...actions);
        ui.documentCategory.textContent = classification?.category
            ? `${classification.category} · ${Math.round((classification.confidence || 0) * 100)}%`
            : "Document actions";
    };

    const renderDocumentWelcome = () => {
        ui.documentMessages.replaceChildren();
        const welcome = document.createElement("div");
        welcome.className = "agent-welcome compact";
        const mark = document.createElement("div");
        mark.className = "welcome-mark";
        mark.textContent = "TX";
        const title = document.createElement("h3");
        title.textContent = "Work with this document";
        const description = document.createElement("p");
        description.textContent = "Ask a question, request an edit, or choose a suggested action.";
        welcome.append(mark, title, description);
        ui.documentMessages.append(welcome);
        ui.documentMessages.hidden = false;
    };

    const setTab = (name) => {
        ui.tabs.forEach(tab => tab.classList.toggle("is-active", tab.dataset.tab === name));
        ui.panels.forEach(panel => {
            const active = panel.dataset.panel === name;
            panel.hidden = !active;
            panel.classList.toggle("is-active", active);
        });
        history.replaceState(null, "", `#${name}`);
    };

    ui.tabs.forEach(tab => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

    const addMessage = (role, text, pending = false, messageContainer = ui.messages) => {
        const article = document.createElement("article");
        article.className = `message ${role}${pending ? " pending" : ""}`;
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = role === "user" ? "YOU" : "TX";
        const content = document.createElement("div");
        const label = document.createElement("strong");
        label.textContent = role === "user" ? "You" : "Local assistant";
        const paragraph = role === "assistant" && !pending
            ? document.createElement("div")
            : document.createElement("p");
        if (role === "assistant" && !pending) {
            paragraph.className = "markdown-content";
            renderMarkdown(paragraph, "", text);
        } else {
            paragraph.textContent = text;
        }
        if (pending) paragraph.classList.add("typing");
        content.append(label, paragraph);
        article.append(avatar, content);
        messageContainer.append(article);
        messageContainer.scrollTop = messageContainer.scrollHeight;
        return { article, content, paragraph };
    };

    const createActivityView = (message, messageContainer = ui.messages) => {
        const activity = document.createElement("div");
        activity.className = "model-activity";
        activity.setAttribute("role", "status");
        activity.setAttribute("aria-live", "polite");

        const pulse = document.createElement("span");
        pulse.className = "activity-pulse";
        pulse.setAttribute("aria-hidden", "true");
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        const history = document.createElement("div");
        history.className = "activity-history";
        copy.append(title, detail, history);
        activity.append(pulse, copy);
        message.paragraph.replaceWith(activity);

        const started = performance.now();
        const tools = new Set();
        let current = "";
        let serverElapsed = 0;

        const renderElapsed = () => {
            const elapsed = Math.max(serverElapsed, performance.now() - started);
            const seconds = Math.max(0.1, elapsed / 1000).toFixed(1);
            detail.textContent = `${tools.size ? `${tools.size} MCP ${tools.size === 1 ? "tool" : "tools"} · ` : ""}${seconds}s elapsed`;
        };

        const timer = window.setInterval(renderElapsed, 100);
        const update = (status, tool, elapsedMilliseconds) => {
            if (!status) return;
            serverElapsed = Math.max(serverElapsed, Number(elapsedMilliseconds) || 0);
            if (tool) tools.add(tool);
            if (status !== current) {
                if (current) {
                    const step = document.createElement("span");
                    step.textContent = `✓ ${current}`;
                    history.append(step);
                    while (history.children.length > 3) history.firstElementChild.remove();
                }
                current = status;
                title.textContent = status;
            }
            renderElapsed();
            messageContainer.scrollTop = messageContainer.scrollHeight;
        };

        const finish = (text, html, elapsedMilliseconds) => {
            window.clearInterval(timer);
            serverElapsed = Math.max(serverElapsed, Number(elapsedMilliseconds) || 0);
            const paragraph = document.createElement("div");
            paragraph.className = "markdown-content";
            renderMarkdown(paragraph, html, text || "Done.");
            activity.replaceWith(paragraph);
            message.paragraph = paragraph;
            message.article.classList.remove("pending");

            const summary = document.createElement("small");
            summary.className = "activity-summary";
            const seconds = Math.max(0.1, serverElapsed / 1000).toFixed(1);
            summary.textContent = `✓ Completed in ${seconds}s${tools.size ? ` · ${tools.size} MCP ${tools.size === 1 ? "tool" : "tools"}` : ""}`;
            paragraph.insertAdjacentElement("afterend", summary);
            messageContainer.scrollTop = messageContainer.scrollHeight;
        };

        const fail = error => {
            window.clearInterval(timer);
            const paragraph = document.createElement("p");
            paragraph.textContent = error;
            activity.replaceWith(paragraph);
            message.paragraph = paragraph;
            message.article.classList.remove("pending");
        };

        update("Preparing request");
        return { update, finish, fail };
    };

    const streamNdjson = (url, payload, onEvent) => client.stream(url.replace(/^\/api\//, ""), payload, onEvent);

    const streamChat = (message, attachment, onEvent) => client.chat(message, onEvent, { attachment, knowledge: window.sampleKnowledge?.scope() });

    const formatBytes = value => {
        const bytes = Number(value);
        if (!Number.isFinite(bytes) || bytes < 1) return "";
        if (bytes < 1024) return `${bytes} bytes`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const chatFormatForFile = name => {
        const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
        return ({ tx: "tx", rtf: "rtf", docx: "docx", html: "html", htm: "html", pdf: "pdf", md: "md", txt: "txt" })[extension];
    };

    const clearChatAttachment = () => {
        chatAttachment = null;
        ui.chatAttachment.hidden = true;
        ui.chatAttachmentName.textContent = "";
        ui.chatAttachmentMeta.textContent = "";
        ui.chatFileInput.value = "";
    };

    const showChatAttachment = attachment => {
        ui.chatAttachmentType.textContent = attachment.format.toUpperCase();
        ui.chatAttachmentName.textContent = attachment.fileName;
        ui.chatAttachmentMeta.textContent = `${formatBytes(attachment.byteCount)} · ready to upload`;
        ui.chatAttachment.hidden = false;
    };

    const readFileAsBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
        reader.onerror = () => reject(reader.error || new Error("The document could not be read."));
        reader.readAsDataURL(file);
    });

    const addUploadedDocument = (message, attachment) => {
        if (!attachment) return;
        const item = document.createElement("div");
        item.className = "message-upload";
        const type = document.createElement("span");
        type.textContent = attachment.format.toUpperCase();
        const name = document.createElement("strong");
        name.textContent = attachment.fileName;
        item.append(type, name);
        message.content.insertBefore(item, message.paragraph);
    };

    const stageChatFile = async file => {
        const format = chatFormatForFile(file.name);
        if (!format) {
            clearChatAttachment();
            showToast("Use a TX, RTF, DOCX, HTML, PDF, Markdown, or text document", true);
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            clearChatAttachment();
            showToast("The document exceeds the 20 MB sample limit", true);
            return;
        }

        try {
            const data = await readFileAsBase64(file);
            if (!data) throw new Error("The document is empty.");
            chatAttachment = { fileName: file.name, format, byteCount: file.size, data };
            showChatAttachment(chatAttachment);
            ui.chatInput.focus();
        } catch (error) {
            clearChatAttachment();
            showToast(error.message, true);
        }
    };

    const isFileDrag = event => [...(event.dataTransfer?.types || [])].includes("Files");

    ui.chatDropZone.addEventListener("dragenter", event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        chatDragDepth++;
        ui.chatDropOverlay.hidden = false;
    });
    ui.chatDropZone.addEventListener("dragover", event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    ui.chatDropZone.addEventListener("dragleave", event => {
        if (!isFileDrag(event)) return;
        chatDragDepth = Math.max(0, chatDragDepth - 1);
        if (chatDragDepth === 0) ui.chatDropOverlay.hidden = true;
    });
    ui.chatDropZone.addEventListener("drop", event => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        chatDragDepth = 0;
        ui.chatDropOverlay.hidden = true;
        const files = [...(event.dataTransfer?.files || [])];
        if (!files.length) return;
        if (files.length > 1) showToast("The first dropped document was selected");
        void stageChatFile(files[0]);
    });

    const addArtifactButtons = (message, artifacts, messageContainer = ui.messages) => {
        if (!Array.isArray(artifacts) || artifacts.length === 0) return;

        const actions = document.createElement("div");
        actions.className = "message-artifacts";
        for (const artifact of artifacts) {
            const link = document.createElement("a");
            link.className = "download-button";
            link.href = client.url(artifact.downloadUrl);
            link.download = artifact.fileName;

            const icon = document.createElement("span");
            icon.className = "download-button-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "↓";

            const description = document.createElement("span");
            const title = document.createElement("strong");
            title.textContent = `Download ${String(artifact.format || "document").toUpperCase()}`;
            const detail = document.createElement("small");
            const size = formatBytes(artifact.byteCount);
            detail.textContent = size ? `${artifact.fileName} · ${size}` : artifact.fileName;
            description.append(title, detail);
            link.append(icon, description);
            actions.append(link);
        }

        message.content.append(actions);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    };

    const answerExportFormats = ["pdf", "docx", "rtf", "tx", "html", "md", "txt"];

    const addAnswerExportControl = (message, answerId, mode, messageContainer = ui.messages) => {
        if (!answerId) return;

        const control = document.createElement("div");
        control.className = "answer-export-control";

        const icon = document.createElement("span");
        icon.className = "answer-export-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "↗";

        const label = document.createElement("strong");
        label.textContent = "Export answer as";

        const format = document.createElement("select");
        format.className = "answer-export-format";
        format.setAttribute("aria-label", "Answer export format");
        for (const value of answerExportFormats) {
            format.add(new Option(value.toUpperCase(), value));
        }

        const button = document.createElement("button");
        button.className = "answer-export-button";
        button.type = "button";
        button.textContent = "Create download";
        button.addEventListener("click", async () => {
            const original = button.textContent;
            button.disabled = true;
            format.disabled = true;
            button.textContent = "Creating…";
            try {
                const artifact = await api("/api/answers/export", {
                    method: "POST",
                    body: JSON.stringify({ mode, answerId, format: format.value })
                });
                addArtifactButtons(message, [artifact], messageContainer);
                button.textContent = "Create another";
                showToast(`${format.value.toUpperCase()} download created`);
            } catch (error) {
                button.textContent = original;
                showToast(error.message, true);
            } finally {
                button.disabled = false;
                format.disabled = false;
            }
        });

        control.append(icon, label, format, button);
        message.content.append(control);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    };

    const sendChat = async (message) => {
        const text = message.trim();
        const attachment = chatAttachment;
        if (!text && !attachment) return;
        ui.messages.querySelector(".agent-welcome")?.remove();
        const userMessage = addMessage("user", text || "Inspect this document.");
        addUploadedDocument(userMessage, attachment);
        if (attachment) clearChatAttachment();
        ui.chatInput.value = "";
        const pending = addMessage("assistant", "Preparing request", true);
        const activity = createActivityView(pending);
        const submit = ui.chatForm.querySelector("button[type='submit']");
        submit.disabled = true;
        ui.chatFileInput.disabled = true;
        try {
            const result = await streamChat(
                text,
                attachment ? { fileName: attachment.fileName, data: attachment.data } : null,
                event => {
                if (event.type === "status") activity.update(event.message, event.tool, event.elapsedMilliseconds);
            });
            activity.finish(result.text, result.html, result.elapsedMilliseconds);
            addArtifactButtons(pending, result.artifacts);
            addAnswerExportControl(pending, result.answerId, "chat");
            window.sampleKnowledge?.renderCitations(pending.content, result);
            renderChatQuickActions(result.classification);
        } catch (error) {
            activity.fail(error.message);
            showToast(error.message, true);
        } finally {
            submit.disabled = false;
            ui.chatFileInput.disabled = false;
            ui.chatInput.focus();
        }
    };

    ui.chatFileInput.addEventListener("change", async () => {
        const file = ui.chatFileInput.files?.[0];
        if (!file) return;
        try {
            await stageChatFile(file);
        } finally {
            ui.chatFileInput.value = "";
        }
    });
    ui.removeChatAttachment.addEventListener("click", clearChatAttachment);

    ui.chatForm.addEventListener("submit", event => {
        event.preventDefault();
        void sendChat(ui.chatInput.value);
    });
    ui.chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            ui.chatForm.requestSubmit();
        }
    });
    ui.chatQuickActions.addEventListener("click", event => {
        const button = event.target.closest("[data-prompt]");
        if (!button) return;
        ui.chatInput.value = button.dataset.prompt;
        ui.chatInput.focus();
    });
    document.querySelector("[data-reset-chat]").addEventListener("click", async () => {
        await api("/api/chat/reset", { method: "POST", body: "{}" });
        clearChatAttachment();
        ui.messages.innerHTML = "";
        const welcome = document.createElement("div");
        welcome.className = "agent-welcome";
        welcome.innerHTML = '<div class="welcome-mark">TX</div><h1>What shall we make?</h1><p>Create a document, attach one to ask questions, or request precise edits through your local document agent.</p>';
        ui.messages.append(welcome);
        renderChatCreationActions();
        showToast("Conversation cleared");
    });

    const refreshRuntime = async (hydrateForm = false) => {
        runtime = await api("/api/runtime");
        const ready = runtime.state === "ready";
        ui.runtimePill.dataset.state = runtime.state;
        ui.runtimeShort.textContent = ready ? `${runtime.hardware || "Local"} · ready` : runtime.state === "loading" ? "Loading model" : "Runtime offline";
        ui.modelLabel.textContent = runtime.model || "No model loaded";
        ui.toolLabel.textContent = !runtime.configuration?.enableMcp ? "MCP disabled" : runtime.toolCount ? `${runtime.toolCount} tools ready` : "Waiting for MCP";
        ui.statusOrb.dataset.state = runtime.state;
        ui.statusHeading.textContent = ready ? "Runtime ready" : runtime.state === "loading" ? "Loading model…" : "Runtime offline";
        ui.statusDetail.textContent = runtime.error || (ready
            ? runtime.configuration?.enableMcp ? "The model and document toolchain are available." : "The local model is ready; MCP document tools are disabled."
            : "Place a GGUF in Models and load it.");
        ui.statusModel.textContent = runtime.model || "—";
        ui.statusEngine.textContent = runtime.runtime || "—";
        ui.statusHardware.textContent = runtime.hardware || "—";
        ui.statusLayers.textContent = runtime.gpuLayers || "—";
        ui.statusMcpEndpoint.textContent = runtime.configuration?.mcpEndpoint || "—";
        ui.statusTools.textContent = runtime.configuration?.enableMcp ? String(runtime.toolCount || 0) : "Disabled";
        if (hydrateForm && runtime.configuration) hydrateRuntimeForm(runtime.configuration);
    };

    const hydrateRuntimeForm = config => {
        for (const [name, value] of Object.entries(config)) {
            const field = ui.runtimeForm.elements.namedItem(name);
            if (!field) continue;
            if (field.type === "checkbox") field.checked = Boolean(value);
            else if (value !== null && value !== undefined) field.value = String(value);
        }
        ui.temperatureOutput.textContent = Number(config.temperature).toFixed(2);
    };

    const loadModels = async () => {
        const models = await api("/api/models");
        ui.modelSelect.innerHTML = "";
        if (!models.length) {
            ui.modelSelect.add(new Option("No GGUF files found in Models", ""));
            return;
        }
        models.forEach(model => {
            const size = (model.sizeInBytes / 1024 ** 3).toFixed(2);
            ui.modelSelect.add(new Option(`${model.displayName} · ${size} GB`, model.fileName));
        });
        if (runtime?.configuration?.modelFile) ui.modelSelect.value = runtime.configuration.modelFile;
    };

    const nullableNumber = value => value === "" ? null : Number(value);
    const nullableBoolean = value => value === "" ? null : value === "true";
    ui.runtimeForm.elements.temperature.addEventListener("input", event => {
        ui.temperatureOutput.textContent = Number(event.target.value).toFixed(2);
    });
    ui.testMcpButton.addEventListener("click", async () => {
        const endpoint = ui.runtimeForm.elements.mcpEndpoint.value.trim();
        const original = ui.testMcpButton.textContent;
        ui.testMcpButton.disabled = true;
        ui.testMcpButton.textContent = "Testing…";
        ui.mcpTestResult.dataset.state = "testing";
        ui.mcpTestResult.textContent = "Connecting and discovering MCP tools…";
        try {
            const result = await api("/api/mcp/test", {
                method: "POST",
                body: JSON.stringify({ mcpEndpoint: endpoint })
            });
            const compatible = result.hasCreateDocument && result.hasDocumentExport;
            ui.mcpTestResult.dataset.state = compatible ? "success" : "warning";
            ui.mcpTestResult.textContent = compatible
                ? `Connected · ${result.toolCount} tools discovered in ${result.elapsedMilliseconds} ms`
                : `Connected · ${result.toolCount} tools, but a required document workflow or export tool is missing`;
            showToast(compatible ? "MCP connection successful" : "MCP connected with missing document capabilities", !compatible);
        } catch (error) {
            ui.mcpTestResult.dataset.state = "error";
            ui.mcpTestResult.textContent = error.message;
            showToast(error.message, true);
        } finally {
            ui.testMcpButton.disabled = false;
            ui.testMcpButton.textContent = original;
        }
    });
    ui.runtimeForm.addEventListener("submit", async event => {
        event.preventDefault();
        const data = new FormData(ui.runtimeForm);
        const button = ui.runtimeForm.querySelector("button[type='submit']");
        const original = button.textContent;
        const request = {
            modelFile: data.get("modelFile"),
            mcpEndpoint: data.get("mcpEndpoint"),
            enableMcp: data.get("enableMcp") === "on",
            contextSize: Number(data.get("contextSize")),
            gpuLayers: Number(data.get("gpuLayers")),
            hardwareBackend: Number(data.get("hardwareBackend")),
            threads: nullableNumber(data.get("threads")),
            flashAttention: nullableBoolean(data.get("flashAttention")),
            enableReasoning: data.get("enableReasoning") === "on",
            maxOutputTokens: Number(data.get("maxOutputTokens")),
            temperature: Number(data.get("temperature")),
            topK: Number(data.get("topK")),
            topP: Number(data.get("topP")),
            frequencyPenalty: nullableNumber(data.get("frequencyPenalty")),
            presencePenalty: nullableNumber(data.get("presencePenalty")),
            seed: nullableNumber(data.get("seed"))
        };
        button.disabled = true;
        button.textContent = "Loading model…";
        ui.statusOrb.dataset.state = "loading";
        ui.statusHeading.textContent = "Loading model…";
        try {
            runtime = await api("/api/runtime", { method: "POST", body: JSON.stringify(request) });
            await refreshRuntime();
            if (editorReady) await classifyEditorDocument();
            showToast("MCP, model, and generation settings applied");
        } catch (error) {
            await refreshRuntime().catch(() => {});
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    });

    const renderSelectionState = selection => {
        const active = selection.length > 0 && Boolean(selection.text?.trim());
        ui.selectionPanel.dataset.active = String(active);
        ui.rewriteTone.disabled = !active;
        ui.rewriteButton.disabled = !active;
        ui.selectionStatus.textContent = active
            ? `${selection.length} characters selected. Choose a tone and replace them.`
            : "Select text inside the editor to activate.";
    };

    const refreshSelectionState = async () => {
        if (editorReady) renderSelectionState(await documentAssistant.getSelection());
    };

    const classifyEditorDocument = async () => {
        if (!editorReady) return;
        ui.documentCategory.textContent = "Analyzing document…";
        try {
            const classification = await documentAssistant.classify();
            renderDocumentQuickActions(classification);
        } catch {
            renderDocumentQuickActions(null);
        }
    };

    const resetDocumentConversation = async (resetSession = true) => {
        ui.documentQuestion.value = "";
        resizeDocumentQuestion();
        renderDocumentWelcome();
        renderDocumentQuickActions(null);
        if (resetSession) await documentAssistant.reset();
    };

    const loadSampleDocument = async (fileName, announce = true) => {
        const sample = await api(`/api/document-samples/${encodeURIComponent(fileName)}`);
        await documentAssistant.loadDocument(sample.streamType, sample.data);
        await resetDocumentConversation(false);
        ui.documentName.textContent = sample.fileName;
        await Promise.all([classifyEditorDocument(), refreshSelectionState()]);
        ui.documentMessages.querySelector(".agent-welcome")?.remove();
        addMessage("assistant", `${sample.fileName} is ready. Ask a question, request an edit, choose a quick action, or select text to rephrase it.`, false, ui.documentMessages);
        if (announce) showToast(`${sample.fileName} loaded`);
    };

    const tryLoadDefaultSample = async () => {
        if (!defaultSampleName || !editorReady || defaultSampleLoadStarted) return;
        const option = [...ui.sampleSelect.options].find(item => item.value === defaultSampleName);
        if (!option) return;

        defaultSampleLoadStarted = true;
        ui.sampleSelect.value = defaultSampleName;
        try {
            await loadSampleDocument(defaultSampleName, false);
        } catch (error) {
            defaultSampleLoadStarted = false;
            showToast(`Could not load the default sample: ${error.message}`, true);
        }
    };

    const loadSamples = async () => {
        const samples = await api("/api/document-samples");
        samples.forEach(name => ui.sampleSelect.add(new Option(name, name)));
        if (samples.includes(defaultSampleName)) ui.sampleSelect.value = defaultSampleName;
        await tryLoadDefaultSample();
    };

    document.querySelector("[data-load-sample]").addEventListener("click", async () => {
        if (!ui.sampleSelect.value) return showToast("Choose a sample document first", true);
        try {
            await loadSampleDocument(ui.sampleSelect.value);
        } catch (error) { showToast(error.message, true); }
    });

    ui.fileInput.addEventListener("change", async () => {
        const file = ui.fileInput.files?.[0];
        if (!file) return;
        try {
            await documentAssistant.loadFile(file);
            await resetDocumentConversation(false);
            ui.documentName.textContent = file.name;
            await Promise.all([classifyEditorDocument(), refreshSelectionState()]);
            ui.documentMessages.querySelector(".agent-welcome")?.remove();
            addMessage("assistant", `${file.name} is ready. Its content remains local to this app and the configured MCP server.`, false, ui.documentMessages);
            showToast(`${file.name} loaded`);
        } catch (error) { showToast(error.message, true); }
        finally { ui.fileInput.value = ""; }
    });

    const runDocumentAction = async (action, button) => {
        const question = action === "question" ? ui.documentQuestion.value.trim() : "";
        if (action === "question" && !question) {
            ui.documentQuestion.focus();
            showToast("Enter a question or edit request first", true);
            return;
        }

        const buttonLabel = action === "question" ? null : button.querySelector("strong") || button;
        const oldText = buttonLabel?.textContent;
        button.disabled = true;
        if (buttonLabel) {
            buttonLabel.textContent = action === "rewrite" ? "Rephrasing…" : "Working with document…";
        }

        ui.documentMessages.querySelector(".agent-welcome")?.remove();
        let requestLabel = question;
        if (action === "summary") requestLabel = "Create a summary";
        if (action === "rewrite") requestLabel = `Rephrase the selected text in a ${ui.rewriteTone.value} tone`;
        if (action === "question") {
            ui.documentQuestion.value = "";
            resizeDocumentQuestion();
        }
        ui.documentMessages.hidden = false;
        addMessage("user", requestLabel, false, ui.documentMessages);
        const pendingDocumentMessage = addMessage("assistant", "Preparing request", true, ui.documentMessages);
        const activity = createActivityView(pendingDocumentMessage, ui.documentMessages);
        try {
            const onProgress = event => {
                if (event.type === "status") activity.update(event.message, event.tool, event.elapsedMilliseconds);
            };
            const result = action === "rewrite"
                ? await documentAssistant.rephrase(ui.rewriteTone.value, { onProgress })
                : action === "summary"
                    ? await documentAssistant.summarize({ onProgress, knowledge: window.sampleKnowledge?.scope() })
                    : await documentAssistant.execute(question, { onProgress, knowledge: window.sampleKnowledge?.scope() });
            let responseText = result.text || "Document request completed.";
            let responseHtml = result.html;
            if (action === "rewrite") {
                responseText = `The selected text was replaced with:\n\n${result.text}`;
                responseHtml = null;
                await refreshSelectionState();
            } else if (result.kind === "summary" && !result.text) {
                responseText = [
                    result.summary?.overview || "No summary was returned.",
                    ...(result.summary?.keyPoints || []).map(point => `- ${point}`)
                ].join("\n\n");
            } else {
                if (result.applied) {
                    await Promise.all([classifyEditorDocument(), refreshSelectionState()]);
                }
            }
            activity.finish(responseText, responseHtml, result.elapsedMilliseconds);
            addArtifactButtons(pendingDocumentMessage, result.artifacts, ui.documentMessages);
            addAnswerExportControl(pendingDocumentMessage, result.answerId, "document", ui.documentMessages);
            window.sampleKnowledge?.renderCitations(pendingDocumentMessage.content, result);
            showToast(action === "rewrite"
                ? "Selected text rephrased"
                : result.documentBase64
                    ? "Document updated"
                    : "Document analysis complete");
        } catch (error) {
            activity.fail(error.message);
            showToast(error.message, true);
        } finally {
            button.disabled = false;
            if (buttonLabel) buttonLabel.textContent = oldText;
            if (action === "question") ui.documentQuestion.focus();
        }
    };

    const documentQuestionButton = document.querySelector('[data-document-action="question"]');
    document.querySelector(".studio-agent").addEventListener("click", event => {
        const promptButton = event.target.closest("[data-document-prompt]");
        if (promptButton) {
            if (documentQuestionButton.disabled) return;
            ui.documentQuestion.value = promptButton.dataset.documentPrompt;
            resizeDocumentQuestion();
            void runDocumentAction("question", documentQuestionButton);
            return;
        }

        const actionButton = event.target.closest("[data-document-action]");
        if (actionButton) void runDocumentAction(actionButton.dataset.documentAction, actionButton);
    });
    const resizeDocumentQuestion = () => {
        const maximumHeight = 120;
        ui.documentQuestion.style.height = "auto";
        const height = Math.min(ui.documentQuestion.scrollHeight, maximumHeight);
        ui.documentQuestion.style.height = `${height}px`;
        ui.documentQuestion.style.overflowY = ui.documentQuestion.scrollHeight > maximumHeight ? "auto" : "hidden";
    };
    ui.documentQuestion.addEventListener("input", resizeDocumentQuestion);
    resizeDocumentQuestion();
    ui.documentQuestion.addEventListener("keydown", event => {
        const isPlainEnter = event.key === "Enter"
            && !event.shiftKey
            && !event.ctrlKey
            && !event.altKey
            && !event.metaKey
            && !event.isComposing;
        if (!isPlainEnter) return;

        event.preventDefault();
        if (!documentQuestionButton.disabled) {
            void runDocumentAction("question", documentQuestionButton);
        }
    });

    ui.resetDocumentChat.addEventListener("click", async () => {
        try {
            await resetDocumentConversation();
            await classifyEditorDocument();
            showToast("Document conversation cleared");
        } catch (error) {
            showToast(error.message, true);
        }
    });

    if (documentAssistant) {
        documentAssistant.on("selectionChanged", renderSelectionState);
        documentAssistant.ready().then(() => {
            editorReady = true;
            void refreshSelectionState().catch(() => {});
            void tryLoadDefaultSample();
        }).catch(error => showToast(error.message, true));
        window.addEventListener("pagehide", () => documentAssistant.dispose(), { once: true });
    }

    const initialize = async () => {
        const initialTab = location.hash.slice(1);
        const allowedTabs = workspaceOptions.showRuntimeSettings === false ? ["chat", "document", "knowledge"] : ["chat", "document", "knowledge", "runtime"];
        if (allowedTabs.includes(initialTab)) setTab(initialTab);
        try {
            await refreshRuntime(true);
            await Promise.all([workspaceOptions.showRuntimeSettings === false ? Promise.resolve() : loadModels(), loadSamples()]);
        } catch (error) {
            showToast(error.message, true);
        }
        window.setInterval(() => refreshRuntime(false).catch(() => {}), 5000);
    };

    void initialize();
})();
