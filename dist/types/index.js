"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeError = exports.RiskError = exports.TradingError = void 0;
class TradingError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'TradingError';
    }
}
exports.TradingError = TradingError;
class RiskError extends Error {
    constructor(message, riskType, details) {
        super(message);
        this.riskType = riskType;
        this.details = details;
        this.name = 'RiskError';
    }
}
exports.RiskError = RiskError;
class ExchangeError extends Error {
    constructor(message, exchange, code, details) {
        super(message);
        this.exchange = exchange;
        this.code = code;
        this.details = details;
        this.name = 'ExchangeError';
    }
}
exports.ExchangeError = ExchangeError;
//# sourceMappingURL=index.js.map