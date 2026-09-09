(() => {
    "use strict";
    const settings = window.textControlAIWorkspace || {};
    const panel = document.querySelector("[data-runtime-installation]");
    if (!panel || settings.showRuntimeSettings === false) return;
    const client = new window.TXTextControlAI.Client(settings);
    const find = name => panel.querySelector("[data-" + name + "]");
    const backend = find("install-backend"), install = find("install-runtime");
    const cancel = find("cancel-install"), progress = find("install-progress"), stage = find("install-stage");
    const sourceVersion = find("download-version"), sourceUrl = find("download-url"), sourceAssets = find("download-assets");
    const applySource = find("apply-download");
    let sourceDirty = false;
    [sourceVersion, sourceUrl, sourceAssets].forEach(input => input.addEventListener("input", () => { sourceDirty = true; }));
    let initialized = false, refreshing = false, actionPending = false;
    let actionError = null, choicesKey = "", installedKey = "";
    let installationBlocked = true;
    const error = exception => { actionError = exception.message; stage.textContent = actionError; stage.dataset.error = "true"; };
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            const status = await client.runtimeInstallation();
            const catalog = status.runtime, busy = status.state === "installing" || status.state === "configuring";
            find("install-summary").textContent = catalog.externalRuntime
                ? catalog.platform + " · " + catalog.externalRuntime + " · managed downloads are not used"
                : catalog.platform + " · selected release " + catalog.version + " · recommended: " + catalog.recommendedBackend;
            if (!sourceDirty) {
                sourceVersion.value = catalog.download.version;
                sourceUrl.value = catalog.download.baseUrl;
                sourceAssets.value = JSON.stringify(catalog.download.assets, null, 2);
            }
            applySource.disabled = busy || actionPending || !!catalog.externalRuntime;
            [sourceVersion, sourceUrl, sourceAssets].forEach(input => { input.disabled = busy || actionPending || !!catalog.externalRuntime; });
            find("download-persistence").textContent = (status.downloadSettingsPersistenceEnabled
                ? "Settings are saved on this host and survive restarts."
                : "Settings apply to this host until restart. Configure RuntimeDownloadSettingsFile to persist admin changes.") +
                " Unload the model before applying changes; install the selected release before loading it again.";
            find("install-directory").textContent = "Managed runtime directory: " + catalog.cacheDirectory;
            find("install-limitation").textContent = catalog.externalRuntime
                ? catalog.externalRuntime + " configured. Managed downloads are disabled."
                : catalog.installationBlocker || catalog.limitation || "";
            const selected = initialized ? backend.value : catalog.recommendedBackend;
            const nextChoicesKey = JSON.stringify(catalog.choices);
            if (choicesKey !== nextChoicesKey) backend.replaceChildren(...catalog.choices.map(choice => {
                const option = new Option(choice.backend + (choice.supported
                    ? " · " + (choice.downloadBytes / 1024 / 1024).toFixed(0) + " MB"
                    : " · unavailable"), choice.backend);
                option.disabled = !choice.supported;
                return option;
            }));
            choicesKey = nextChoicesKey;
            backend.value = selected; initialized = true;
            backend.disabled = busy || actionPending || !!catalog.externalRuntime;
            installationBlocked = busy || !!catalog.externalRuntime || !!catalog.installationBlocker;
            install.disabled = installationBlocked || actionPending ||
                !catalog.choices.some(choice => choice.backend === backend.value && choice.supported);
            install.textContent = status.state === "failed" ? "Retry installation" : "Install selected runtime";
            cancel.hidden = status.state !== "installing"; progress.hidden = !busy; progress.value = status.progress;
            stage.textContent = actionError || status.error || status.stage;
            stage.dataset.error = actionError || status.error ? "true" : "false";
            const nextInstalledKey = JSON.stringify([catalog.installed, busy, actionPending]);
            if (installedKey !== nextInstalledKey) find("installed-runtimes").replaceChildren(...catalog.installed.map(runtime => {
                const row = document.createElement("li"), label = document.createElement("span");
                label.textContent = runtime.version + " · " + runtime.backend;
                const remove = document.createElement("button");
                remove.type = "button"; remove.className = "secondary-button"; remove.textContent = "Remove";
                remove.disabled = busy || actionPending;
                remove.addEventListener("click", () => {
                    if (window.confirm("Remove " + runtime.id + "? Stop all models/other applications using this cache first. The runtime can be downloaded again."))
                        perform(() => client.removeRuntime(runtime.id));
                });
                row.append(label, remove); return row;
            }));
            installedKey = nextInstalledKey;
        } catch (exception) { error(exception); installationBlocked = true; install.disabled = true; applySource.disabled = true; }
        finally { refreshing = false; }
    }
    async function perform(action) {
        if (actionPending) return;
        actionError = null; actionPending = true; install.disabled = true;
        try { await action(); }
        catch (exception) { error(exception); actionPending = false; return; }
        actionPending = false; await refresh();
    }
    install.addEventListener("click", () => perform(() => client.installRuntime(backend.value)));
    applySource.addEventListener("click", () => perform(async () => {
        let assets;
        try { assets = JSON.parse(sourceAssets.value || "[]"); }
        catch { throw new Error("Custom asset manifest must be valid JSON."); }
        if (!Array.isArray(assets)) throw new Error("Custom asset manifest must be a JSON array.");
        await client.configureRuntimeDownload({ version: sourceVersion.value.trim(), baseUrl: sourceUrl.value.trim(), assets });
        sourceDirty = false;
    }));
    cancel.addEventListener("click", () => perform(() => client.cancelRuntimeInstallation()));
    find("refresh-install").addEventListener("click", () => { actionError = null; refresh(); });
    find("unload-runtime").addEventListener("click", () => perform(() => client.unloadModel()));
    backend.addEventListener("change", () => {
        install.disabled = installationBlocked || actionPending || !backend.selectedOptions.length || backend.selectedOptions[0].disabled;
    });
    refresh();
    const timer = window.setInterval(() => {
        if (!document.hidden && !document.querySelector('[data-panel="runtime"]').hidden) refresh();
    }, 2000);
    window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
})();
