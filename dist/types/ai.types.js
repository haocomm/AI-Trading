"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptEngineeringError = exports.EnsembleError = exports.AIProviderError = void 0;
class AIProviderError extends Error {
    constructor(message, provider, code, recoverable = true) {
        super(message);
        this.provider = provider;
        this.code = code;
        this.recoverable = recoverable;
        this.name = 'AIProviderError';
    }
}
exports.AIProviderError = AIProviderError;
class EnsembleError extends Error {
    constructor(message, providers, cause) {
        super(message);
        this.providers = providers;
        this.cause = cause;
        this.name = 'EnsembleError';
    }
}
exports.EnsembleError = EnsembleError;
class PromptEngineeringError extends Error {
    constructor(message, templateId, variable) {
        super(message);
        this.templateId = templateId;
        this.variable = variable;
        this.name = 'PromptEngineeringError';
    }
}
exports.PromptEngineeringError = PromptEngineeringError;
//# sourceMappingURL=ai.types.js.map