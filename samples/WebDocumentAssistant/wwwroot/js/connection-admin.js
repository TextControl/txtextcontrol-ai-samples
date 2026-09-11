(() => {
    "use strict";
    const form = document.querySelector("[data-connection-form]");
    if (!form) return;
    const status = form.querySelector("[data-connection-status]");
    const button = form.querySelector("button");
    async function request(options, suffix = "") {
        const response = await fetch(form.dataset.endpoint + suffix, { credentials: "same-origin", ...options });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Connection administration unavailable (${response.status}).`);
        return result;
    }
    button.disabled = true;
    request().then(async result => {
        form.elements.serviceUrl.value = result.serviceUrl || "";
        status.textContent = result.remote
            ? "Remote integration host: local model files, runtimes, knowledge and exports are managed on that server. External inference is configured there separately."
            : "Embedded integration host: local model files, runtimes, knowledge and exports are managed on the website server. External models stay at their provider.";
        if (result.remote) {
            const response = await fetch(window.textControlAIWorkspace.apiBaseUrl.replace(/\/$/, "") + "/host", { credentials: "same-origin" });
            if (response.ok) { const host = await response.json(); status.textContent += ` Model directory: ${host.modelDirectory}`; }
        }
    }).catch(error => { status.textContent = error.message; }).finally(() => { button.disabled = false; });
    form.addEventListener("submit", async event => {
        event.preventDefault(); button.disabled = true;
        try {
            const result = await request({ method: "POST", headers: { "Content-Type": "application/json", "X-TextControl-Connection": "1" }, body: JSON.stringify({ serviceUrl: form.elements.serviceUrl.value.trim() || null }) });
            status.textContent = result.message;
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    form.querySelector("[data-connection-test]").addEventListener("click", async event => {
        const test = event.currentTarget; test.disabled = true;
        status.textContent = "Testing approved AI service…";
        try {
            const result = await request({ method: "POST", headers: { "Content-Type": "application/json", "X-TextControl-Connection": "1" }, body: JSON.stringify({ serviceUrl: form.elements.serviceUrl.value.trim() || null }) }, "/test");
            status.textContent = result.message;
        } catch (error) { status.textContent = error.message; }
        finally { test.disabled = false; }
    });
})();
