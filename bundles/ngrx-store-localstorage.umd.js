(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('deepmerge'), require('@ngrx/store')) :
    typeof define === 'function' && define.amd ? define('ngrx-store-localstorage', ['exports', 'deepmerge', '@ngrx/store'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global['ngrx-store-localstorage'] = {}, global.deepmerge, global.ngrx.store));
}(this, (function (exports, deepmerge, store) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var deepmerge__default = /*#__PURE__*/_interopDefaultLegacy(deepmerge);

    var detectDate = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;
    // correctly parse dates from local storage
    var dateReviver = function (_key, value) {
        if (typeof value === 'string' && detectDate.test(value)) {
            return new Date(value);
        }
        return value;
    };
    var dummyReviver = function (_key, value) { return value; };
    var checkIsBrowserEnv = function () {
        return typeof window !== 'undefined';
    };
    var validateStateKeys = function (keys) {
        return keys.map(function (key) {
            var attr = key;
            if (typeof key === 'object') {
                attr = Object.keys(key)[0];
            }
            if (typeof attr !== 'string') {
                throw new TypeError("localStorageSync Unknown Parameter Type: " + ("Expected type of string, got " + typeof attr));
            }
            return key;
        });
    };
    var rehydrateApplicationState = function (keys, storage, storageKeySerializer, restoreDates) {
        return keys.reduce(function (acc, curr) {
            var _a;
            var key = curr;
            var reviver = restoreDates ? dateReviver : dummyReviver;
            var deserialize;
            var decrypt;
            if (typeof key === 'object') {
                key = Object.keys(key)[0];
                // use the custom reviver function
                if (typeof curr[key] === 'function') {
                    reviver = curr[key];
                }
                else {
                    // use custom reviver function if available
                    if (curr[key].reviver) {
                        reviver = curr[key].reviver;
                    }
                    // use custom serialize function if available
                    if (curr[key].deserialize) {
                        deserialize = curr[key].deserialize;
                    }
                }
                // Ensure that encrypt and decrypt functions are both present
                if (curr[key].encrypt && curr[key].decrypt) {
                    if (typeof curr[key].encrypt === 'function' && typeof curr[key].decrypt === 'function') {
                        decrypt = curr[key].decrypt;
                    }
                    else {
                        console.error("Either encrypt or decrypt is not a function on '" + curr[key] + "' key object.");
                    }
                }
                else if (curr[key].encrypt || curr[key].decrypt) {
                    // Let know that one of the encryption functions is not provided
                    console.error("Either encrypt or decrypt function is not present on '" + curr[key] + "' key object.");
                }
            }
            if (storage !== undefined) {
                var stateSlice = storage.getItem(storageKeySerializer(key));
                if (stateSlice) {
                    // Use provided decrypt function
                    if (decrypt) {
                        stateSlice = decrypt(stateSlice);
                    }
                    var isObjectRegex = new RegExp('{|\\[');
                    var raw = stateSlice;
                    if (stateSlice === 'null' || stateSlice === 'true' || stateSlice === 'false' || isObjectRegex.test(stateSlice.charAt(0))) {
                        raw = JSON.parse(stateSlice, reviver);
                    }
                    return Object.assign({}, acc, (_a = {},
                        _a[key] = deserialize ? deserialize(raw) : raw,
                        _a));
                }
            }
            return acc;
        }, {});
    };
    // Recursively traverse all properties of the existing slice as defined by the `filter` argument,
    // and output the new object with extraneous properties removed.
    function createStateSlice(existingSlice, filter) {
        return filter.reduce(function (memo, attr) {
            if (typeof attr === 'string' || typeof attr === 'number') {
                var value = existingSlice === null || existingSlice === void 0 ? void 0 : existingSlice[attr];
                if (value !== undefined) {
                    memo[attr] = value;
                }
            }
            else {
                for (var key in attr) {
                    if (Object.prototype.hasOwnProperty.call(attr, key)) {
                        var element = attr[key];
                        memo[key] = createStateSlice(existingSlice[key], element);
                    }
                }
            }
            return memo;
        }, {});
    }
    var syncStateUpdate = function (state, keys, storage, storageKeySerializer, removeOnUndefined, syncCondition) {
        if (syncCondition) {
            try {
                if (syncCondition(state) !== true) {
                    return;
                }
            }
            catch (e) {
                // Treat TypeError as do not sync
                if (e instanceof TypeError) {
                    return;
                }
                throw e;
            }
        }
        keys.forEach(function (key) {
            var stateSlice = state[key];
            var replacer;
            var space;
            var encrypt;
            if (typeof key === 'object') {
                var name = Object.keys(key)[0];
                stateSlice = state[name];
                if (typeof stateSlice !== 'undefined' && key[name]) {
                    // use serialize function if specified.
                    if (key[name].serialize) {
                        stateSlice = key[name].serialize(stateSlice);
                    }
                    else {
                        // if serialize function is not specified filter on fields if an array has been provided.
                        var filter = void 0;
                        if (key[name].reduce) {
                            filter = key[name];
                        }
                        else if (key[name].filter) {
                            filter = key[name].filter;
                        }
                        if (filter) {
                            stateSlice = createStateSlice(stateSlice, filter);
                        }
                        // Check if encrypt and decrypt are present, also checked at this#rehydrateApplicationState()
                        if (key[name].encrypt && key[name].decrypt) {
                            if (typeof key[name].encrypt === 'function') {
                                encrypt = key[name].encrypt;
                            }
                        }
                        else if (key[name].encrypt || key[name].decrypt) {
                            // If one of those is not present, then let know that one is missing
                            console.error("Either encrypt or decrypt function is not present on '" + key[name] + "' key object.");
                        }
                    }
                    /*
              Replacer and space arguments to pass to JSON.stringify.
              If these fields don't exist, undefined will be passed.
            */
                    replacer = key[name].replacer;
                    space = key[name].space;
                }
                key = name;
            }
            if (typeof stateSlice !== 'undefined' && storage !== undefined) {
                try {
                    if (encrypt) {
                        // ensure that a string message is passed
                        stateSlice = encrypt(typeof stateSlice === 'string' ? stateSlice : JSON.stringify(stateSlice, replacer, space));
                    }
                    storage.setItem(storageKeySerializer(key), typeof stateSlice === 'string' ? stateSlice : JSON.stringify(stateSlice, replacer, space));
                }
                catch (e) {
                    console.warn('Unable to save state to localStorage:', e);
                }
            }
            else if (typeof stateSlice === 'undefined' && removeOnUndefined) {
                try {
                    storage.removeItem(storageKeySerializer(key));
                }
                catch (e) {
                    console.warn("Exception on removing/cleaning undefined '" + key + "' state", e);
                }
            }
        });
    };
    // Default merge strategy is a full deep merge.
    var defaultMergeReducer = function (state, rehydratedState, action) {
        if ((action.type === store.INIT || action.type === store.UPDATE) && rehydratedState) {
            var overwriteMerge = function (destinationArray, sourceArray, options) { return sourceArray; };
            var options = {
                arrayMerge: overwriteMerge,
            };
            state = deepmerge__default['default'](state, rehydratedState, options);
        }
        return state;
    };
    var localStorageSync = function (config) { return function (reducer) {
        if ((config.storage === undefined && !config.checkStorageAvailability) ||
            (config.checkStorageAvailability && checkIsBrowserEnv())) {
            config.storage = localStorage || window.localStorage;
        }
        if (config.storageKeySerializer === undefined) {
            config.storageKeySerializer = function (key) { return key; };
        }
        if (config.restoreDates === undefined) {
            config.restoreDates = true;
        }
        // Use default merge reducer.
        var mergeReducer = config.mergeReducer;
        if (mergeReducer === undefined || typeof mergeReducer !== 'function') {
            mergeReducer = defaultMergeReducer;
        }
        var stateKeys = validateStateKeys(config.keys);
        var rehydratedState = config.rehydrate
            ? rehydrateApplicationState(stateKeys, config.storage, config.storageKeySerializer, config.restoreDates)
            : undefined;
        return function (state, action) {
            var nextState;
            // If state arrives undefined, we need to let it through the supplied reducer
            // in order to get a complete state as defined by user
            if (action.type === store.INIT && !state) {
                nextState = reducer(state, action);
            }
            else {
                nextState = Object.assign({}, state);
            }
            // Merge the store state with the rehydrated state using
            // either a user-defined reducer or the default.
            nextState = mergeReducer(nextState, rehydratedState, action);
            nextState = reducer(nextState, action);
            if (action.type !== store.INIT) {
                syncStateUpdate(nextState, stateKeys, config.storage, config.storageKeySerializer, config.removeOnUndefined, config.syncCondition);
            }
            return nextState;
        };
    }; };

    /**
     * Generated bundle index. Do not edit.
     */

    exports.dateReviver = dateReviver;
    exports.defaultMergeReducer = defaultMergeReducer;
    exports.localStorageSync = localStorageSync;
    exports.rehydrateApplicationState = rehydrateApplicationState;
    exports.syncStateUpdate = syncStateUpdate;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=ngrx-store-localstorage.umd.js.map
