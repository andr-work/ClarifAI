const ClarifaiLLM = (() => {
    const SYSTEM_PROMPT = [
        "You are a helpful dictionary assistant.",
        "Explain words and phrases for English learners (CEFR A2-B1).",
        "Explain the FULL selected text exactly as provided.",
        "If input is a sentence, explain the sentence meaning (not only one word).",
        "If input is a single word or short phrase, explain that word or phrase.",
        "originText must be exactly the same as the input text.",
        "Use very simple words and short sentences.",
        "Keep description to 1-2 short sentences (max 25 words total).",
        "Avoid idioms, jargon, and difficult grammar.",
        "Return ONLY valid JSON with this exact schema:",
        '{"originText":"", "partOfSpeech":"", "description":"", "similar1":"", "similar2":"", "similar3":""}',
        "Set partOfSpeech to one short label like noun, verb, adjective, phrase, sentence.",
        "If partOfSpeech is sentence, describe the whole sentence meaning clearly and simply.",
        "similar1-3 must be easy alternatives (single words or short phrases).",
        "Do not include markdown or extra text.",
    ].join("\n\n");

    const BASE_EXPLANATION_SCHEMA = {
        type: "object",
        required: [
            "originText",
            "partOfSpeech",
            "description",
            "similar1",
            "similar2",
            "similar3",
        ],
        additionalProperties: false,
        properties: {
            originText: { type: "string" },
            partOfSpeech: { type: "string" },
            description: { type: "string" },
            similar1: { type: "string" },
            similar2: { type: "string" },
            similar3: { type: "string" },
        },
    };

    function normalizeInput(value) {
        return globalThis.ClarifaiNormalize?.normalizeInput(value) || "";
    }

    function sanitizeOriginalInput(value) {
        return globalThis.ClarifaiNormalize?.sanitizeOriginalInput(value) || "";
    }

    function getClientKey(sender, message) {
        if (message?.clientId) {
            return String(message.clientId);
        }

        if (sender?.tab?.id !== undefined) {
            return `tab:${sender.tab.id}:${sender.frameId ?? 0}`;
        }

        return "popup:default";
    }

    function isAbortError(error) {
        const message = String(error?.message || "");
        return error?.name === "AbortError" || message.toLowerCase().includes("abort");
    }

    function isUnsupportedOptionsError(error) {
        const message = String(error?.message || "").toLowerCase();
        return (
            error instanceof TypeError ||
            message.includes("responseconstraint") ||
            message.includes("initialprompts") ||
            message.includes("unknown") ||
            message.includes("unsupported")
        );
    }

    async function createSession() {
        try {
            return await LanguageModel.create({
                initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
            });
        } catch (error) {
            if (!isUnsupportedOptionsError(error)) {
                throw error;
            }

            return LanguageModel.create();
        }
    }

    async function promptWithConstraint(session, input, signal) {
        const explanationSchema = {
            ...BASE_EXPLANATION_SCHEMA,
            properties: {
                ...BASE_EXPLANATION_SCHEMA.properties,
                originText: { type: "string", const: input },
            },
        };

        try {
            return await session.prompt(input, {
                responseConstraint: explanationSchema,
                signal,
            });
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            if (!isUnsupportedOptionsError(error)) {
                throw error;
            }

            const fallbackInput = `Text:\n\n${input}\n\n${SYSTEM_PROMPT}`;
            return session.prompt(fallbackInput);
        }
    }

    function parseExplanationResult(raw, originalText) {
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            return {
                originText: originalText,
                partOfSpeech: String(parsed.partOfSpeech || "").trim().toLowerCase(),
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

    async function generateExplanationWithAbort(text, signal) {
        const originalInput = sanitizeOriginalInput(text);
        const input = normalizeInput(originalInput);
        let session;

        if (!input) {
            throw new Error("No text provided.");
        }

        if (!globalThis.LanguageModel?.create) {
            throw new Error("LanguageModel API is not available in this Chrome environment.");
        }

        try {
            session = await createSession();
            const output = await promptWithConstraint(session, input, signal);
            const normalizedOutput =
                typeof output === "string" ? output.trim() : JSON.stringify(output);
            return parseExplanationResult(
                normalizedOutput || "No explanation returned.",
                originalInput,
            );
        } finally {
            try {
                session?.destroy?.();
            } catch {
                // ignore destroy failures
            }
        }
    }

    return {
        normalizeInput,
        getClientKey,
        isAbortError,
        generateExplanationWithAbort,
    };
})();

self.ClarifaiLLM = ClarifaiLLM;
