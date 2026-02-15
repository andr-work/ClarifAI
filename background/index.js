importScripts("../shared/messages.js", "../shared/normalize.js", "llm.js");

const CONTEXT_MENU_ID = "clarifai-explain-selection";
const activeRequests = new Map();

function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "選択したテキストを簡単に説明",
            contexts: ["selection"],
        });
    });
}

chrome.runtime.onInstalled.addListener(() => {
    createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
    createContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
        return;
    }

    const selectedText =
        ClarifaiNormalize.sanitizeOriginalInput(info.selectionText || "");
    if (!selectedText) {
        return;
    }

    chrome.tabs.sendMessage(tab.id, {
        type: ClarifaiMessages.SHOW_FROM_CONTEXT_MENU,
        text: selectedText,
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === ClarifaiMessages.CANCEL_EXPLANATION) {
        const clientKey = ClarifaiLLM.getClientKey(sender, message);
        const active = activeRequests.get(clientKey);
        if (active) {
            active.controller.abort();
            activeRequests.delete(clientKey);
        }
        sendResponse({ ok: true });
        return;
    }

    if (message?.type !== ClarifaiMessages.EXPLAIN_TEXT) {
        return;
    }

    const clientKey = ClarifaiLLM.getClientKey(sender, message);
    const previous = activeRequests.get(clientKey);
    if (previous) {
        previous.controller.abort();
    }

    const controller = new AbortController();
    activeRequests.set(clientKey, { controller });

    (async () => {
        try {
            const explanation = await ClarifaiLLM.generateExplanationWithAbort(
                message.text || "",
                controller.signal,
            );

            const active = activeRequests.get(clientKey);
            if (!active || active.controller !== controller) {
                return;
            }

            activeRequests.delete(clientKey);
            sendResponse({
                ok: true,
                explanation: explanation.description,
                data: explanation,
            });
        } catch (error) {
            const active = activeRequests.get(clientKey);
            if (active && active.controller === controller) {
                activeRequests.delete(clientKey);
            }

            if (ClarifaiLLM.isAbortError(error)) {
                sendResponse({
                    ok: false,
                    error: "Request canceled",
                    canceled: true,
                });
                return;
            }

            sendResponse({
                ok: false,
                error: error?.message || "Unknown error",
            });
        }
    })();

    return true;
});
