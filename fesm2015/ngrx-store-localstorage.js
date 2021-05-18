import deepmerge from 'deepmerge';
import { INIT, UPDATE } from '@ngrx/store';

const detectDate = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;
// correctly parse dates from local storage
const dateReviver = (_key, value) => {
    if (typeof value === 'string' && detectDate.test(value)) {
        return new Date(value);
    }
    return value;
};
const dummyReviver = (_key, value) => value;
const checkIsBrowserEnv = () => {
    return typeof window !== 'undefined';
};
const validateStateKeys = (keys) => {
    return keys.map((key) => {
        let attr = key;
        if (typeof key === 'object') {
            attr = Object.keys(key)[0];
        }
        if (typeof attr !== 'string') {
            throw new TypeError(`localStorageSync Unknown Parameter Type: ` + `Expected type of string, got ${typeof attr}`);
        }
        return key;
    });
};
const rehydrateApplicationState = (keys, storage, storageKeySerializer, restoreDates) => {
    return keys.reduce((acc, curr) => {
        let key = curr;
        let reviver = restoreDates ? dateReviver : dummyReviver;
        let deserialize;
        let decrypt;
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
                    console.error(`Either encrypt or decrypt is not a function on '${curr[key]}' key object.`);
                }
            }
            else if (curr[key].encrypt || curr[key].decrypt) {
                // Let know that one of the encryption functions is not provided
                console.error(`Either encrypt or decrypt function is not present on '${curr[key]}' key object.`);
            }
        }
        if (storage !== undefined) {
            let stateSlice = storage.getItem(storageKeySerializer(key));
            if (stateSlice) {
                // Use provided decrypt function
                if (decrypt) {
                    stateSlice = decrypt(stateSlice);
                }
                const isObjectRegex = new RegExp('{|\\[');
                let raw = stateSlice;
                if (stateSlice === 'null' || stateSlice === 'true' || stateSlice === 'false' || isObjectRegex.test(stateSlice.charAt(0))) {
                    raw = JSON.parse(stateSlice, reviver);
                }
                return Object.assign({}, acc, {
                    [key]: deserialize ? deserialize(raw) : raw,
                });
            }
        }
        return acc;
    }, {});
};
// Recursively traverse all properties of the existing slice as defined by the `filter` argument,
// and output the new object with extraneous properties removed.
function createStateSlice(existingSlice, filter) {
    return filter.reduce((memo, attr) => {
        if (typeof attr === 'string' || typeof attr === 'number') {
            const value = existingSlice === null || existingSlice === void 0 ? void 0 : existingSlice[attr];
            if (value !== undefined) {
                memo[attr] = value;
            }
        }
        else {
            for (const key in attr) {
                if (Object.prototype.hasOwnProperty.call(attr, key)) {
                    const element = attr[key];
                    memo[key] = createStateSlice(existingSlice[key], element);
                }
            }
        }
        return memo;
    }, {});
}
const syncStateUpdate = (state, keys, storage, storageKeySerializer, removeOnUndefined, syncCondition) => {
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
    keys.forEach((key) => {
        let stateSlice = state[key];
        let replacer;
        let space;
        let encrypt;
        if (typeof key === 'object') {
            let name = Object.keys(key)[0];
            stateSlice = state[name];
            if (typeof stateSlice !== 'undefined' && key[name]) {
                // use serialize function if specified.
                if (key[name].serialize) {
                    stateSlice = key[name].serialize(stateSlice);
                }
                else {
                    // if serialize function is not specified filter on fields if an array has been provided.
                    let filter;
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
                        console.error(`Either encrypt or decrypt function is not present on '${key[name]}' key object.`);
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
                console.warn(`Exception on removing/cleaning undefined '${key}' state`, e);
            }
        }
    });
};
// Default merge strategy is a full deep merge.
const defaultMergeReducer = (state, rehydratedState, action) => {
    if ((action.type === INIT || action.type === UPDATE) && rehydratedState) {
        const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;
        const options = {
            arrayMerge: overwriteMerge,
        };
        state = deepmerge(state, rehydratedState, options);
    }
    return state;
};
const localStorageSync = (config) => (reducer) => {
    if ((config.storage === undefined && !config.checkStorageAvailability) ||
        (config.checkStorageAvailability && checkIsBrowserEnv())) {
        config.storage = localStorage || window.localStorage;
    }
    if (config.storageKeySerializer === undefined) {
        config.storageKeySerializer = (key) => key;
    }
    if (config.restoreDates === undefined) {
        config.restoreDates = true;
    }
    // Use default merge reducer.
    let mergeReducer = config.mergeReducer;
    if (mergeReducer === undefined || typeof mergeReducer !== 'function') {
        mergeReducer = defaultMergeReducer;
    }
    const stateKeys = validateStateKeys(config.keys);
    const rehydratedState = config.rehydrate
        ? rehydrateApplicationState(stateKeys, config.storage, config.storageKeySerializer, config.restoreDates)
        : undefined;
    return function (state, action) {
        let nextState;
        // If state arrives undefined, we need to let it through the supplied reducer
        // in order to get a complete state as defined by user
        if (action.type === INIT && !state) {
            nextState = reducer(state, action);
        }
        else {
            nextState = Object.assign({}, state);
        }
        // Merge the store state with the rehydrated state using
        // either a user-defined reducer or the default.
        nextState = mergeReducer(nextState, rehydratedState, action);
        nextState = reducer(nextState, action);
        if (action.type !== INIT) {
            syncStateUpdate(nextState, stateKeys, config.storage, config.storageKeySerializer, config.removeOnUndefined, config.syncCondition);
        }
        return nextState;
    };
};

/**
 * Generated bundle index. Do not edit.
 */

export { dateReviver, defaultMergeReducer, localStorageSync, rehydrateApplicationState, syncStateUpdate };
//# sourceMappingURL=ngrx-store-localstorage.js.map