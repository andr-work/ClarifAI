const ClarifaiNormalize = (() => {
    const MAX_INPUT_LENGTH = 2000;
    const ASCII_PUNCTUATION_REGEX = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

    function sanitizeOriginalInput(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_INPUT_LENGTH);
    }

    function normalizeInput(value) {
        return sanitizeOriginalInput(value)
            .replace(ASCII_PUNCTUATION_REGEX, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    return {
        sanitizeOriginalInput,
        normalizeInput,
    };
})();

self.ClarifaiNormalize = ClarifaiNormalize;
