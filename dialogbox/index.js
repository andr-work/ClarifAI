const sourceTextEl = document.getElementById("sourceText");
const useSelectionBtn = document.getElementById("useSelectionBtn");
const explainBtn = document.getElementById("explainBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const CLIENT_ID = "popup:clarifai";
let activeRequestId = 0;

function setStatus(message) {
    statusEl.textContent = message;
}

function setResult(message) {
    resultEl.textContent = message;
}

async function getSelectionFromActiveTab() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
        return "";
    }

    try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "CLARIFAI_GET_SELECTION"
        });

        return (response?.text || "").trim();
    } catch {
        return "";
    }
}

async function explainText() {
    const input = sourceTextEl.value.trim();

    if (!input) {
        setStatus("テキストを入力してください。");
        return;
    }

    explainBtn.disabled = true;
    setStatus("説明を生成中...");
    const requestId = ++activeRequestId;

    if (requestId > 1) {
        chrome.runtime
            .sendMessage({
                type: "CLARIFAI_CANCEL_EXPLANATION",
                clientId: CLIENT_ID,
                requestId: requestId - 1
            })
            .catch(() => {});
    }

    try {
        const response = await chrome.runtime.sendMessage({
            type: "CLARIFAI_EXPLAIN_TEXT",
            text: input,
            clientId: CLIENT_ID,
            requestId
        });

        if (requestId !== activeRequestId) {
            return;
        }

        if (!response?.ok) {
            throw new Error(response?.error || "Unknown error");
        }

        setResult(response.explanation || "結果が返りませんでした。");
        setStatus("完了");
    } catch (error) {
        if (requestId !== activeRequestId) {
            return;
        }

        if (error?.message === "Request canceled") {
            return;
        }

        setResult("");
        setStatus(`失敗: ${error?.message || "Unknown error"}`);
    } finally {
        if (requestId === activeRequestId) {
            explainBtn.disabled = false;
        }
    }
}

useSelectionBtn.addEventListener("click", async () => {
    setStatus("現在のページの選択テキストを取得中...");

    const selectedText = await getSelectionFromActiveTab();
    if (!selectedText) {
        setStatus("選択テキストが見つかりません。");
        return;
    }

    sourceTextEl.value = selectedText;
    setStatus("選択テキストを読み込みました。");
});

explainBtn.addEventListener("click", explainText);
