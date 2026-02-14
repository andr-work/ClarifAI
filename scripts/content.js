const ROOT_ID = "clarifai-floating-root";
const STYLE_ID = "clarifai-floating-style";

if (!document.getElementById(ROOT_ID)) {
    setupClarifaiFloatingUI();
}

function setupClarifaiFloatingUI() {
    injectStyle();

    let selectedText = "";
    let selectionTimer = null;
    let requestCounter = 0;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.display = "none";

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
        <p class="clarifai-origin"></p>
        <div class="clarifai-main">
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
    const originEl = panel.querySelector(".clarifai-origin");
    const posEl = panel.querySelector(".clarifai-pos");
    const resultEl = panel.querySelector(".clarifai-result");
    const loadingEl = panel.querySelector(".clarifai-loading");
    const similarWrapEl = panel.querySelector(".clarifai-similar-wrap");
    const similarEl = panel.querySelector(".clarifai-similar");

    root.appendChild(iconButton);
    root.appendChild(panel);
    document.documentElement.appendChild(root);

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

    function buildPrompt(text) {
        return [
            "You are a helpful dictionary assistant.",
            "Explain the selected text in simple, easy-to-understand English.",
            "Return ONLY valid JSON with this exact schema:",
            '{"originText":"", "partOfSpeech":"", "description":"", "similar1":"", "similar2":"", "similar3":""}',
            "Text:",
            text,
            "Do not include markdown or extra text.",
        ].join("\\n\\n");
    }

    function parseExplanationResult(raw, originalText) {
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            return {
                originText: parsed.originText || originalText,
                partOfSpeech: parsed.partOfSpeech || "",
                description: parsed.description || raw,
                similar1: parsed.similar1 || "",
                similar2: parsed.similar2 || "",
                similar3: parsed.similar3 || "",
            };
        } catch {
            return {
                originText: originalText,
                partOfSpeech: "",
                description: raw,
                similar1: "",
                similar2: "",
                similar3: "",
            };
        }
    }

    function renderExplanation(data) {
        loadingEl.style.display = "none";
        originEl.textContent = data.originText || "";
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

    async function generateExplanation(text) {
        const input = normalizeInput(text);

        if (!input) {
            throw new Error("No text provided.");
        }

        if (!globalThis.LanguageModel?.create) {
            throw new Error(
                "LanguageModel API is not available in this Chrome environment.",
            );
        }

        const session = await LanguageModel.create();
        const output = await session.prompt(buildPrompt(input));
        const normalizedOutput = output?.trim() || "No explanation returned.";
        return parseExplanationResult(normalizedOutput, input);
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

        const margin = 12;
        const panelWidth = 360;
        const iconSize = 32;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = rect.right + margin;
        if (left + panelWidth > viewportWidth - margin) {
            left = viewportWidth - panelWidth - margin;
        }
        if (left < margin) {
            left = margin;
        }

        let top = rect.bottom + margin;
        if (top + iconSize > viewportHeight - margin) {
            top = rect.top - iconSize - margin;
        }
        if (top < margin) {
            top = margin;
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
        showIcon();
        showPanel();
        setStatus("説明を生成中...");
        loadingEl.style.display = "flex";
        originEl.textContent = input;
        posEl.style.display = "none";
        resultEl.textContent = "";
        similarEl.innerHTML = "";
        similarWrapEl.style.display = "none";

        const currentRequestId = ++requestCounter;

        try {
            const explanation = await generateExplanation(input);
            if (currentRequestId !== requestCounter) {
                return;
            }

            renderExplanation(explanation);
            setStatus("完了");
        } catch (error) {
            if (currentRequestId !== requestCounter) {
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

    document.addEventListener("selectionchange", scheduleSelectionUpdate, true);
    document.addEventListener(
        "mouseup",
        (event) => {
            if (root.contains(event.target)) {
                return;
            }

            scheduleSelectionUpdate();
        },
        true,
    );

    window.addEventListener("resize", () => {
        if (root.style.display !== "none") {
            positionRootNearSelection();
        }
    });

    window.addEventListener(
        "scroll",
        () => {
            if (root.style.display !== "none") {
                positionRootNearSelection();
            }
        },
        true,
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === "CLARIFAI_GET_SELECTION") {
            sendResponse({ text: getSelectedText() || selectedText });
            return;
        }

        if (message?.type === "CLARIFAI_GENERATE_EXPLANATION") {
            (async () => {
                try {
                    const explanation = await generateExplanation(
                        message.text || "",
                    );
                    sendResponse({
                        ok: true,
                        explanation: explanation.description,
                        data: explanation,
                    });
                } catch (error) {
                    sendResponse({
                        ok: false,
                        error: error?.message || "Unknown error",
                    });
                }
            })();

            return true;
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
            position: fixed;
            left: 12px;
            top: 12px;
            z-index: 2147483647;
            font-family: "Segoe UI", Tahoma, sans-serif;
            width: 0;
            height: 0;
            overflow: visible;
        }

        #${ROOT_ID} .clarifai-icon {
            position: absolute;
            left: 0;
            top: 0;
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 999px;
            background: #ffffff;
            color: #101828;
            cursor: pointer;
            font-size: 18px;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 20px rgba(16, 24, 40, 0.2);
            padding: 0;
        }

        #${ROOT_ID} .clarifai-icon img {
            width: 24px;
            height: 24px;
            display: block;
        }

        #${ROOT_ID} .clarifai-panel {
            position: absolute;
            left: 0;
            top: 40px;
            width: min(360px, calc(100vw - 32px));
            background: #fff;
            border: 1px solid #d0d5dd;
            border-radius: 16px;
            box-shadow: 0 12px 30px rgba(16, 24, 40, 0.16);
            padding: 14px;
            color: #101828;
            position: relative;
        }

        #${ROOT_ID} .clarifai-close {
            position: absolute;
            right: 10px;
            top: 10px;
            border: 1px solid #d0d5dd;
            border-radius: 6px;
            background: #f8fafc;
            color: #101828;
            cursor: pointer;
            padding: 2px 8px;
            line-height: 1;
            font-weight: 700;
        }

        #${ROOT_ID} .clarifai-origin {
            margin: 0 34px 10px 0;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.3;
            color: #101828;
            word-break: break-word;
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
