"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useConfirmar = useConfirmar;
var react_1 = require("react");
function useConfirmar() {
    var _a = (0, react_1.useState)({
        isOpen: false,
        titulo: "Confirmar ação",
        mensagem: "",
        textoCancelar: "Cancelar",
        textoConfirmar: "Confirmar",
        perigo: false,
    }), state = _a[0], setState = _a[1];
    var confirmar = (0, react_1.useCallback)(function (opcoes) {
        return new Promise(function (resolve) {
            var _a, _b, _c, _d;
            setState({
                isOpen: true,
                titulo: (_a = opcoes.titulo) !== null && _a !== void 0 ? _a : "Confirmar ação",
                mensagem: opcoes.mensagem,
                textoCancelar: (_b = opcoes.textoCancelar) !== null && _b !== void 0 ? _b : "Cancelar",
                textoConfirmar: (_c = opcoes.textoConfirmar) !== null && _c !== void 0 ? _c : "Confirmar",
                perigo: (_d = opcoes.perigo) !== null && _d !== void 0 ? _d : false,
                resolver: resolve,
            });
        });
    }, []);
    var handleConfirm = (0, react_1.useCallback)(function () {
        var _a;
        (_a = state.resolver) === null || _a === void 0 ? void 0 : _a.call(state, true);
        setState(function (prev) { return (__assign(__assign({}, prev), { isOpen: false })); });
    }, [state.resolver]);
    var handleCancel = (0, react_1.useCallback)(function () {
        var _a;
        (_a = state.resolver) === null || _a === void 0 ? void 0 : _a.call(state, false);
        setState(function (prev) { return (__assign(__assign({}, prev), { isOpen: false })); });
    }, [state.resolver]);
    var dialogo = isOpen = { state: state, : .isOpen };
    title = { state: state, : .titulo };
    message = { state: state, : .mensagem };
    cancelText = { state: state, : .textoCancelar };
    confirmText = { state: state, : .textoConfirmar };
    isDanger = { state: state, : .perigo };
    onConfirm = { handleConfirm: handleConfirm };
    onCancel = { handleCancel: handleCancel }
        /  >
    ;
    ;
    return { confirmar: confirmar, dialogo: dialogo };
}
