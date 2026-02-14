const ROOT_ID = "clarifai-floating-root";
const STYLE_ID = "clarifai-floating-style";
const CLIENT_ID = `content:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

if (!document.getElementById(ROOT_ID)) {
    setupClarifaiFloatingUI();
}

function setupClarifaiFloatingUI() {
    injectStyle();

    let selectedText = "";
    let selectionTimer = null;
    let requestCounter = 0;
    let activeRequestId = null;
    let lastPointerX = null;
    let lastPointerY = null;
    let isMouseSelecting = false;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.display = "none";
    root.style.position = "absolute";
    root.style.zIndex = "2147483647";

    const iconButton = document.createElement("button");
    iconButton.className = "clarifai-icon";
    iconButton.type = "button";
    iconButton.title = "選択したテキストを簡単に説明";
    iconButton.innerHTML = `<img src="${chrome.runtime.getURL("images/icon32.png")}" alt="ClarifAI" />`;
    iconButton.style.display = "none";

    const panel = document.createElement("section");
    panel.className = "clarifai-panel";
    panel.style.display = "none";

    panel.innerHTML = `
        <button class="clarifai-close" type="button" aria-label="Close">×</button>
        <div class="clarifai-main">
            <div class="clarifai-selected"></div>
            <div class="clarifai-loading" aria-live="polite">
                <span class="clarifai-loader-dot"></span>
                <span class="clarifai-loader-dot"></span>
                <span class="clarifai-loader-dot"></span>
            </div>
            <span class="clarifai-pos"></span>
            <div class="clarifai-result"></div>
        </div>
        <div class="clarifai-similar-wrap">
            <p class="clarifai-similar-label">Similar</p>
            <div class="clarifai-similar"></div>
        </div>
    `;

    const closeButton = panel.querySelector(".clarifai-close");
    const selectedEl = panel.querySelector(".clarifai-selected");
    const posEl = panel.querySelector(".clarifai-pos");
    const resultEl = panel.querySelector(".clarifai-result");
    const loadingEl = panel.querySelector(".clarifai-loading");
    const similarWrapEl = panel.querySelector(".clarifai-similar-wrap");
    const similarEl = panel.querySelector(".clarifai-similar");

    root.appendChild(iconButton);
    root.appendChild(panel);
    (document.body || document.documentElement).appendChild(root);

    function normalizeInput(value) {
        return (value || "").trim().slice(0, 2000);
    }

    function isNodeInsideRoot(node) {
        if (!node) {
            return false;
        }

        const elementNode =
            node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        return !!elementNode && root.contains(elementNode);
    }

    function isSelectionInsideRoot() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        return (
            isNodeInsideRoot(range.startContainer) ||
            isNodeInsideRoot(range.endContainer)
        );
    }

    function renderExplanation(data) {
        loadingEl.style.display = "none";
        selectedEl.textContent = data.originText || selectedText || "";
        posEl.textContent = data.partOfSpeech || "";
        posEl.style.display = data.partOfSpeech ? "inline-block" : "none";
        resultEl.textContent = data.description || "";

        const similars = [data.similar1, data.similar2, data.similar3].filter(
            Boolean,
        );
        similarEl.innerHTML = "";
        if (similars.length === 0) {
            similarWrapEl.style.display = "none";
            return;
        }

        similarWrapEl.style.display = "block";
        for (const word of similars) {
            const chip = document.createElement("span");
            chip.className = "clarifai-chip";
            chip.textContent = word;
            similarEl.appendChild(chip);
        }
    }

    async function requestExplanation(text, requestId) {
        const input = normalizeInput(text);

        if (!input) {
            throw new Error("No text provided.");
        }

        const response = await chrome.runtime.sendMessage({
            type: "CLARIFAI_EXPLAIN_TEXT",
            text: input,
            clientId: CLIENT_ID,
            requestId,
        });

        if (!response?.ok) {
            throw new Error(response?.error || "Unknown error");
        }

        const data = response.data || {};
        return {
            originText: data.originText || input,
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
                type: "CLARIFAI_CANCEL_EXPLANATION",
                clientId: CLIENT_ID,
                requestId: activeRequestId,
            })
            .catch(() => {});

        activeRequestId = null;
    }

    function getSelectedText() {
        if (isSelectionInsideRoot()) {
            return "";
        }

        return normalizeInput(window.getSelection()?.toString() || "");
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

    function positionRootNearSelection() {
        const rect = getSelectionRect();
        if (!rect) {
            return;
        }

        const margin = 10;
        const panelWidth = 360;
        const iconSize = 32;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const viewportLeft = scrollX;
        const viewportTop = scrollY;
        const viewportRight = scrollX + window.innerWidth;
        const viewportBottom = scrollY + window.innerHeight;
        const hasPointer =
            Number.isFinite(lastPointerX) && Number.isFinite(lastPointerY);

        const pointerLeft = hasPointer ? lastPointerX + scrollX : rect.right + scrollX;
        const pointerTop = hasPointer ? lastPointerY + scrollY : rect.bottom + scrollY;

        let left = pointerLeft + margin;
        let top = pointerTop + margin;

        if (left + panelWidth > viewportRight - margin) {
            left = viewportRight - panelWidth - margin;
        }
        if (left < viewportLeft + margin) {
            left = viewportLeft + margin;
        }

        if (top + iconSize > viewportBottom - margin) {
            top = rect.top + scrollY - iconSize - margin;
        }
        if (top < viewportTop + margin) {
            top = viewportTop + margin;
        }

        const iconRight = left + iconSize;
        const iconBottom = top + iconSize;
        const overlapsSelection =
            iconRight > rect.left &&
            left < rect.right &&
            iconBottom > rect.top &&
            top < rect.bottom;

        if (overlapsSelection) {
            const belowTop = rect.bottom + scrollY + margin;
            const aboveTop = rect.top + scrollY - iconSize - margin;
            if (belowTop + iconSize <= viewportBottom - margin) {
                top = belowTop;
            } else if (aboveTop >= viewportTop + margin) {
                top = aboveTop;
            } else {
                top = viewportTop + margin;
            }
        }

        root.style.left = `${left}px`;
        root.style.top = `${top}px`;
    }

    function showIcon() {
        positionRootNearSelection();
        root.style.display = "block";
        iconButton.style.display = "inline-flex";
    }

    function hideIcon() {
        iconButton.style.display = "none";
        if (panel.style.display === "none") {
            root.style.display = "none";
        }
    }

    function showPanel() {
        root.style.display = "block";
        panel.style.display = "block";
    }

    function hidePanel() {
        cancelActiveExplanationRequest();
        panel.style.display = "none";
        if (iconButton.style.display === "none") {
            root.style.display = "none";
        }
    }

    function setStatus(message) {
        void message;
    }

    function updateSelectionState() {
        if (isSelectionInsideRoot()) {
            return;
        }

        const text = getSelectedText();
        selectedText = text;

        if (text) {
            showIcon();
        } else {
            hideIcon();
        }
    }

    function scheduleSelectionUpdate() {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(updateSelectionState, 120);
    }

    async function explain(text) {
        const input = normalizeInput(text || selectedText);

        if (!input) {
            setStatus("説明するテキストがありません。");
            return;
        }

        selectedText = input;
        cancelActiveExplanationRequest();
        showIcon();
        showPanel();
        setStatus("説明を生成中...");
        selectedEl.textContent = input;
        loadingEl.style.display = "flex";
        posEl.style.display = "none";
        resultEl.textContent = "";
        similarEl.innerHTML = "";
        similarWrapEl.style.display = "none";

        const currentRequestId = ++requestCounter;
        activeRequestId = currentRequestId;

        try {
            const explanation = await requestExplanation(input, currentRequestId);
            if (currentRequestId !== requestCounter) {
                return;
            }

            activeRequestId = null;
            renderExplanation(explanation);
            setStatus("完了");
        } catch (error) {
            if (currentRequestId !== requestCounter) {
                return;
            }

            activeRequestId = null;
            if (error?.message === "Request canceled") {
                loadingEl.style.display = "none";
                return;
            }

            resultEl.textContent = "";
            loadingEl.style.display = "none";
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
            lastPointerX = event.clientX;
            lastPointerY = event.clientY;
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
        if (message?.type === "CLARIFAI_GET_SELECTION") {
            sendResponse({ text: getSelectedText() || selectedText });
            return;
        }

        if (message?.type === "CLARIFAI_SHOW_FROM_CONTEXT_MENU") {
            explain(message.text || "");
            sendResponse({ ok: true });
        }
    });
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${ROOT_ID} {
            left: 12px;
            top: 12px;
            font-family: "Segoe UI", Tahoma, sans-serif;
            width: 0;
            height: 0;
            overflow: visible;
            pointer-events: none;
        }

        #${ROOT_ID} .clarifai-icon {
            position: absolute;
            left: 0;
            top: 0;
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 0;
            background: transparent;
            color: #101828;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            line-height: 0;
            pointer-events: auto;
        }

        #${ROOT_ID} .clarifai-icon img {
            width: 100%;
            height: 100%;
            display: block;
        }

        #${ROOT_ID} .clarifai-panel {
            position: absolute;
            left: 0;
            top: 42px;
            width: min(360px, calc(100vw - 32px));
            background: #fff;
            border: 1px solid #d0d5dd;
            border-radius: 16px;
            box-shadow: 0 12px 30px rgba(16, 24, 40, 0.16);
            padding: 12px;
            color: #101828;
            box-sizing: border-box;
            overflow: visible;
            pointer-events: auto;
        }

        #${ROOT_ID} .clarifai-panel::before {
            content: "";
            position: absolute;
            top: -10px;
            left: 10px;
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 10px solid #d0d5dd;
        }

        #${ROOT_ID} .clarifai-panel::after {
            content: "";
            position: absolute;
            top: -8px;
            left: 11px;
            width: 0;
            height: 0;
            border-left: 7px solid transparent;
            border-right: 7px solid transparent;
            border-bottom: 9px solid #fff;
        }

        #${ROOT_ID} .clarifai-main {
            margin-top: 0;
        }

        #${ROOT_ID} .clarifai-selected {
            font-size: 16px;
            font-weight: 700;
            line-height: 1.3;
            margin: 0 28px 8px 0;
            word-break: break-word;
        }

        #${ROOT_ID} .clarifai-close {
            position: absolute;
            right: 8px;
            top: 8px;
            border: 1px solid #d0d5dd;
            border-radius: 6px;
            background: #f8fafc;
            color: #101828;
            cursor: pointer;
            padding: 2px 7px;
            line-height: 1;
            font-weight: 700;
        }

        #${ROOT_ID} .clarifai-pos {
            display: inline-block;
            background: #eef4ff;
            color: #0f62fe;
            border-radius: 999px;
            padding: 2px 10px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        #${ROOT_ID} .clarifai-loading {
            display: none;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            min-height: 20px;
        }

        #${ROOT_ID} .clarifai-loader-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #98a2b3;
            animation: clarifai-bounce 1s infinite ease-in-out;
        }

        #${ROOT_ID} .clarifai-loader-dot:nth-child(2) {
            animation-delay: 0.15s;
        }

        #${ROOT_ID} .clarifai-loader-dot:nth-child(3) {
            animation-delay: 0.3s;
        }

        @keyframes clarifai-bounce {
            0%,
            80%,
            100% {
                transform: scale(0.7);
                opacity: 0.45;
            }

            40% {
                transform: scale(1);
                opacity: 1;
            }
        }

        #${ROOT_ID} .clarifai-result {
            font-size: 13px;
            line-height: 1.45;
            white-space: pre-wrap;
        }

        #${ROOT_ID} .clarifai-similar-wrap {
            margin-top: 12px;
        }

        #${ROOT_ID} .clarifai-similar-label {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #475467;
        }

        #${ROOT_ID} .clarifai-similar {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        #${ROOT_ID} .clarifai-chip {
            border: 1px solid #d0d5dd;
            border-radius: 999px;
            padding: 2px 8px;
            font-size: 11px;
            color: #344054;
        }
    `;

    document.documentElement.appendChild(style);
}
