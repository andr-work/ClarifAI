const CLARIFAI_CONTENT_CLIENT_ID = `content:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;

if (
    !document.getElementById(ClarifaiContentUI.ROOT_ID) &&
    globalThis.ClarifaiMessages &&
    globalThis.ClarifaiPositioning
) {
    setupClarifaiFloatingUI();
}

function setupClarifaiFloatingUI() {
    let selectedText = "";
    let selectionTimer = null;
    let requestCounter = 0;
    let activeRequestId = null;
    const pointer = { x: null, y: null };
    let isMouseSelecting = false;

    const {
        root,
        panel,
        iconButton,
        closeButton,
        renderExplanation,
        resetForLoading,
        clearLoadingOnly,
        showIcon,
        hideIcon,
        showPanel,
        hidePanel: hidePanelView,
    } = ClarifaiContentUI.createFloatingUI();

    function normalizeInput(value) {
        return globalThis.ClarifaiNormalize?.normalizeInput(value) || "";
    }

    function sanitizeOriginalInput(value) {
        return globalThis.ClarifaiNormalize?.sanitizeOriginalInput(value) || "";
    }

    function isNodeInsideRoot(node) {
        if (!node) {
            return false;
        }

        const elementNode = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        return !!elementNode && root.contains(elementNode);
    }

    function isSelectionInsideRoot() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        return (
            isNodeInsideRoot(range.startContainer) || isNodeInsideRoot(range.endContainer)
        );
    }

    function getSelectedText() {
        if (isSelectionInsideRoot()) {
            return "";
        }

        return sanitizeOriginalInput(window.getSelection()?.toString() || "");
    }

    function getSelectionRect() {
        if (isSelectionInsideRoot()) {
            return null;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return null;
        }

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
            return null;
        }

        return rect;
    }

    function setStatus(message) {
        void message;
    }

    async function requestExplanation(text, requestId) {
        const originalInput = sanitizeOriginalInput(text);
        const input = normalizeInput(originalInput);

        if (!input) {
            throw new Error("No text provided.");
        }

        const response = await chrome.runtime.sendMessage({
            type: ClarifaiMessages.EXPLAIN_TEXT,
            text: originalInput,
            clientId: CLARIFAI_CONTENT_CLIENT_ID,
            requestId,
        });

        if (!response?.ok) {
            throw new Error(response?.error || "Unknown error");
        }

        const data = response.data || {};
        return {
            originText: data.originText || originalInput,
            partOfSpeech: data.partOfSpeech || "",
            description: data.description || response.explanation || "",
            similar1: data.similar1 || "",
            similar2: data.similar2 || "",
            similar3: data.similar3 || "",
        };
    }

    function cancelActiveExplanationRequest() {
        if (!activeRequestId) {
            return;
        }

        chrome.runtime
            .sendMessage({
                type: ClarifaiMessages.CANCEL_EXPLANATION,
                clientId: CLARIFAI_CONTENT_CLIENT_ID,
                requestId: activeRequestId,
            })
            .catch(() => {});

        activeRequestId = null;
    }

    function positionRoot() {
        return ClarifaiPositioning.positionRootNearSelection(
            root,
            getSelectionRect,
            pointer,
        );
    }

    function showIconAtSelection() {
        if (!positionRoot()) {
            return;
        }

        showIcon();
    }

    function hidePanel() {
        cancelActiveExplanationRequest();
        hidePanelView();
        hideIcon();
    }

    function updateSelectionState() {
        if (isSelectionInsideRoot()) {
            return;
        }

        const text = getSelectedText();
        selectedText = text;

        if (text) {
            showIconAtSelection();
        } else {
            hideIcon();
        }
    }

    function scheduleSelectionUpdate() {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(updateSelectionState, 120);
    }

    async function explain(text) {
        const input = sanitizeOriginalInput(text || selectedText);

        if (!input) {
            setStatus("説明するテキストがありません。");
            return;
        }

        selectedText = input;
        cancelActiveExplanationRequest();
        showIconAtSelection();
        showPanel();
        setStatus("説明を生成中...");
        resetForLoading(input);

        const currentRequestId = ++requestCounter;
        activeRequestId = currentRequestId;

        try {
            const explanation = await requestExplanation(input, currentRequestId);
            if (currentRequestId !== requestCounter) {
                return;
            }

            activeRequestId = null;
            renderExplanation(explanation, selectedText);
            setStatus("完了");
        } catch (error) {
            if (currentRequestId !== requestCounter) {
                return;
            }

            activeRequestId = null;
            if (error?.message === "Request canceled") {
                clearLoadingOnly();
                return;
            }

            clearLoadingOnly();
            setStatus(`失敗: ${error?.message || "Unknown error"}`);
        }
    }

    iconButton.addEventListener("click", () => {
        explain();
    });

    closeButton.addEventListener("click", () => {
        hidePanel();
    });

    document.addEventListener(
        "mousedown",
        (event) => {
            if (root.contains(event.target)) {
                return;
            }

            isMouseSelecting = true;
        },
        true,
    );

    document.addEventListener(
        "selectionchange",
        () => {
            if (isMouseSelecting) {
                return;
            }
            scheduleSelectionUpdate();
        },
        true,
    );

    document.addEventListener(
        "mouseup",
        (event) => {
            if (root.contains(event.target)) {
                return;
            }

            isMouseSelecting = false;
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            scheduleSelectionUpdate();
        },
        true,
    );

    document.addEventListener(
        "mousedown",
        (event) => {
            if (panel.style.display === "none") {
                return;
            }

            if (panel.contains(event.target) || iconButton.contains(event.target)) {
                return;
            }

            hidePanel();
        },
        true,
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                isMouseSelecting = false;
            }
        },
        true,
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === ClarifaiMessages.GET_SELECTION) {
            sendResponse({ text: getSelectedText() || selectedText });
            return;
        }

        if (message?.type === ClarifaiMessages.SHOW_FROM_CONTEXT_MENU) {
            explain(message.text || "");
            sendResponse({ ok: true });
        }
    });
}
