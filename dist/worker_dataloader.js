var MSG_SUBSCRIBE = 1;
var MSG_UNSUBSCRIBE = 2;
var MSG_SET_RANGE_OF_INTEREST = 3;
var MSG_REALTIME_DATA = 4;
var MSG_HISTORICAL_DATA = 5;

/*
 * Dexie.js - a minimalistic wrapper for IndexedDB
 * ===============================================
 *
 * By David Fahlander, david.fahlander@gmail.com
 *
 * Version 1.5.1, Tue Nov 01 2016
 * www.dexie.com
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */
var keys = Object.keys;
var isArray = Array.isArray;
var _global =
    typeof self !== 'undefined' ? self :
    typeof window !== 'undefined' ? window :
    global;

function extend(obj, extension) {
    if (typeof extension !== 'object') return obj;
    keys(extension).forEach(function (key) {
        obj[key] = extension[key];
    });
    return obj;
}

const getProto = Object.getPrototypeOf;
const _hasOwn = {}.hasOwnProperty;
function hasOwn(obj, prop) {
    return _hasOwn.call(obj, prop);
}

function props (proto, extension) {
    if (typeof extension === 'function') extension = extension(getProto(proto));
    keys(extension).forEach(key => {
        setProp(proto, key, extension[key]);
    });
}

function setProp(obj, prop, functionOrGetSet, options) {
    Object.defineProperty(obj, prop, extend(functionOrGetSet && hasOwn(functionOrGetSet, "get") && typeof functionOrGetSet.get === 'function' ?
        {get: functionOrGetSet.get, set: functionOrGetSet.set, configurable: true} :
        {value: functionOrGetSet, configurable: true, writable: true}, options));
}

function derive(Child) {
    return {
        from: function (Parent) {
            Child.prototype = Object.create(Parent.prototype);
            setProp(Child.prototype, "constructor", Child);
            return {
                extend: props.bind(null, Child.prototype)
            };
        }
    };
}

const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

function getPropertyDescriptor(obj, prop) {
    var pd = getOwnPropertyDescriptor(obj, prop),
        proto;
    return pd || (proto = getProto(obj)) && getPropertyDescriptor (proto, prop);
}

var _slice = [].slice;
function slice(args, start, end) {
    return _slice.call(args, start, end);
}

function override(origFunc, overridedFactory) {
    return overridedFactory(origFunc);
}

function doFakeAutoComplete(fn) {
    var to = setTimeout(fn, 1000);
    clearTimeout(to);
}

function assert (b) {
    if (!b) throw new Error("Assertion Failed");
}

function asap(fn) {
    if (_global.setImmediate) setImmediate(fn); else setTimeout(fn, 0);
}



/** Generate an object (hash map) based on given array.
 * @param extractor Function taking an array item and its index and returning an array of 2 items ([key, value]) to
 *        instert on the resulting object for each item in the array. If this function returns a falsy value, the
 *        current item wont affect the resulting object.
 */
function arrayToObject (array, extractor) {
    return array.reduce((result, item, i) => {
        var nameAndValue = extractor(item, i);
        if (nameAndValue) result[nameAndValue[0]] = nameAndValue[1];
        return result;
    }, {});
}

function trycatcher(fn, reject) {
    return function () {
        try {
            fn.apply(this, arguments);
        } catch (e) {
            reject(e);
        }
    };
}

function tryCatch(fn, onerror, args) {
    try {
        fn.apply(null, args);
    } catch (ex) {
        onerror && onerror(ex);
    }
}

function getByKeyPath(obj, keyPath) {
    // http://www.w3.org/TR/IndexedDB/#steps-for-extracting-a-key-from-a-value-using-a-key-path
    if (hasOwn(obj, keyPath)) return obj[keyPath]; // This line is moved from last to first for optimization purpose.
    if (!keyPath) return obj;
    if (typeof keyPath !== 'string') {
        var rv = [];
        for (var i = 0, l = keyPath.length; i < l; ++i) {
            var val = getByKeyPath(obj, keyPath[i]);
            rv.push(val);
        }
        return rv;
    }
    var period = keyPath.indexOf('.');
    if (period !== -1) {
        var innerObj = obj[keyPath.substr(0, period)];
        return innerObj === undefined ? undefined : getByKeyPath(innerObj, keyPath.substr(period + 1));
    }
    return undefined;
}

function setByKeyPath(obj, keyPath, value) {
    if (!obj || keyPath === undefined) return;
    if ('isFrozen' in Object && Object.isFrozen(obj)) return;
    if (typeof keyPath !== 'string' && 'length' in keyPath) {
        assert(typeof value !== 'string' && 'length' in value);
        for (var i = 0, l = keyPath.length; i < l; ++i) {
            setByKeyPath(obj, keyPath[i], value[i]);
        }
    } else {
        var period = keyPath.indexOf('.');
        if (period !== -1) {
            var currentKeyPath = keyPath.substr(0, period);
            var remainingKeyPath = keyPath.substr(period + 1);
            if (remainingKeyPath === "")
                if (value === undefined) delete obj[currentKeyPath]; else obj[currentKeyPath] = value;
            else {
                var innerObj = obj[currentKeyPath];
                if (!innerObj) innerObj = (obj[currentKeyPath] = {});
                setByKeyPath(innerObj, remainingKeyPath, value);
            }
        } else {
            if (value === undefined) delete obj[keyPath]; else obj[keyPath] = value;
        }
    }
}

function delByKeyPath(obj, keyPath) {
    if (typeof keyPath === 'string')
        setByKeyPath(obj, keyPath, undefined);
    else if ('length' in keyPath)
        [].map.call(keyPath, function(kp) {
            setByKeyPath(obj, kp, undefined);
        });
}

function shallowClone(obj) {
    var rv = {};
    for (var m in obj) {
        if (hasOwn(obj, m)) rv[m] = obj[m];
    }
    return rv;
}

function deepClone(any) {
    if (!any || typeof any !== 'object') return any;
    var rv;
    if (isArray(any)) {
        rv = [];
        for (var i = 0, l = any.length; i < l; ++i) {
            rv.push(deepClone(any[i]));
        }
    } else if (any instanceof Date) {
        rv = new Date();
        rv.setTime(any.getTime());
    } else {
        rv = any.constructor ? Object.create(any.constructor.prototype) : {};
        for (var prop in any) {
            if (hasOwn(any, prop)) {
                rv[prop] = deepClone(any[prop]);
            }
        }
    }
    return rv;
}

function getObjectDiff(a, b, rv, prfx) {
    // Compares objects a and b and produces a diff object.
    rv = rv || {};
    prfx = prfx || '';
    keys(a).forEach(prop => {
        if (!hasOwn(b, prop))
            rv[prfx+prop] = undefined; // Property removed
        else {
            var ap = a[prop],
                bp = b[prop];
            if (typeof ap === 'object' && typeof bp === 'object' &&
                    ap && bp &&
                    ap.constructor === bp.constructor)
                // Same type of object but its properties may have changed
                getObjectDiff (ap, bp, rv, prfx + prop + ".");
            else if (ap !== bp)
                rv[prfx + prop] = b[prop];// Primitive value changed
        }
    });
    keys(b).forEach(prop => {
        if (!hasOwn(a, prop)) {
            rv[prfx+prop] = b[prop]; // Property added
        }
    });
    return rv;
}

// If first argument is iterable or array-like, return it as an array
const iteratorSymbol = typeof Symbol !== 'undefined' && Symbol.iterator;
const getIteratorOf = iteratorSymbol ? function(x) {
    var i;
    return x != null && (i = x[iteratorSymbol]) && i.apply(x);
} : function () { return null; };

const NO_CHAR_ARRAY = {};
// Takes one or several arguments and returns an array based on the following criteras:
// * If several arguments provided, return arguments converted to an array in a way that
//   still allows javascript engine to optimize the code.
// * If single argument is an array, return a clone of it.
// * If this-pointer equals NO_CHAR_ARRAY, don't accept strings as valid iterables as a special
//   case to the two bullets below.
// * If single argument is an iterable, convert it to an array and return the resulting array.
// * If single argument is array-like (has length of type number), convert it to an array.
function getArrayOf (arrayLike) {
    var i, a, x, it;
    if (arguments.length === 1) {
        if (isArray(arrayLike)) return arrayLike.slice();
        if (this === NO_CHAR_ARRAY && typeof arrayLike === 'string') return [arrayLike];
        if ((it = getIteratorOf(arrayLike))) {
            a = [];
            while ((x = it.next()), !x.done) a.push(x.value);
            return a;
        }
        if (arrayLike == null) return [arrayLike];
        i = arrayLike.length;
        if (typeof i === 'number') {
            a = new Array(i);
            while (i--) a[i] = arrayLike[i];
            return a;
        }
        return [arrayLike];
    }
    i = arguments.length;
    a = new Array(i);
    while (i--) a[i] = arguments[i];
    return a;
}

const concat = [].concat;
function flatten (a) {
    return concat.apply([], a);
}

function nop() { }
function mirror(val) { return val; }
function pureFunctionChain(f1, f2) {
    // Enables chained events that takes ONE argument and returns it to the next function in chain.
    // This pattern is used in the hook("reading") event.
    if (f1 == null || f1 === mirror) return f2;
    return function (val) {
        return f2(f1(val));
    };
}

function callBoth(on1, on2) {
    return function () {
        on1.apply(this, arguments);
        on2.apply(this, arguments);
    };
}

function hookCreatingChain(f1, f2) {
    // Enables chained events that takes several arguments and may modify first argument by making a modification and then returning the same instance.
    // This pattern is used in the hook("creating") event.
    if (f1 === nop) return f2;
    return function () {
        var res = f1.apply(this, arguments);
        if (res !== undefined) arguments[0] = res;
        var onsuccess = this.onsuccess, // In case event listener has set this.onsuccess
            onerror = this.onerror;     // In case event listener has set this.onerror
        this.onsuccess = null;
        this.onerror = null;
        var res2 = f2.apply(this, arguments);
        if (onsuccess) this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
        if (onerror) this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
        return res2 !== undefined ? res2 : res;
    };
}

function hookDeletingChain(f1, f2) {
    if (f1 === nop) return f2;
    return function () {
        f1.apply(this, arguments);
        var onsuccess = this.onsuccess, // In case event listener has set this.onsuccess
            onerror = this.onerror;     // In case event listener has set this.onerror
        this.onsuccess = this.onerror = null;
        f2.apply(this, arguments);
        if (onsuccess) this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
        if (onerror) this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
    };
}

function hookUpdatingChain(f1, f2) {
    if (f1 === nop) return f2;
    return function (modifications) {
        var res = f1.apply(this, arguments);
        extend(modifications, res); // If f1 returns new modifications, extend caller's modifications with the result before calling next in chain.
        var onsuccess = this.onsuccess, // In case event listener has set this.onsuccess
            onerror = this.onerror;     // In case event listener has set this.onerror
        this.onsuccess = null;
        this.onerror = null;
        var res2 = f2.apply(this, arguments);
        if (onsuccess) this.onsuccess = this.onsuccess ? callBoth(onsuccess, this.onsuccess) : onsuccess;
        if (onerror) this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
        return res === undefined ?
            (res2 === undefined ? undefined : res2) :
            (extend(res, res2));
    };
}

function reverseStoppableEventChain(f1, f2) {
    if (f1 === nop) return f2;
    return function () {
        if (f2.apply(this, arguments) === false) return false;
        return f1.apply(this, arguments);
    };
}



function promisableChain(f1, f2) {
    if (f1 === nop) return f2;
    return function () {
        var res = f1.apply(this, arguments);
        if (res && typeof res.then === 'function') {
            var thiz = this,
                i = arguments.length,
                args = new Array(i);
            while (i--) args[i] = arguments[i];
            return res.then(function () {
                return f2.apply(thiz, args);
            });
        }
        return f2.apply(this, arguments);
    };
}

// By default, debug will be true only if platform is a web platform and its page is served from localhost.
// When debug = true, error's stacks will contain asyncronic long stacks.
var debug = typeof location !== 'undefined' &&
        // By default, use debug mode if served from localhost.
        /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);

function setDebug(value, filter) {
    debug = value;
    libraryFilter = filter;
}

var libraryFilter = () => true;

const NEEDS_THROW_FOR_STACK = !new Error("").stack;

function getErrorWithStack() {
    "use strict";
    if (NEEDS_THROW_FOR_STACK) try {
        // Doing something naughty in strict mode here to trigger a specific error
        // that can be explicitely ignored in debugger's exception settings.
        // If we'd just throw new Error() here, IE's debugger's exception settings
        // will just consider it as "exception thrown by javascript code" which is
        // something you wouldn't want it to ignore.
        getErrorWithStack.arguments;
        throw new Error(); // Fallback if above line don't throw.
    } catch(e) {
        return e;
    }
    return new Error();
}

function prettyStack(exception, numIgnoredFrames) {
    var stack = exception.stack;
    if (!stack) return "";
    numIgnoredFrames = (numIgnoredFrames || 0);
    if (stack.indexOf(exception.name) === 0)
        numIgnoredFrames += (exception.name + exception.message).split('\n').length;
    return stack.split('\n')
        .slice(numIgnoredFrames)
        .filter(libraryFilter)
        .map(frame => "\n" + frame)
        .join('');
}

function deprecated (what, fn) {
    return function () {
        console.warn(`${what} is deprecated. See https://github.com/dfahlander/Dexie.js/wiki/Deprecations. ${prettyStack(getErrorWithStack(), 1)}`);
        return fn.apply(this, arguments);
    }
}

var dexieErrorNames = [
    'Modify',
    'Bulk',
    'OpenFailed',
    'VersionChange',
    'Schema',
    'Upgrade',
    'InvalidTable',
    'MissingAPI',
    'NoSuchDatabase',
    'InvalidArgument',
    'SubTransaction',
    'Unsupported',
    'Internal',
    'DatabaseClosed',
    'IncompatiblePromise'
];

var idbDomErrorNames = [
    'Unknown',
    'Constraint',
    'Data',
    'TransactionInactive',
    'ReadOnly',
    'Version',
    'NotFound',
    'InvalidState',
    'InvalidAccess',
    'Abort',
    'Timeout',
    'QuotaExceeded',
    'Syntax',
    'DataClone'
];

var errorList = dexieErrorNames.concat(idbDomErrorNames);

var defaultTexts = {
    VersionChanged: "Database version changed by other database connection",
    DatabaseClosed: "Database has been closed",
    Abort: "Transaction aborted",
    TransactionInactive: "Transaction has already completed or failed"
};

//
// DexieError - base class of all out exceptions.
//
function DexieError (name, msg) {
    // Reason we don't use ES6 classes is because:
    // 1. It bloats transpiled code and increases size of minified code.
    // 2. It doesn't give us much in this case.
    // 3. It would require sub classes to call super(), which
    //    is not needed when deriving from Error.
    this._e = getErrorWithStack();
    this.name = name;
    this.message = msg;
}

derive(DexieError).from(Error).extend({
    stack: {
        get: function() {
            return this._stack ||
                (this._stack = this.name + ": " + this.message + prettyStack(this._e, 2));
        }
    },
    toString: function(){ return this.name + ": " + this.message; }
});

function getMultiErrorMessage (msg, failures) {
    return msg + ". Errors: " + failures
        .map(f=>f.toString())
        .filter((v,i,s)=>s.indexOf(v) === i) // Only unique error strings
        .join('\n');
}

//
// ModifyError - thrown in WriteableCollection.modify()
// Specific constructor because it contains members failures and failedKeys.
//
function ModifyError (msg, failures, successCount, failedKeys) {
    this._e = getErrorWithStack();
    this.failures = failures;
    this.failedKeys = failedKeys;
    this.successCount = successCount;
}
derive(ModifyError).from(DexieError);

function BulkError (msg, failures) {
    this._e = getErrorWithStack();
    this.name = "BulkError";
    this.failures = failures;
    this.message = getMultiErrorMessage(msg, failures);
}
derive(BulkError).from(DexieError);

//
//
// Dynamically generate error names and exception classes based
// on the names in errorList.
//
//

// Map of {ErrorName -> ErrorName + "Error"}
var errnames = errorList.reduce((obj,name)=>(obj[name]=name+"Error",obj),{});

// Need an alias for DexieError because we're gonna create subclasses with the same name.
const BaseException = DexieError;
// Map of {ErrorName -> exception constructor}
var exceptions = errorList.reduce((obj,name)=>{
    // Let the name be "DexieError" because this name may
    // be shown in call stack and when debugging. DexieError is
    // the most true name because it derives from DexieError,
    // and we cannot change Function.name programatically without
    // dynamically create a Function object, which would be considered
    // 'eval-evil'.
    var fullName = name + "Error";
    function DexieError (msgOrInner, inner){
        this._e = getErrorWithStack();
        this.name = fullName;
        if (!msgOrInner) {
            this.message = defaultTexts[name] || fullName;
            this.inner = null;
        } else if (typeof msgOrInner === 'string') {
            this.message = msgOrInner;
            this.inner = inner || null;
        } else if (typeof msgOrInner === 'object') {
            this.message = `${msgOrInner.name} ${msgOrInner.message}`;
            this.inner = msgOrInner;
        }
    }
    derive(DexieError).from(BaseException);
    obj[name]=DexieError;
    return obj;
},{});

// Use ECMASCRIPT standard exceptions where applicable:
exceptions.Syntax = SyntaxError;
exceptions.Type = TypeError;
exceptions.Range = RangeError;

var exceptionMap = idbDomErrorNames.reduce((obj, name)=>{
    obj[name + "Error"] = exceptions[name];
    return obj;
}, {});

function mapError (domError, message) {
    if (!domError || domError instanceof DexieError || domError instanceof TypeError || domError instanceof SyntaxError || !domError.name || !exceptionMap[domError.name])
        return domError;
    var rv = new exceptionMap[domError.name](message || domError.message, domError);
    if ("stack" in domError) {
        // Derive stack from inner exception if it has a stack
        setProp(rv, "stack", {get: function(){
            return this.inner.stack;
        }});
    }
    return rv;
}

var fullNameExceptions = errorList.reduce((obj, name)=>{
    if (["Syntax","Type","Range"].indexOf(name) === -1)
        obj[name + "Error"] = exceptions[name];
    return obj;
}, {});

fullNameExceptions.ModifyError = ModifyError;
fullNameExceptions.DexieError = DexieError;
fullNameExceptions.BulkError = BulkError;

function Events(ctx) {
    var evs = {};
    var rv = function (eventName, subscriber) {
        if (subscriber) {
            // Subscribe. If additional arguments than just the subscriber was provided, forward them as well.
            var i = arguments.length, args = new Array(i - 1);
            while (--i) args[i - 1] = arguments[i];
            evs[eventName].subscribe.apply(null, args);
            return ctx;
        } else if (typeof (eventName) === 'string') {
            // Return interface allowing to fire or unsubscribe from event
            return evs[eventName];
        }
    };
    rv.addEventType = add;
    
    for (var i = 1, l = arguments.length; i < l; ++i) {
        add(arguments[i]);
    }
    
    return rv;

    function add(eventName, chainFunction, defaultFunction) {
        if (typeof eventName === 'object') return addConfiguredEvents(eventName);
        if (!chainFunction) chainFunction = reverseStoppableEventChain;
        if (!defaultFunction) defaultFunction = nop;

        var context = {
            subscribers: [],
            fire: defaultFunction,
            subscribe: function (cb) {
                if (context.subscribers.indexOf(cb) === -1) {
                    context.subscribers.push(cb);
                    context.fire = chainFunction(context.fire, cb);
                }
            },
            unsubscribe: function (cb) {
                context.subscribers = context.subscribers.filter(function (fn) { return fn !== cb; });
                context.fire = context.subscribers.reduce(chainFunction, defaultFunction);
            }
        };
        evs[eventName] = rv[eventName] = context;
        return context;
    }

    function addConfiguredEvents(cfg) {
        // events(this, {reading: [functionChain, nop]});
        keys(cfg).forEach(function (eventName) {
            var args = cfg[eventName];
            if (isArray(args)) {
                add(eventName, cfg[eventName][0], cfg[eventName][1]);
            } else if (args === 'asap') {
                // Rather than approaching event subscription using a functional approach, we here do it in a for-loop where subscriber is executed in its own stack
                // enabling that any exception that occur wont disturb the initiator and also not nescessary be catched and forgotten.
                var context = add(eventName, mirror, function fire() {
                    // Optimazation-safe cloning of arguments into args.
                    var i = arguments.length, args = new Array(i);
                    while (i--) args[i] = arguments[i];
                    // All each subscriber:
                    context.subscribers.forEach(function (fn) {
                        asap(function fireEvent() {
                            fn.apply(null, args);
                        });
                    });
                });
            } else throw new exceptions.InvalidArgument("Invalid event config");
        });
    }
}

//
// Promise Class for Dexie library
//
// I started out writing this Promise class by copying promise-light (https://github.com/taylorhakes/promise-light) by
// https://github.com/taylorhakes - an A+ and ECMASCRIPT 6 compliant Promise implementation.
//
// Modifications needed to be done to support indexedDB because it wont accept setTimeout()
// (See discussion: https://github.com/promises-aplus/promises-spec/issues/45) .
// This topic was also discussed in the following thread: https://github.com/promises-aplus/promises-spec/issues/45
//
// This implementation will not use setTimeout or setImmediate when it's not needed. The behavior is 100% Promise/A+ compliant since
// the caller of new Promise() can be certain that the promise wont be triggered the lines after constructing the promise.
//
// In previous versions this was fixed by not calling setTimeout when knowing that the resolve() or reject() came from another
// tick. In Dexie v1.4.0, I've rewritten the Promise class entirely. Just some fragments of promise-light is left. I use
// another strategy now that simplifies everything a lot: to always execute callbacks in a new tick, but have an own microTick
// engine that is used instead of setImmediate() or setTimeout().
// Promise class has also been optimized a lot with inspiration from bluebird - to avoid closures as much as possible.
// Also with inspiration from bluebird, asyncronic stacks in debug mode.
//
// Specific non-standard features of this Promise class:
// * Async static context support (Promise.PSD)
// * Promise.follow() method built upon PSD, that allows user to track all promises created from current stack frame
//   and below + all promises that those promises creates or awaits.
// * Detect any unhandled promise in a PSD-scope (PSD.onunhandled). 
//
// David Fahlander, https://github.com/dfahlander
//

// Just a pointer that only this module knows about.
// Used in Promise constructor to emulate a private constructor.
var INTERNAL = {};

// Async stacks (long stacks) must not grow infinitely.
var LONG_STACKS_CLIP_LIMIT = 100;
var MAX_LONG_STACKS = 20;
var stack_being_generated = false;

/* The default "nextTick" function used only for the very first promise in a promise chain.
   As soon as then promise is resolved or rejected, all next tasks will be executed in micro ticks
   emulated in this module. For indexedDB compatibility, this means that every method needs to 
   execute at least one promise before doing an indexedDB operation. Dexie will always call 
   db.ready().then() for every operation to make sure the indexedDB event is started in an
   emulated micro tick.
*/
var schedulePhysicalTick = (_global.setImmediate ? 
    // setImmediate supported. Those modern platforms also supports Function.bind().
    setImmediate.bind(null, physicalTick) :
    _global.MutationObserver ?
        // MutationObserver supported
        () => {
            var hiddenDiv = document.createElement("div");
            (new MutationObserver(() => {
                physicalTick();
                hiddenDiv = null;
            })).observe(hiddenDiv, { attributes: true });
            hiddenDiv.setAttribute('i', '1');
        } :
        // No support for setImmediate or MutationObserver. No worry, setTimeout is only called
        // once time. Every tick that follows will be our emulated micro tick.
        // Could have uses setTimeout.bind(null, 0, physicalTick) if it wasnt for that FF13 and below has a bug 
        ()=>{setTimeout(physicalTick,0);}
);

// Confifurable through Promise.scheduler.
// Don't export because it would be unsafe to let unknown
// code call it unless they do try..catch within their callback.
// This function can be retrieved through getter of Promise.scheduler though,
// but users must not do Promise.scheduler (myFuncThatThrows exception)!
var asap$1 = function (callback, args) {
    microtickQueue.push([callback, args]);
    if (needsNewPhysicalTick) {
        schedulePhysicalTick();
        needsNewPhysicalTick = false;
    }
};

var isOutsideMicroTick = true;
var needsNewPhysicalTick = true;
var unhandledErrors = [];
var rejectingErrors = [];
var currentFulfiller = null;
var rejectionMapper = mirror; // Remove in next major when removing error mapping of DOMErrors and DOMExceptions
    
var globalPSD = {
    global: true,
    ref: 0,
    unhandleds: [],
    onunhandled: globalError,
    //env: null, // Will be set whenever leaving a scope using wrappers.snapshot()
    finalize: function () {
        this.unhandleds.forEach(uh => {
            try {
                globalError(uh[0], uh[1]);
            } catch (e) {}
        });
    }
};

var PSD = globalPSD;

var microtickQueue = []; // Callbacks to call in this or next physical tick.
var numScheduledCalls = 0; // Number of listener-calls left to do in this physical tick.
var tickFinalizers = []; // Finalizers to call when there are no more async calls scheduled within current physical tick.

// Wrappers are not being used yet. Their framework is functioning and can be used
// to replace environment during a PSD scope (a.k.a. 'zone').
/* **KEEP** export var wrappers = (() => {
    var wrappers = [];

    return {
        snapshot: () => {
            var i = wrappers.length,
                result = new Array(i);
            while (i--) result[i] = wrappers[i].snapshot();
            return result;
        },
        restore: values => {
            var i = wrappers.length;
            while (i--) wrappers[i].restore(values[i]);
        },
        wrap: () => wrappers.map(w => w.wrap()),
        add: wrapper => {
            wrappers.push(wrapper);
        }
    };
})();
*/

function Promise$1(fn) {
    if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');    
    this._listeners = [];
    this.onuncatched = nop; // Deprecate in next major. Not needed. Better to use global error handler.
    
    // A library may set `promise._lib = true;` after promise is created to make resolve() or reject()
    // execute the microtask engine implicitely within the call to resolve() or reject().
    // To remain A+ compliant, a library must only set `_lib=true` if it can guarantee that the stack
    // only contains library code when calling resolve() or reject().
    // RULE OF THUMB: ONLY set _lib = true for promises explicitely resolving/rejecting directly from
    // global scope (event handler, timer etc)!
    this._lib = false;
    // Current async scope
    var psd = (this._PSD = PSD);

    if (debug) {
        this._stackHolder = getErrorWithStack();
        this._prev = null;
        this._numPrev = 0; // Number of previous promises (for long stacks)
        linkToPreviousPromise(this, currentFulfiller);
    }
    
    if (typeof fn !== 'function') {
        if (fn !== INTERNAL) throw new TypeError('Not a function');
        // Private constructor (INTERNAL, state, value).
        // Used internally by Promise.resolve() and Promise.reject().
        this._state = arguments[1];
        this._value = arguments[2];
        if (this._state === false)
            handleRejection(this, this._value); // Map error, set stack and addPossiblyUnhandledError().
        return;
    }
    
    this._state = null; // null (=pending), false (=rejected) or true (=resolved)
    this._value = null; // error or result
    ++psd.ref; // Refcounting current scope
    executePromiseTask(this, fn);
}

props(Promise$1.prototype, {

    then: function (onFulfilled, onRejected) {
        var rv = new Promise$1((resolve, reject) => {
            propagateToListener(this, new Listener(onFulfilled, onRejected, resolve, reject));
        });
        debug && (!this._prev || this._state === null) && linkToPreviousPromise(rv, this);
        return rv;
    },
    
    _then: function (onFulfilled, onRejected) {
        // A little tinier version of then() that don't have to create a resulting promise.
        propagateToListener(this, new Listener(null, null, onFulfilled, onRejected));        
    },

    catch: function (onRejected) {
        if (arguments.length === 1) return this.then(null, onRejected);
        // First argument is the Error type to catch
        var type = arguments[0],
            handler = arguments[1];
        return typeof type === 'function' ? this.then(null, err =>
            // Catching errors by its constructor type (similar to java / c++ / c#)
            // Sample: promise.catch(TypeError, function (e) { ... });
            err instanceof type ? handler(err) : PromiseReject(err))
        : this.then(null, err =>
            // Catching errors by the error.name property. Makes sense for indexedDB where error type
            // is always DOMError but where e.name tells the actual error type.
            // Sample: promise.catch('ConstraintError', function (e) { ... });
            err && err.name === type ? handler(err) : PromiseReject(err));
    },

    finally: function (onFinally) {
        return this.then(value => {
            onFinally();
            return value;
        }, err => {
            onFinally();
            return PromiseReject(err);
        });
    },
    
    // Deprecate in next major. Needed only for db.on.error.
    uncaught: function (uncaughtHandler) {
        // Be backward compatible and use "onuncatched" as the event name on this.
        // Handle multiple subscribers through reverseStoppableEventChain(). If a handler returns `false`, bubbling stops.
        this.onuncatched = reverseStoppableEventChain(this.onuncatched, uncaughtHandler);
        // In case caller does this on an already rejected promise, assume caller wants to point out the error to this promise and not
        // a previous promise. Reason: the prevous promise may lack onuncatched handler. 
        if (this._state === false && unhandledErrors.indexOf(this) === -1) {
            // Replace unhandled error's destinaion promise with this one!
            unhandledErrors.some((p,i,l) => p._value === this._value && (l[i] = this));
            // Actually we do this shit because we need to support db.on.error() correctly during db.open(). If we deprecate db.on.error, we could
            // take away this piece of code as well as the onuncatched and uncaught() method.
        }
        return this;
    },
        
    stack: {
        get: function() {
            if (this._stack) return this._stack;
            try {
                stack_being_generated = true;
                var stacks = getStack (this, [], MAX_LONG_STACKS);
                var stack = stacks.join("\nFrom previous: ");
                if (this._state !== null) this._stack = stack; // Stack may be updated on reject.
                return stack;
            } finally {
                stack_being_generated = false;
            }
        }
    }
});

function Listener(onFulfilled, onRejected, resolve, reject) {
    this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
    this.onRejected = typeof onRejected === 'function' ? onRejected : null;
    this.resolve = resolve;
    this.reject = reject;
    this.psd = PSD;
}

// Promise Static Properties
props (Promise$1, {
    all: function () {
        var values = getArrayOf.apply(null, arguments); // Supports iterables, implicit arguments and array-like.
        return new Promise$1(function (resolve, reject) {
            if (values.length === 0) resolve([]);
            var remaining = values.length;
            values.forEach((a,i) => Promise$1.resolve(a).then(x => {
                values[i] = x;
                if (!--remaining) resolve(values);
            }, reject));
        });
    },
    
    resolve: value => {
        if (value instanceof Promise$1) return value;
        if (value && typeof value.then === 'function') return new Promise$1((resolve, reject)=>{
            value.then(resolve, reject);
        });
        return new Promise$1(INTERNAL, true, value);
    },
    
    reject: PromiseReject,
    
    race: function () {
        var values = getArrayOf.apply(null, arguments);
        return new Promise$1((resolve, reject) => {
            values.map(value => Promise$1.resolve(value).then(resolve, reject));
        });
    },
    
    PSD: {
        get: ()=>PSD,
        set: value => PSD = value
    },
    
    newPSD: newScope,
    
    usePSD: usePSD,
    
    scheduler: {
        get: () => asap$1,
        set: value => {asap$1 = value;}
    },
    
    rejectionMapper: {
        get: () => rejectionMapper,
        set: value => {rejectionMapper = value;} // Map reject failures
    },
            
    follow: fn => {
        return new Promise$1((resolve, reject) => {
            return newScope((resolve, reject) => {
                var psd = PSD;
                psd.unhandleds = []; // For unhandled standard- or 3rd party Promises. Checked at psd.finalize()
                psd.onunhandled = reject; // Triggered directly on unhandled promises of this library.
                psd.finalize = callBoth(function () {
                    // Unhandled standard or 3rd part promises are put in PSD.unhandleds and
                    // examined upon scope completion while unhandled rejections in this Promise
                    // will trigger directly through psd.onunhandled
                    run_at_end_of_this_or_next_physical_tick(()=>{
                        this.unhandleds.length === 0 ? resolve() : reject(this.unhandleds[0]);
                    });
                }, psd.finalize);
                fn();
            }, resolve, reject);
        });
    },

    on: Events(null, {"error": [
        reverseStoppableEventChain,
        defaultErrorHandler] // Default to defaultErrorHandler
    })

});

var PromiseOnError = Promise$1.on.error;
PromiseOnError.subscribe = deprecated ("Promise.on('error')", PromiseOnError.subscribe);
PromiseOnError.unsubscribe = deprecated ("Promise.on('error').unsubscribe", PromiseOnError.unsubscribe);

/**
* Take a potentially misbehaving resolver function and make sure
* onFulfilled and onRejected are only called once.
*
* Makes no guarantees about asynchrony.
*/
function executePromiseTask (promise, fn) {
    // Promise Resolution Procedure:
    // https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
    try {
        fn(value => {
            if (promise._state !== null) return;
            if (value === promise) throw new TypeError('A promise cannot be resolved with itself.');
            var shouldExecuteTick = promise._lib && beginMicroTickScope();
            if (value && typeof value.then === 'function') {
                executePromiseTask(promise, (resolve, reject) => {
                    value instanceof Promise$1 ?
                        value._then(resolve, reject) :
                        value.then(resolve, reject);
                });
            } else {
                promise._state = true;
                promise._value = value;
                propagateAllListeners(promise);
            }
            if (shouldExecuteTick) endMicroTickScope();
        }, handleRejection.bind(null, promise)); // If Function.bind is not supported. Exception is handled in catch below
    } catch (ex) {
        handleRejection(promise, ex);
    }
}

function handleRejection (promise, reason) {
    rejectingErrors.push(reason);
    if (promise._state !== null) return;
    var shouldExecuteTick = promise._lib && beginMicroTickScope();
    reason = rejectionMapper(reason);
    promise._state = false;
    promise._value = reason;
    debug && reason !== null && typeof reason === 'object' && !reason._promise && tryCatch(()=>{
        var origProp = getPropertyDescriptor(reason, "stack");        
        reason._promise = promise;    
        setProp(reason, "stack", {
            get: () =>
                stack_being_generated ?
                    origProp && (origProp.get ?
                                origProp.get.apply(reason) :
                                origProp.value) :
                    promise.stack
        });
    });
    // Add the failure to a list of possibly uncaught errors
    addPossiblyUnhandledError(promise);
    propagateAllListeners(promise);
    if (shouldExecuteTick) endMicroTickScope();
}

function propagateAllListeners (promise) {
    //debug && linkToPreviousPromise(promise);
    var listeners = promise._listeners;
    promise._listeners = [];
    for (var i = 0, len = listeners.length; i < len; ++i) {
        propagateToListener(promise, listeners[i]);
    }
    var psd = promise._PSD;
    --psd.ref || psd.finalize(); // if psd.ref reaches zero, call psd.finalize();
    if (numScheduledCalls === 0) {
        // If numScheduledCalls is 0, it means that our stack is not in a callback of a scheduled call,
        // and that no deferreds where listening to this rejection or success.
        // Since there is a risk that our stack can contain application code that may
        // do stuff after this code is finished that may generate new calls, we cannot
        // call finalizers here.
        ++numScheduledCalls;
        asap$1(()=>{
            if (--numScheduledCalls === 0) finalizePhysicalTick(); // Will detect unhandled errors
        }, []);
    }
}

function propagateToListener(promise, listener) {
    if (promise._state === null) {
        promise._listeners.push(listener);
        return;
    }

    var cb = promise._state ? listener.onFulfilled : listener.onRejected;
    if (cb === null) {
        // This Listener doesnt have a listener for the event being triggered (onFulfilled or onReject) so lets forward the event to any eventual listeners on the Promise instance returned by then() or catch()
        return (promise._state ? listener.resolve : listener.reject) (promise._value);
    }
    var psd = listener.psd;
    ++psd.ref;
    ++numScheduledCalls;
    asap$1 (callListener, [cb, promise, listener]);
}

function callListener (cb, promise, listener) {
    var outerScope = PSD;
    var psd = listener.psd;
    try {
        if (psd !== outerScope) {
            // **KEEP** outerScope.env = wrappers.snapshot(); // Snapshot outerScope's environment.
            PSD = psd;
            // **KEEP** wrappers.restore(psd.env); // Restore PSD's environment.
        }
        
        // Set static variable currentFulfiller to the promise that is being fullfilled,
        // so that we connect the chain of promises (for long stacks support)
        currentFulfiller = promise;
        
        // Call callback and resolve our listener with it's return value.
        var value = promise._value,
            ret;
        if (promise._state) {
            ret = cb (value);
        } else {
            if (rejectingErrors.length) rejectingErrors = [];
            ret = cb(value);
            if (rejectingErrors.indexOf(value) === -1)
                markErrorAsHandled(promise); // Callback didnt do Promise.reject(err) nor reject(err) onto another promise.
        }
        listener.resolve(ret);
    } catch (e) {
        // Exception thrown in callback. Reject our listener.
        listener.reject(e);
    } finally {
        // Restore PSD, env and currentFulfiller.
        if (psd !== outerScope) {
            PSD = outerScope;
            // **KEEP** wrappers.restore(outerScope.env); // Restore outerScope's environment
        }
        currentFulfiller = null;
        if (--numScheduledCalls === 0) finalizePhysicalTick();
        --psd.ref || psd.finalize();
    }
}

function getStack (promise, stacks, limit) {
    if (stacks.length === limit) return stacks;
    var stack = "";
    if (promise._state === false) {
        var failure = promise._value,
            errorName,
            message;
        
        if (failure != null) {
            errorName = failure.name || "Error";
            message = failure.message || failure;
            stack = prettyStack(failure, 0);
        } else {
            errorName = failure; // If error is undefined or null, show that.
            message = "";
        }
        stacks.push(errorName + (message ? ": " + message : "") + stack);
    }
    if (debug) {
        stack = prettyStack(promise._stackHolder, 2);
        if (stack && stacks.indexOf(stack) === -1) stacks.push(stack);
        if (promise._prev) getStack(promise._prev, stacks, limit);
    }
    return stacks;
}

function linkToPreviousPromise(promise, prev) {
    // Support long stacks by linking to previous completed promise.
    var numPrev = prev ? prev._numPrev + 1 : 0;
    if (numPrev < LONG_STACKS_CLIP_LIMIT) { // Prohibit infinite Promise loops to get an infinite long memory consuming "tail".
        promise._prev = prev;
        promise._numPrev = numPrev;
    }
}

/* The callback to schedule with setImmediate() or setTimeout().
   It runs a virtual microtick and executes any callback registered in microtickQueue.
 */
function physicalTick() {
    beginMicroTickScope() && endMicroTickScope();
}

function beginMicroTickScope() {
    var wasRootExec = isOutsideMicroTick;
    isOutsideMicroTick = false;
    needsNewPhysicalTick = false;
    return wasRootExec;
}

/* Executes micro-ticks without doing try..catch.
   This can be possible because we only use this internally and
   the registered functions are exception-safe (they do try..catch
   internally before calling any external method). If registering
   functions in the microtickQueue that are not exception-safe, this
   would destroy the framework and make it instable. So we don't export
   our asap method.
*/
function endMicroTickScope() {
    var callbacks, i, l;
    do {
        while (microtickQueue.length > 0) {
            callbacks = microtickQueue;
            microtickQueue = [];
            l = callbacks.length;
            for (i = 0; i < l; ++i) {
                var item = callbacks[i];
                item[0].apply(null, item[1]);
            }
        }
    } while (microtickQueue.length > 0);
    isOutsideMicroTick = true;
    needsNewPhysicalTick = true;
}

function finalizePhysicalTick() {
    var unhandledErrs = unhandledErrors;
    unhandledErrors = [];
    unhandledErrs.forEach(p => {
        p._PSD.onunhandled.call(null, p._value, p);
    });
    var finalizers = tickFinalizers.slice(0); // Clone first because finalizer may remove itself from list.
    var i = finalizers.length;
    while (i) finalizers[--i]();    
}

function run_at_end_of_this_or_next_physical_tick (fn) {
    function finalizer() {
        fn();
        tickFinalizers.splice(tickFinalizers.indexOf(finalizer), 1);
    }
    tickFinalizers.push(finalizer);
    ++numScheduledCalls;
    asap$1(()=>{
        if (--numScheduledCalls === 0) finalizePhysicalTick();
    }, []);
}

function addPossiblyUnhandledError(promise) {
    // Only add to unhandledErrors if not already there. The first one to add to this list
    // will be upon the first rejection so that the root cause (first promise in the
    // rejection chain) is the one listed.
    if (!unhandledErrors.some(p => p._value === promise._value))
        unhandledErrors.push(promise);
}

function markErrorAsHandled(promise) {
    // Called when a reject handled is actually being called.
    // Search in unhandledErrors for any promise whos _value is this promise_value (list
    // contains only rejected promises, and only one item per error)
    var i = unhandledErrors.length;
    while (i) if (unhandledErrors[--i]._value === promise._value) {
        // Found a promise that failed with this same error object pointer,
        // Remove that since there is a listener that actually takes care of it.
        unhandledErrors.splice(i, 1);
        return;
    }
}

// By default, log uncaught errors to the console
function defaultErrorHandler(e) {
    console.warn(`Unhandled rejection: ${e.stack || e}`);
}

function PromiseReject (reason) {
    return new Promise$1(INTERNAL, false, reason);
}

function wrap (fn, errorCatcher) {
    var psd = PSD;
    return function() {
        var wasRootExec = beginMicroTickScope(),
            outerScope = PSD;

        try {
            if (outerScope !== psd) {
                // **KEEP** outerScope.env = wrappers.snapshot(); // Snapshot outerScope's environment
                PSD = psd;
                // **KEEP** wrappers.restore(psd.env); // Restore PSD's environment.
            }
            return fn.apply(this, arguments);
        } catch (e) {
            errorCatcher && errorCatcher(e);
        } finally {
            if (outerScope !== psd) {
                PSD = outerScope;
                // **KEEP** wrappers.restore(outerScope.env); // Restore outerScope's environment
            }
            if (wasRootExec) endMicroTickScope();
        }
    };
}
    
function newScope (fn, a1, a2, a3) {
    var parent = PSD,
        psd = Object.create(parent);
    psd.parent = parent;
    psd.ref = 0;
    psd.global = false;
    // **KEEP** psd.env = wrappers.wrap(psd);
    
    // unhandleds and onunhandled should not be specifically set here.
    // Leave them on parent prototype.
    // unhandleds.push(err) will push to parent's prototype
    // onunhandled() will call parents onunhandled (with this scope's this-pointer though!)
    ++parent.ref;
    psd.finalize = function () {
        --this.parent.ref || this.parent.finalize();
    };
    var rv = usePSD (psd, fn, a1, a2, a3);
    if (psd.ref === 0) psd.finalize();
    return rv;
}

function usePSD (psd, fn, a1, a2, a3) {
    var outerScope = PSD;
    try {
        if (psd !== outerScope) {
            // **KEEP** outerScope.env = wrappers.snapshot(); // snapshot outerScope's environment.
            PSD = psd;
            // **KEEP** wrappers.restore(psd.env); // Restore PSD's environment.
        }
        return fn(a1, a2, a3);
    } finally {
        if (psd !== outerScope) {
            PSD = outerScope;
            // **KEEP** wrappers.restore(outerScope.env); // Restore outerScope's environment.
        }
    }
}

const UNHANDLEDREJECTION = "unhandledrejection";

function globalError(err, promise) {
    var rv;
    try {
        rv = promise.onuncatched(err);
    } catch (e) {}
    if (rv !== false) try {
        var event, eventData = {promise: promise, reason: err};
        if (_global.document && document.createEvent) {
            event = document.createEvent('Event');
            event.initEvent(UNHANDLEDREJECTION, true, true);
            extend(event, eventData);
        } else if (_global.CustomEvent) {
            event = new CustomEvent(UNHANDLEDREJECTION, {detail: eventData});
            extend(event, eventData);
        }
        if (event && _global.dispatchEvent) {
            dispatchEvent(event);
            if (!_global.PromiseRejectionEvent && _global.onunhandledrejection)
                // No native support for PromiseRejectionEvent but user has set window.onunhandledrejection. Manually call it.
                try {_global.onunhandledrejection(event);} catch (_) {}
        }
        if (!event.defaultPrevented) {
            // Backward compatibility: fire to events registered at Promise.on.error
            Promise$1.on.error.fire(err, promise);
        }
    } catch (e) {}
}


/* **KEEP** 

export function wrapPromise(PromiseClass) {
    var proto = PromiseClass.prototype;
    var origThen = proto.then;
    
    wrappers.add({
        snapshot: () => proto.then,
        restore: value => {proto.then = value;},
        wrap: () => patchedThen
    });

    function patchedThen (onFulfilled, onRejected) {
        var promise = this;
        var onFulfilledProxy = wrap(function(value){
            var rv = value;
            if (onFulfilled) {
                rv = onFulfilled(rv);
                if (rv && typeof rv.then === 'function') rv.then(); // Intercept that promise as well.
            }
            --PSD.ref || PSD.finalize();
            return rv;
        });
        var onRejectedProxy = wrap(function(err){
            promise._$err = err;
            var unhandleds = PSD.unhandleds;
            var idx = unhandleds.length,
                rv;
            while (idx--) if (unhandleds[idx]._$err === err) break;
            if (onRejected) {
                if (idx !== -1) unhandleds.splice(idx, 1); // Mark as handled.
                rv = onRejected(err);
                if (rv && typeof rv.then === 'function') rv.then(); // Intercept that promise as well.
            } else {
                if (idx === -1) unhandleds.push(promise);
                rv = PromiseClass.reject(err);
                rv._$nointercept = true; // Prohibit eternal loop.
            }
            --PSD.ref || PSD.finalize();
            return rv;
        });
        
        if (this._$nointercept) return origThen.apply(this, arguments);
        ++PSD.ref;
        return origThen.call(this, onFulfilledProxy, onRejectedProxy);
    }
}

// Global Promise wrapper
if (_global.Promise) wrapPromise(_global.Promise);

*/

doFakeAutoComplete(() => {
    // Simplify the job for VS Intellisense. This piece of code is one of the keys to the new marvellous intellisense support in Dexie.
    asap$1 = (fn, args) => {
        setTimeout(()=>{fn.apply(null, args);}, 0);
    };
});

function rejection (err, uncaughtHandler) {
    // Get the call stack and return a rejected promise.
    var rv = Promise$1.reject(err);
    return uncaughtHandler ? rv.uncaught(uncaughtHandler) : rv;
}

/*
 * Dexie.js - a minimalistic wrapper for IndexedDB
 * ===============================================
 *
 * By David Fahlander, david.fahlander@gmail.com
 *
 * Version 1.5.1, Tue Nov 01 2016
 *
 * http://dexie.org
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */

var DEXIE_VERSION = '1.5.1';
var maxString = String.fromCharCode(65535);
var maxKey = (function(){try {IDBKeyRange.only([[]]);return [[]];}catch(e){return maxString;}})();
var INVALID_KEY_ARGUMENT = "Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.";
var STRING_EXPECTED = "String expected.";
var connections = [];
var isIEOrEdge = typeof navigator !== 'undefined' && /(MSIE|Trident|Edge)/.test(navigator.userAgent);
var hasIEDeleteObjectStoreBug = isIEOrEdge;
var hangsOnDeleteLargeKeyRange = isIEOrEdge;
var dexieStackFrameFilter = frame => !/(dexie\.js|dexie\.min\.js)/.test(frame);

setDebug(debug, dexieStackFrameFilter);

function Dexie(dbName, options) {
    /// <param name="options" type="Object" optional="true">Specify only if you wich to control which addons that should run on this instance</param>
    var deps = Dexie.dependencies;
    var opts = extend({
        // Default Options
        addons: Dexie.addons,           // Pick statically registered addons by default
        autoOpen: true,                 // Don't require db.open() explicitely.
        indexedDB: deps.indexedDB,      // Backend IndexedDB api. Default to IDBShim or browser env.
        IDBKeyRange: deps.IDBKeyRange   // Backend IDBKeyRange api. Default to IDBShim or browser env.
    }, options);
    var addons = opts.addons,
        autoOpen = opts.autoOpen,
        indexedDB = opts.indexedDB,
        IDBKeyRange = opts.IDBKeyRange;

    var globalSchema = this._dbSchema = {};
    var versions = [];
    var dbStoreNames = [];
    var allTables = {};
    ///<var type="IDBDatabase" />
    var idbdb = null; // Instance of IDBDatabase
    var dbOpenError = null;
    var isBeingOpened = false;
    var openComplete = false;
    var READONLY = "readonly", READWRITE = "readwrite";
    var db = this;
    var dbReadyResolve,
        dbReadyPromise = new Promise$1(resolve => {
            dbReadyResolve = resolve;
        }),
        cancelOpen,
        openCanceller = new Promise$1((_, reject) => {
            cancelOpen = reject;
        });
    var autoSchema = true;
    var hasNativeGetDatabaseNames = !!getNativeGetDatabaseNamesFn(indexedDB),
        hasGetAll;

    function init() {
        // Default subscribers to "versionchange" and "blocked".
        // Can be overridden by custom handlers. If custom handlers return false, these default
        // behaviours will be prevented.
        db.on("versionchange", function (ev) {
            // Default behavior for versionchange event is to close database connection.
            // Caller can override this behavior by doing db.on("versionchange", function(){ return false; });
            // Let's not block the other window from making it's delete() or open() call.
            // NOTE! This event is never fired in IE,Edge or Safari.
            if (ev.newVersion > 0)
                console.warn(`Another connection wants to upgrade database '${db.name}'. Closing db now to resume the upgrade.`);
            else
                console.warn(`Another connection wants to delete database '${db.name}'. Closing db now to resume the delete request.`);
            db.close();
            // In many web applications, it would be recommended to force window.reload()
            // when this event occurs. To do that, subscribe to the versionchange event
            // and call window.location.reload(true) if ev.newVersion > 0 (not a deletion)
            // The reason for this is that your current web app obviously has old schema code that needs
            // to be updated. Another window got a newer version of the app and needs to upgrade DB but
            // your window is blocking it unless we close it here.
        });
        db.on("blocked", ev => {
            if (!ev.newVersion || ev.newVersion < ev.oldVersion)
                console.warn(`Dexie.delete('${db.name}') was blocked`);
            else
                console.warn(`Upgrade '${db.name}' blocked by other connection holding version ${ev.oldVersion/10}`);
        });
    }

    //
    //
    //
    // ------------------------- Versioning Framework---------------------------
    //
    //
    //

    this.version = function (versionNumber) {
        /// <param name="versionNumber" type="Number"></param>
        /// <returns type="Version"></returns>
        if (idbdb || isBeingOpened) throw new exceptions.Schema("Cannot add version when database is open");
        this.verno = Math.max(this.verno, versionNumber);
        var versionInstance = versions.filter(function (v) { return v._cfg.version === versionNumber; })[0];
        if (versionInstance) return versionInstance;
        versionInstance = new Version(versionNumber);
        versions.push(versionInstance);
        versions.sort(lowerVersionFirst);
        return versionInstance;
    };

    function Version(versionNumber) {
        this._cfg = {
            version: versionNumber,
            storesSource: null,
            dbschema: {},
            tables: {},
            contentUpgrade: null
        };
        this.stores({}); // Derive earlier schemas by default.
    }

    extend(Version.prototype, {
        stores: function (stores) {
            /// <summary>
            ///   Defines the schema for a particular version
            /// </summary>
            /// <param name="stores" type="Object">
            /// Example: <br/>
            ///   {users: "id++,first,last,&amp;username,*email", <br/>
            ///   passwords: "id++,&amp;username"}<br/>
            /// <br/>
            /// Syntax: {Table: "[primaryKey][++],[&amp;][*]index1,[&amp;][*]index2,..."}<br/><br/>
            /// Special characters:<br/>
            ///  "&amp;"  means unique key, <br/>
            ///  "*"  means value is multiEntry, <br/>
            ///  "++" means auto-increment and only applicable for primary key <br/>
            /// </param>
            this._cfg.storesSource = this._cfg.storesSource ? extend(this._cfg.storesSource, stores) : stores;

            // Derive stores from earlier versions if they are not explicitely specified as null or a new syntax.
            var storesSpec = {};
            versions.forEach(function (version) { // 'versions' is always sorted by lowest version first.
                extend(storesSpec, version._cfg.storesSource);
            });

            var dbschema = (this._cfg.dbschema = {});
            this._parseStoresSpec(storesSpec, dbschema);
            // Update the latest schema to this version
            // Update API
            globalSchema = db._dbSchema = dbschema;
            removeTablesApi([allTables, db, Transaction.prototype]);
            setApiOnPlace([allTables, db, Transaction.prototype, this._cfg.tables], keys(dbschema), READWRITE, dbschema);
            dbStoreNames = keys(dbschema);
            return this;
        },
        upgrade: function (upgradeFunction) {
            /// <param name="upgradeFunction" optional="true">Function that performs upgrading actions.</param>
            var self = this;
            fakeAutoComplete(function () {
                upgradeFunction(db._createTransaction(READWRITE, keys(self._cfg.dbschema), self._cfg.dbschema));// BUGBUG: No code completion for prev version's tables wont appear.
            });
            this._cfg.contentUpgrade = upgradeFunction;
            return this;
        },
        _parseStoresSpec: function (stores, outSchema) {
            keys(stores).forEach(function (tableName) {
                if (stores[tableName] !== null) {
                    var instanceTemplate = {};
                    var indexes = parseIndexSyntax(stores[tableName]);
                    var primKey = indexes.shift();
                    if (primKey.multi) throw new exceptions.Schema("Primary key cannot be multi-valued");
                    if (primKey.keyPath) setByKeyPath(instanceTemplate, primKey.keyPath, primKey.auto ? 0 : primKey.keyPath);
                    indexes.forEach(function (idx) {
                        if (idx.auto) throw new exceptions.Schema("Only primary key can be marked as autoIncrement (++)");
                        if (!idx.keyPath) throw new exceptions.Schema("Index must have a name and cannot be an empty string");
                        setByKeyPath(instanceTemplate, idx.keyPath, idx.compound ? idx.keyPath.map(function () { return ""; }) : "");
                    });
                    outSchema[tableName] = new TableSchema(tableName, primKey, indexes, instanceTemplate);
                }
            });
        }
    });
    
    function runUpgraders (oldVersion, idbtrans, reject) {
        var trans = db._createTransaction(READWRITE, dbStoreNames, globalSchema);
        trans.create(idbtrans);
        trans._completion.catch(reject);
        var rejectTransaction = trans._reject.bind(trans);
        newScope(function () {
            PSD.trans = trans;
            if (oldVersion === 0) {
                // Create tables:
                keys(globalSchema).forEach(function (tableName) {
                    createTable(idbtrans, tableName, globalSchema[tableName].primKey, globalSchema[tableName].indexes);
                });
                Promise$1.follow(()=>db.on.populate.fire(trans)).catch(rejectTransaction);
            } else
                updateTablesAndIndexes(oldVersion, trans, idbtrans).catch(rejectTransaction);
        });
    }

    function updateTablesAndIndexes (oldVersion, trans, idbtrans) {
        // Upgrade version to version, step-by-step from oldest to newest version.
        // Each transaction object will contain the table set that was current in that version (but also not-yet-deleted tables from its previous version)
        var queue = [];
        var oldVersionStruct = versions.filter(version => version._cfg.version === oldVersion)[0];
        if (!oldVersionStruct) throw new exceptions.Upgrade("Dexie specification of currently installed DB version is missing");
        globalSchema = db._dbSchema = oldVersionStruct._cfg.dbschema;
        var anyContentUpgraderHasRun = false;

        var versToRun = versions.filter(v => v._cfg.version > oldVersion);
        versToRun.forEach(function (version) {
            /// <param name="version" type="Version"></param>
            queue.push(()=>{
                var oldSchema = globalSchema;
                var newSchema = version._cfg.dbschema;
                adjustToExistingIndexNames(oldSchema, idbtrans);
                adjustToExistingIndexNames(newSchema, idbtrans);
                globalSchema = db._dbSchema = newSchema;
                var diff = getSchemaDiff(oldSchema, newSchema);     
                // Add tables           
                diff.add.forEach(function (tuple) {
                    createTable(idbtrans, tuple[0], tuple[1].primKey, tuple[1].indexes);
                });
                // Change tables
                diff.change.forEach(function (change) {
                    if (change.recreate) {
                        throw new exceptions.Upgrade("Not yet support for changing primary key");
                    } else {
                        var store = idbtrans.objectStore(change.name);
                        // Add indexes
                        change.add.forEach(function (idx) {
                            addIndex(store, idx);
                        });
                        // Update indexes
                        change.change.forEach(function (idx) {
                            store.deleteIndex(idx.name);
                            addIndex(store, idx);
                        });
                        // Delete indexes
                        change.del.forEach(function (idxName) {
                            store.deleteIndex(idxName);
                        });
                    }
                });
                if (version._cfg.contentUpgrade) {
                    anyContentUpgraderHasRun = true;
                    return Promise$1.follow(()=>{
                        version._cfg.contentUpgrade(trans);
                    });
                }
            });
            queue.push(function (idbtrans) {
                if (!anyContentUpgraderHasRun || !hasIEDeleteObjectStoreBug) { // Dont delete old tables if ieBug is present and a content upgrader has run. Let tables be left in DB so far. This needs to be taken care of.
                    var newSchema = version._cfg.dbschema;
                    // Delete old tables
                    deleteRemovedTables(newSchema, idbtrans);
                }
            });
        });

        // Now, create a queue execution engine
        function runQueue () {
            return queue.length ? Promise$1.resolve(queue.shift()(trans.idbtrans)).then(runQueue) :
                Promise$1.resolve();
        }
        
        return runQueue().then(()=>{
            createMissingTables(globalSchema, idbtrans); // At last, make sure to create any missing tables. (Needed by addons that add stores to DB without specifying version)
        });
    }

    function getSchemaDiff(oldSchema, newSchema) {
        var diff = {
            del: [], // Array of table names
            add: [], // Array of [tableName, newDefinition]
            change: [] // Array of {name: tableName, recreate: newDefinition, del: delIndexNames, add: newIndexDefs, change: changedIndexDefs}
        };
        for (var table in oldSchema) {
            if (!newSchema[table]) diff.del.push(table);
        }
        for (table in newSchema) {
            var oldDef = oldSchema[table],
                newDef = newSchema[table];
            if (!oldDef) {
                diff.add.push([table, newDef]);
            } else {
                var change = {
                    name: table,
                    def: newDef,
                    recreate: false,
                    del: [],
                    add: [],
                    change: []
                };
                if (oldDef.primKey.src !== newDef.primKey.src) {
                    // Primary key has changed. Remove and re-add table.
                    change.recreate = true;
                    diff.change.push(change);
                } else {
                    // Same primary key. Just find out what differs:
                    var oldIndexes = oldDef.idxByName;
                    var newIndexes = newDef.idxByName;
                    for (var idxName in oldIndexes) {
                        if (!newIndexes[idxName]) change.del.push(idxName);
                    }
                    for (idxName in newIndexes) {
                        var oldIdx = oldIndexes[idxName],
                            newIdx = newIndexes[idxName];
                        if (!oldIdx) change.add.push(newIdx);
                        else if (oldIdx.src !== newIdx.src) change.change.push(newIdx);
                    }
                    if (change.del.length > 0 || change.add.length > 0 || change.change.length > 0) {
                        diff.change.push(change);
                    }
                }
            }
        }
        return diff;
    }

    function createTable(idbtrans, tableName, primKey, indexes) {
        /// <param name="idbtrans" type="IDBTransaction"></param>
        var store = idbtrans.db.createObjectStore(tableName, primKey.keyPath ? { keyPath: primKey.keyPath, autoIncrement: primKey.auto } : { autoIncrement: primKey.auto });
        indexes.forEach(function (idx) { addIndex(store, idx); });
        return store;
    }

    function createMissingTables(newSchema, idbtrans) {
        keys(newSchema).forEach(function (tableName) {
            if (!idbtrans.db.objectStoreNames.contains(tableName)) {
                createTable(idbtrans, tableName, newSchema[tableName].primKey, newSchema[tableName].indexes);
            }
        });
    }

    function deleteRemovedTables(newSchema, idbtrans) {
        for (var i = 0; i < idbtrans.db.objectStoreNames.length; ++i) {
            var storeName = idbtrans.db.objectStoreNames[i];
            if (newSchema[storeName] == null) {
                idbtrans.db.deleteObjectStore(storeName);
            }
        }
    }

    function addIndex(store, idx) {
        store.createIndex(idx.name, idx.keyPath, { unique: idx.unique, multiEntry: idx.multi });
    }

    function dbUncaught(err) {
        return db.on.error.fire(err);
    }

    //
    //
    //      Dexie Protected API
    //
    //

    this._allTables = allTables;

    this._tableFactory = function createTable(mode, tableSchema) {
        /// <param name="tableSchema" type="TableSchema"></param>
        if (mode === READONLY)
            return new Table(tableSchema.name, tableSchema, Collection);
        else
            return new WriteableTable(tableSchema.name, tableSchema);
    };

    this._createTransaction = function (mode, storeNames, dbschema, parentTransaction) {
        return new Transaction(mode, storeNames, dbschema, parentTransaction);
    };

    /* Generate a temporary transaction when db operations are done outside a transactino scope.
    */
    function tempTransaction(mode, storeNames, fn) { // Last argument is "writeLocked". But this doesnt apply to oneshot direct db operations, so we ignore it.
        if (!openComplete && (!PSD.letThrough)) {
            if (!isBeingOpened) {
                if (!autoOpen)
                    return rejection(new exceptions.DatabaseClosed(), dbUncaught);
                db.open().catch(nop); // Open in background. If if fails, it will be catched by the final promise anyway.
            }
            return dbReadyPromise.then(()=>tempTransaction(mode, storeNames, fn));
        } else {
            var trans = db._createTransaction(mode, storeNames, globalSchema);
            return trans._promise(mode, function (resolve, reject) {
                newScope(function () { // OPTIMIZATION POSSIBLE? newScope() not needed because it's already done in _promise.
                    PSD.trans = trans;
                    fn(resolve, reject, trans);
                });
            }).then(result => {
                // Instead of resolving value directly, wait with resolving it until transaction has completed.
                // Otherwise the data would not be in the DB if requesting it in the then() operation.
                // Specifically, to ensure that the following expression will work:
                //
                //   db.friends.put({name: "Arne"}).then(function () {
                //       db.friends.where("name").equals("Arne").count(function(count) {
                //           assert (count === 1);
                //       });
                //   });
                //
                return trans._completion.then(()=>result);
            });/*.catch(err => { // Don't do this as of now. If would affect bulk- and modify methods in a way that could be more intuitive. But wait! Maybe change in next major.
                trans._reject(err);
                return rejection(err);
            });*/
        }
    }

    this._whenReady = function (fn) {
        return new Promise$1 (fake || openComplete || PSD.letThrough ? fn : (resolve, reject) => {
            if (!isBeingOpened) {
                if (!autoOpen) {
                    reject(new exceptions.DatabaseClosed());
                    return;
                }
                db.open().catch(nop); // Open in background. If if fails, it will be catched by the final promise anyway.
            }
            dbReadyPromise.then(()=>{
                fn(resolve, reject);
            });
        }).uncaught(dbUncaught);
    };
    
    //
    //
    //
    //
    //      Dexie API
    //
    //
    //

    this.verno = 0;

    this.open = function () {
        if (isBeingOpened || idbdb)
            return dbReadyPromise.then(()=> dbOpenError ? rejection(dbOpenError, dbUncaught) : db);
        debug && (openCanceller._stackHolder = getErrorWithStack()); // Let stacks point to when open() was called rather than where new Dexie() was called.
        isBeingOpened = true;
        dbOpenError = null;
        openComplete = false;
        
        // Function pointers to call when the core opening process completes.
        var resolveDbReady = dbReadyResolve,
            // upgradeTransaction to abort on failure.
            upgradeTransaction = null;
        
        return Promise$1.race([openCanceller, new Promise$1((resolve, reject) => {
            doFakeAutoComplete(()=>resolve());
            
            // Make sure caller has specified at least one version
            if (versions.length > 0) autoSchema = false;
            
            // Multiply db.verno with 10 will be needed to workaround upgrading bug in IE:
            // IE fails when deleting objectStore after reading from it.
            // A future version of Dexie.js will stopover an intermediate version to workaround this.
            // At that point, we want to be backward compatible. Could have been multiplied with 2, but by using 10, it is easier to map the number to the real version number.
            
            // If no API, throw!
            if (!indexedDB) throw new exceptions.MissingAPI(
                "indexedDB API not found. If using IE10+, make sure to run your code on a server URL "+
                "(not locally). If using old Safari versions, make sure to include indexedDB polyfill.");
            
            var req = autoSchema ? indexedDB.open(dbName) : indexedDB.open(dbName, Math.round(db.verno * 10));
            if (!req) throw new exceptions.MissingAPI("IndexedDB API not available"); // May happen in Safari private mode, see https://github.com/dfahlander/Dexie.js/issues/134
            req.onerror = wrap(eventRejectHandler(reject));
            req.onblocked = wrap(fireOnBlocked);
            req.onupgradeneeded = wrap (function (e) {
                upgradeTransaction = req.transaction;
                if (autoSchema && !db._allowEmptyDB) { // Unless an addon has specified db._allowEmptyDB, lets make the call fail.
                    // Caller did not specify a version or schema. Doing that is only acceptable for opening alread existing databases.
                    // If onupgradeneeded is called it means database did not exist. Reject the open() promise and make sure that we
                    // do not create a new database by accident here.
                    req.onerror = preventDefault; // Prohibit onabort error from firing before we're done!
                    upgradeTransaction.abort(); // Abort transaction (would hope that this would make DB disappear but it doesnt.)
                    // Close database and delete it.
                    req.result.close();
                    var delreq = indexedDB.deleteDatabase(dbName); // The upgrade transaction is atomic, and javascript is single threaded - meaning that there is no risk that we delete someone elses database here!
                    delreq.onsuccess = delreq.onerror = wrap(function () {
                        reject (new exceptions.NoSuchDatabase(`Database ${dbName} doesnt exist`));
                    });
                } else {
                    upgradeTransaction.onerror = wrap(eventRejectHandler(reject));
                    var oldVer = e.oldVersion > Math.pow(2, 62) ? 0 : e.oldVersion; // Safari 8 fix.
                    runUpgraders(oldVer / 10, upgradeTransaction, reject, req);
                }
            }, reject);
            
            req.onsuccess = wrap (function () {
                // Core opening procedure complete. Now let's just record some stuff.
                upgradeTransaction = null;
                idbdb = req.result;
                connections.push(db); // Used for emulating versionchange event on IE/Edge/Safari.

                if (autoSchema) readGlobalSchema();
                else if (idbdb.objectStoreNames.length > 0) {
                    try {
                        adjustToExistingIndexNames(globalSchema, idbdb.transaction(safariMultiStoreFix(idbdb.objectStoreNames), READONLY));
                    } catch (e) {
                        // Safari may bail out if > 1 store names. However, this shouldnt be a showstopper. Issue #120.
                    }
                }
                
                idbdb.onversionchange = wrap(ev => {
                    db._vcFired = true; // detect implementations that not support versionchange (IE/Edge/Safari)
                    db.on("versionchange").fire(ev);
                });
                
                if (!hasNativeGetDatabaseNames) {
                    // Update localStorage with list of database names
                    globalDatabaseList(function (databaseNames) {
                        if (databaseNames.indexOf(dbName) === -1) return databaseNames.push(dbName);
                    });
                }
                
                resolve();

            }, reject);
        })]).then(()=>{
            // Before finally resolving the dbReadyPromise and this promise,
            // call and await all on('ready') subscribers:
            // Dexie.vip() makes subscribers able to use the database while being opened.
            // This is a must since these subscribers take part of the opening procedure.
            return Dexie.vip(db.on.ready.fire);
        }).then(()=>{
            // Resolve the db.open() with the db instance.
            isBeingOpened = false;
            return db;
        }).catch(err => {
            try {
                // Did we fail within onupgradeneeded? Make sure to abort the upgrade transaction so it doesnt commit.
                upgradeTransaction && upgradeTransaction.abort();
            } catch (e) { }
            isBeingOpened = false; // Set before calling db.close() so that it doesnt reject openCanceller again (leads to unhandled rejection event).
            db.close(); // Closes and resets idbdb, removes connections, resets dbReadyPromise and openCanceller so that a later db.open() is fresh.
            // A call to db.close() may have made on-ready subscribers fail. Use dbOpenError if set, since err could be a follow-up error on that.
            dbOpenError = err; // Record the error. It will be used to reject further promises of db operations.
            return rejection(dbOpenError, dbUncaught); // dbUncaught will make sure any error that happened in any operation before will now bubble to db.on.error() thanks to the special handling in Promise.uncaught().
        }).finally(()=>{
            openComplete = true;
            resolveDbReady(); // dbReadyPromise is resolved no matter if open() rejects or resolved. It's just to wake up waiters.
        });
    };
    
    this.close = function () {
        var idx = connections.indexOf(db);
        if (idx >= 0) connections.splice(idx, 1);        
        if (idbdb) {
            try {idbdb.close();} catch(e){}
            idbdb = null;
        }
        autoOpen = false;
        dbOpenError = new exceptions.DatabaseClosed();
        if (isBeingOpened)
            cancelOpen(dbOpenError);
        // Reset dbReadyPromise promise:
        dbReadyPromise = new Promise$1(resolve => {
            dbReadyResolve = resolve;
        });
        openCanceller = new Promise$1((_, reject) => {
            cancelOpen = reject;
        });
    };
    
    this.delete = function () {
        var hasArguments = arguments.length > 0;
        return new Promise$1(function (resolve, reject) {
            if (hasArguments) throw new exceptions.InvalidArgument("Arguments not allowed in db.delete()");
            if (isBeingOpened) {
                dbReadyPromise.then(doDelete);
            } else {
                doDelete();
            }
            function doDelete() {
                db.close();
                var req = indexedDB.deleteDatabase(dbName);
                req.onsuccess = wrap(function () {
                    if (!hasNativeGetDatabaseNames) {
                        globalDatabaseList(function(databaseNames) {
                            var pos = databaseNames.indexOf(dbName);
                            if (pos >= 0) return databaseNames.splice(pos, 1);
                        });
                    }
                    resolve();
                });
                req.onerror = wrap(eventRejectHandler(reject));
                req.onblocked = fireOnBlocked;
            }
        }).uncaught(dbUncaught);
    };

    this.backendDB = function () {
        return idbdb;
    };

    this.isOpen = function () {
        return idbdb !== null;
    };
    this.hasFailed = function () {
        return dbOpenError !== null;
    };
    this.dynamicallyOpened = function() {
        return autoSchema;
    };

    //
    // Properties
    //
    this.name = dbName;

    // db.tables - an array of all Table instances.
    setProp(this, "tables", {
        get: function () {
            /// <returns type="Array" elementType="WriteableTable" />
            return keys(allTables).map(function (name) { return allTables[name]; });
        }
    });

    //
    // Events
    //
    this.on = Events(this, "error", "populate", "blocked", "versionchange", {ready: [promisableChain, nop]});
    this.on.error.subscribe = deprecated("Dexie.on.error", this.on.error.subscribe);
    this.on.error.unsubscribe = deprecated("Dexie.on.error.unsubscribe", this.on.error.unsubscribe);

    this.on.ready.subscribe = override (this.on.ready.subscribe, function (subscribe) {
        return (subscriber, bSticky) => {
            Dexie.vip(()=>{
                if (openComplete) {
                    // Database already open. Call subscriber asap.
                    if (!dbOpenError) Promise$1.resolve().then(subscriber);
                    // bSticky: Also subscribe to future open sucesses (after close / reopen) 
                    if (bSticky) subscribe(subscriber); 
                } else {
                    // Database not yet open. Subscribe to it.
                    subscribe(subscriber);
                    // If bSticky is falsy, make sure to unsubscribe subscriber when fired once.
                    if (!bSticky) subscribe(function unsubscribe() {
                        db.on.ready.unsubscribe(subscriber);
                        db.on.ready.unsubscribe(unsubscribe);
                    });
                }
            });
        }
    });

    fakeAutoComplete(function () {
        db.on("populate").fire(db._createTransaction(READWRITE, dbStoreNames, globalSchema));
        db.on("error").fire(new Error());
    });

    this.transaction = function (mode, tableInstances, scopeFunc) {
        /// <summary>
        ///
        /// </summary>
        /// <param name="mode" type="String">"r" for readonly, or "rw" for readwrite</param>
        /// <param name="tableInstances">Table instance, Array of Table instances, String or String Array of object stores to include in the transaction</param>
        /// <param name="scopeFunc" type="Function">Function to execute with transaction</param>

        // Let table arguments be all arguments between mode and last argument.
        var i = arguments.length;
        if (i < 2) throw new exceptions.InvalidArgument("Too few arguments");
        // Prevent optimzation killer (https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments)
        // and clone arguments except the first one into local var 'args'.
        var args = new Array(i - 1);
        while (--i) args[i-1] = arguments[i];
        // Let scopeFunc be the last argument and pop it so that args now only contain the table arguments.
        scopeFunc = args.pop();
        var tables = flatten(args); // Support using array as middle argument, or a mix of arrays and non-arrays.
        var parentTransaction = PSD.trans;
        // Check if parent transactions is bound to this db instance, and if caller wants to reuse it
        if (!parentTransaction || parentTransaction.db !== db || mode.indexOf('!') !== -1) parentTransaction = null;
        var onlyIfCompatible = mode.indexOf('?') !== -1;
        mode = mode.replace('!', '').replace('?', ''); // Ok. Will change arguments[0] as well but we wont touch arguments henceforth.
        
        try {
            //
            // Get storeNames from arguments. Either through given table instances, or through given table names.
            //
            var storeNames = tables.map(table => {
                var storeName = table instanceof Table ? table.name : table;
                if (typeof storeName !== 'string') throw new TypeError("Invalid table argument to Dexie.transaction(). Only Table or String are allowed");
                return storeName;
            });

            //
            // Resolve mode. Allow shortcuts "r" and "rw".
            //
            if (mode == "r" || mode == READONLY)
                mode = READONLY;
            else if (mode == "rw" || mode == READWRITE)
                mode = READWRITE;
            else
                throw new exceptions.InvalidArgument("Invalid transaction mode: " + mode);

            if (parentTransaction) {
                // Basic checks
                if (parentTransaction.mode === READONLY && mode === READWRITE) {
                    if (onlyIfCompatible) {
                        // Spawn new transaction instead.
                        parentTransaction = null; 
                    }
                    else throw new exceptions.SubTransaction("Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY");
                }
                if (parentTransaction) {
                    storeNames.forEach(function (storeName) {
                        if (parentTransaction && parentTransaction.storeNames.indexOf(storeName) === -1) {
                            if (onlyIfCompatible) {
                                // Spawn new transaction instead.
                                parentTransaction = null; 
                            }
                            else throw new exceptions.SubTransaction("Table " + storeName +
                                " not included in parent transaction.");
                        }
                    });
                }
            }
        } catch (e) {
            return parentTransaction ?
                parentTransaction._promise(null, (_, reject) => {reject(e);}) :
                rejection (e, dbUncaught);
        }
        // If this is a sub-transaction, lock the parent and then launch the sub-transaction.
        return (parentTransaction ?
            parentTransaction._promise(mode, enterTransactionScope, "lock") :
            db._whenReady (enterTransactionScope));
            
        function enterTransactionScope(resolve) {
            var parentPSD = PSD;
            resolve(Promise$1.resolve().then(()=>newScope(()=>{
                // Keep a pointer to last non-transactional PSD to use if someone calls Dexie.ignoreTransaction().
                PSD.transless = PSD.transless || parentPSD;
                // Our transaction.
                //return new Promise((resolve, reject) => {
                var trans = db._createTransaction(mode, storeNames, globalSchema, parentTransaction);
                // Let the transaction instance be part of a Promise-specific data (PSD) value.
                PSD.trans = trans;
                

                if (parentTransaction) {
                    // Emulate transaction commit awareness for inner transaction (must 'commit' when the inner transaction has no more operations ongoing)
                    trans.idbtrans = parentTransaction.idbtrans;
                } else {
                    trans.create(); // Create the backend transaction so that complete() or error() will trigger even if no operation is made upon it.
                }
                
                // Provide arguments to the scope function (for backward compatibility)
                var tableArgs = storeNames.map(function (name) { return allTables[name]; });
                tableArgs.push(trans);

                var returnValue;
                return Promise$1.follow(()=>{
                    // Finally, call the scope function with our table and transaction arguments.
                    returnValue = scopeFunc.apply(trans, tableArgs); // NOTE: returnValue is used in trans.on.complete() not as a returnValue to this func.
                    if (returnValue) {
                        if (typeof returnValue.next === 'function' && typeof returnValue.throw === 'function') {
                            // scopeFunc returned an iterator with throw-support. Handle yield as await.
                            returnValue = awaitIterator(returnValue);
                        } else if (typeof returnValue.then === 'function' && !hasOwn(returnValue, '_PSD')) {
                            throw new exceptions.IncompatiblePromise("Incompatible Promise returned from transaction scope (read more at http://tinyurl.com/znyqjqc). Transaction scope: " + scopeFunc.toString());
                        }
                    }
                }).uncaught(dbUncaught).then(()=>{
                    if (parentTransaction) trans._resolve(); // sub transactions don't react to idbtrans.oncomplete. We must trigger a acompletion.
                    return trans._completion; // Even if WE believe everything is fine. Await IDBTransaction's oncomplete or onerror as well.
                }).then(()=>{
                    return returnValue;
                }).catch (e => {
                    //reject(e);
                    trans._reject(e); // Yes, above then-handler were maybe not called because of an unhandled rejection in scopeFunc!
                    return rejection(e);
                });
                //});
            })));
        }
    };

    this.table = function (tableName) {
        /// <returns type="WriteableTable"></returns>
        if (fake && autoSchema) return new WriteableTable(tableName);
        if (!hasOwn(allTables, tableName)) { throw new exceptions.InvalidTable(`Table ${tableName} does not exist`); }
        return allTables[tableName];
    };

    //
    //
    //
    // Table Class
    //
    //
    //
    function Table(name, tableSchema, collClass) {
        /// <param name="name" type="String"></param>
        this.name = name;
        this.schema = tableSchema;
        this.hook = allTables[name] ? allTables[name].hook : Events(null, {
            "creating": [hookCreatingChain, nop],
            "reading": [pureFunctionChain, mirror],
            "updating": [hookUpdatingChain, nop],
            "deleting": [hookDeletingChain, nop]
        });
        this._collClass = collClass || Collection;
    }

    props(Table.prototype, {

        //
        // Table Protected Methods
        //

        _trans: function getTransaction(mode, fn, writeLocked) {
            var trans = PSD.trans;
            return trans && trans.db === db ?
                trans._promise (mode, fn, writeLocked) :
                tempTransaction (mode, [this.name], fn);
        },
        _idbstore: function getIDBObjectStore(mode, fn, writeLocked) {
            if (fake) return new Promise$1(fn); // Simplify the work for Intellisense/Code completion.
            var trans = PSD.trans,
                tableName = this.name;
            function supplyIdbStore (resolve, reject, trans) {
                fn(resolve, reject, trans.idbtrans.objectStore(tableName), trans);
            }
            return trans && trans.db === db ?
                trans._promise (mode, supplyIdbStore, writeLocked) :
                tempTransaction (mode, [this.name], supplyIdbStore);
        },

        //
        // Table Public Methods
        //
        get: function (key, cb) {
            var self = this;
            return this._idbstore(READONLY, function (resolve, reject, idbstore) {
                fake && resolve(self.schema.instanceTemplate);
                var req = idbstore.get(key);
                req.onerror = eventRejectHandler(reject);
                req.onsuccess = wrap(function () {
                    resolve(self.hook.reading.fire(req.result));
                }, reject);
            }).then(cb);
        },
        where: function (indexName) {
            return new WhereClause(this, indexName);
        },
        count: function (cb) {
            return this.toCollection().count(cb);
        },
        offset: function (offset) {
            return this.toCollection().offset(offset);
        },
        limit: function (numRows) {
            return this.toCollection().limit(numRows);
        },
        reverse: function () {
            return this.toCollection().reverse();
        },
        filter: function (filterFunction) {
            return this.toCollection().and(filterFunction);
        },
        each: function (fn) {
            return this.toCollection().each(fn);
        },
        toArray: function (cb) {
            return this.toCollection().toArray(cb);
        },
        orderBy: function (index) {
            return new this._collClass(new WhereClause(this, index));
        },

        toCollection: function () {
            return new this._collClass(new WhereClause(this));
        },

        mapToClass: function (constructor, structure) {
            /// <summary>
            ///     Map table to a javascript constructor function. Objects returned from the database will be instances of this class, making
            ///     it possible to the instanceOf operator as well as extending the class using constructor.prototype.method = function(){...}.
            /// </summary>
            /// <param name="constructor">Constructor function representing the class.</param>
            /// <param name="structure" optional="true">Helps IDE code completion by knowing the members that objects contain and not just the indexes. Also
            /// know what type each member has. Example: {name: String, emailAddresses: [String], password}</param>
            this.schema.mappedClass = constructor;
            var instanceTemplate = Object.create(constructor.prototype);
            if (structure) {
                // structure and instanceTemplate is for IDE code competion only while constructor.prototype is for actual inheritance.
                applyStructure(instanceTemplate, structure);
            }
            this.schema.instanceTemplate = instanceTemplate;

            // Now, subscribe to the when("reading") event to make all objects that come out from this table inherit from given class
            // no matter which method to use for reading (Table.get() or Table.where(...)... )
            var readHook = function (obj) {
                if (!obj) return obj; // No valid object. (Value is null). Return as is.
                // Create a new object that derives from constructor:
                var res = Object.create(constructor.prototype);
                // Clone members:
                for (var m in obj) if (hasOwn(obj, m)) try {res[m] = obj[m];} catch(_){}
                return res;
            };

            if (this.schema.readHook) {
                this.hook.reading.unsubscribe(this.schema.readHook);
            }
            this.schema.readHook = readHook;
            this.hook("reading", readHook);
            return constructor;
        },
        defineClass: function (structure) {
            /// <summary>
            ///     Define all members of the class that represents the table. This will help code completion of when objects are read from the database
            ///     as well as making it possible to extend the prototype of the returned constructor function.
            /// </summary>
            /// <param name="structure">Helps IDE code completion by knowing the members that objects contain and not just the indexes. Also
            /// know what type each member has. Example: {name: String, emailAddresses: [String], properties: {shoeSize: Number}}</param>
            return this.mapToClass(Dexie.defineClass(structure), structure);
        }
    });

    //
    //
    //
    // WriteableTable Class (extends Table)
    //
    //
    //
    function WriteableTable(name, tableSchema, collClass) {
        Table.call(this, name, tableSchema, collClass || WriteableCollection);
    }

    function BulkErrorHandlerCatchAll(errorList, done, supportHooks) {
        return (supportHooks ? hookedEventRejectHandler : eventRejectHandler)(e => {
            errorList.push(e);
            done && done();
        });
    }

    function bulkDelete(idbstore, trans, keysOrTuples, hasDeleteHook, deletingHook) {
        // If hasDeleteHook, keysOrTuples must be an array of tuples: [[key1, value2],[key2,value2],...],
        // else keysOrTuples must be just an array of keys: [key1, key2, ...].
        return new Promise$1((resolve, reject)=>{
            var len = keysOrTuples.length,
                lastItem = len - 1;
            if (len === 0) return resolve();
            if (!hasDeleteHook) {
                for (var i=0; i < len; ++i) {
                    var req = idbstore.delete(keysOrTuples[i]);
                    req.onerror = wrap(eventRejectHandler(reject));
                    if (i === lastItem) req.onsuccess = wrap(()=>resolve());
                }
            } else {
                var hookCtx,
                    errorHandler = hookedEventRejectHandler(reject),
                    successHandler = hookedEventSuccessHandler(null);
                tryCatch(()=> {
                    for (var i = 0; i < len; ++i) {
                        hookCtx = {onsuccess: null, onerror: null};
                        var tuple = keysOrTuples[i];
                        deletingHook.call(hookCtx, tuple[0], tuple[1], trans);
                        var req = idbstore.delete(tuple[0]);
                        req._hookCtx = hookCtx;
                        req.onerror = errorHandler;
                        if (i === lastItem)
                            req.onsuccess = hookedEventSuccessHandler(resolve);
                        else
                            req.onsuccess = successHandler;
                    }
                }, err=>{
                    hookCtx.onerror && hookCtx.onerror(err);
                    throw err;
                });
            }
        }).uncaught(dbUncaught);
    }

    derive(WriteableTable).from(Table).extend({
        bulkDelete: function (keys$$1) {
            if (this.hook.deleting.fire === nop) {
                return this._idbstore(READWRITE, (resolve, reject, idbstore, trans) => {
                    resolve (bulkDelete(idbstore, trans, keys$$1, false, nop));
                });
            } else {
                return this
                    .where(':id')
                    .anyOf(keys$$1)
                    .delete()
                    .then(()=>{}); // Resolve with undefined.
            }
        },
        bulkPut: function(objects, keys$$1) {
            return this._idbstore(READWRITE, (resolve, reject, idbstore) => {
                if (!idbstore.keyPath && !this.schema.primKey.auto && !keys$$1)
                    throw new exceptions.InvalidArgument("bulkPut() with non-inbound keys requires keys array in second argument");
                if (idbstore.keyPath && keys$$1)
                    throw new exceptions.InvalidArgument("bulkPut(): keys argument invalid on tables with inbound keys");
                if (keys$$1 && keys$$1.length !== objects.length)
                    throw new exceptions.InvalidArgument("Arguments objects and keys must have the same length");
                if (objects.length === 0) return resolve(); // Caller provided empty list.
                const done = result => {
                    if (errorList.length === 0) resolve(result);
                    else reject(new BulkError(`${this.name}.bulkPut(): ${errorList.length} of ${numObjs} operations failed`, errorList));
                };
                var req,
                    errorList = [],
                    errorHandler,
                    numObjs = objects.length,
                    table = this;
                if (this.hook.creating.fire === nop && this.hook.updating.fire === nop) {
                    //
                    // Standard Bulk (no 'creating' or 'updating' hooks to care about)
                    //
                    errorHandler = BulkErrorHandlerCatchAll(errorList);
                    for (var i = 0, l = objects.length; i < l; ++i) {
                        req = keys$$1 ? idbstore.put(objects[i], keys$$1[i]) : idbstore.put(objects[i]);
                        req.onerror = errorHandler;
                    }
                    // Only need to catch success or error on the last operation
                    // according to the IDB spec.
                    req.onerror = BulkErrorHandlerCatchAll(errorList, done);
                    req.onsuccess = eventSuccessHandler(done);
                } else {
                    var effectiveKeys = keys$$1 || idbstore.keyPath && objects.map(o=>getByKeyPath(o, idbstore.keyPath));
                    // Generate map of {[key]: object}
                    var objectLookup = effectiveKeys && arrayToObject(effectiveKeys, (key, i) => key != null && [key, objects[i]]); 
                    var promise = !effectiveKeys ?

                        // Auto-incremented key-less objects only without any keys argument.
                        table.bulkAdd(objects) :

                        // Keys provided. Either as inbound in provided objects, or as a keys argument.
                        // Begin with updating those that exists in DB:
                        table.where(':id').anyOf(effectiveKeys.filter(key => key != null)).modify(function () {
                            this.value = objectLookup[this.primKey];
                            objectLookup[this.primKey] = null; // Mark as "don't add this"
                        }).catch(ModifyError, e => {
                            errorList = e.failures; // No need to concat here. These are the first errors added.
                        }).then(()=> {
                            // Now, let's examine which items didnt exist so we can add them:
                            var objsToAdd = [],
                                keysToAdd = keys$$1 && [];
                            // Iterate backwards. Why? Because if same key was used twice, just add the last one.
                            for (var i=effectiveKeys.length-1; i>=0; --i) {
                                var key = effectiveKeys[i];
                                if (key == null || objectLookup[key]) {
                                    objsToAdd.push(objects[i]);
                                    keys$$1 && keysToAdd.push(key);
                                    if (key != null) objectLookup[key] = null; // Mark as "dont add again"
                                }
                            }
                            // The items are in reverse order so reverse them before adding.
                            // Could be important in order to get auto-incremented keys the way the caller
                            // would expect. Could have used unshift instead of push()/reverse(),
                            // but: http://jsperf.com/unshift-vs-reverse
                            objsToAdd.reverse();
                            keys$$1 && keysToAdd.reverse();
                            return table.bulkAdd(objsToAdd, keysToAdd);
                        }).then(lastAddedKey => {
                            // Resolve with key of the last object in given arguments to bulkPut():
                            var lastEffectiveKey = effectiveKeys[effectiveKeys.length - 1]; // Key was provided.
                            return lastEffectiveKey != null ? lastEffectiveKey : lastAddedKey;
                        });

                    promise.then(done).catch(BulkError, e => {
                        // Concat failure from ModifyError and reject using our 'done' method.
                        errorList = errorList.concat(e.failures);
                        done();
                    }).catch(reject);
                }
            }, "locked"); // If called from transaction scope, lock transaction til all steps are done.
        },
        bulkAdd: function(objects, keys$$1) {
            var self = this,
                creatingHook = this.hook.creating.fire;
            return this._idbstore(READWRITE, function (resolve, reject, idbstore, trans) {
                if (!idbstore.keyPath && !self.schema.primKey.auto && !keys$$1)
                    throw new exceptions.InvalidArgument("bulkAdd() with non-inbound keys requires keys array in second argument");
                if (idbstore.keyPath && keys$$1)
                    throw new exceptions.InvalidArgument("bulkAdd(): keys argument invalid on tables with inbound keys");
                if (keys$$1 && keys$$1.length !== objects.length)
                    throw new exceptions.InvalidArgument("Arguments objects and keys must have the same length");
                if (objects.length === 0) return resolve(); // Caller provided empty list.
                function done(result) {
                    if (errorList.length === 0) resolve(result);
                    else reject(new BulkError(`${self.name}.bulkAdd(): ${errorList.length} of ${numObjs} operations failed`, errorList));
                }
                var req,
                    errorList = [],
                    errorHandler,
                    successHandler,
                    numObjs = objects.length;
                if (creatingHook !== nop) {
                    //
                    // There are subscribers to hook('creating')
                    // Must behave as documented.
                    //
                    var keyPath = idbstore.keyPath,
                        hookCtx;
                    errorHandler = BulkErrorHandlerCatchAll(errorList, null, true);
                    successHandler = hookedEventSuccessHandler(null);

                    tryCatch(() => {
                        for (var i=0, l = objects.length; i < l; ++i) {
                            hookCtx = { onerror: null, onsuccess: null };
                            var key = keys$$1 && keys$$1[i];
                            var obj = objects[i],
                                effectiveKey = keys$$1 ? key : keyPath ? getByKeyPath(obj, keyPath) : undefined,
                                keyToUse = creatingHook.call(hookCtx, effectiveKey, obj, trans);
                            if (effectiveKey == null && keyToUse != null) {
                                if (keyPath) {
                                    obj = deepClone(obj);
                                    setByKeyPath(obj, keyPath, keyToUse);
                                } else {
                                    key = keyToUse;
                                }
                            }
                            req = key != null ? idbstore.add(obj, key) : idbstore.add(obj);
                            req._hookCtx = hookCtx;
                            if (i < l - 1) {
                                req.onerror = errorHandler;
                                if (hookCtx.onsuccess)
                                    req.onsuccess = successHandler;
                            }
                        }
                    }, err => {
                        hookCtx.onerror && hookCtx.onerror(err);
                        throw err;
                    });

                    req.onerror = BulkErrorHandlerCatchAll(errorList, done, true);
                    req.onsuccess = hookedEventSuccessHandler(done);
                } else {
                    //
                    // Standard Bulk (no 'creating' hook to care about)
                    //
                    errorHandler = BulkErrorHandlerCatchAll(errorList);
                    for (var i = 0, l = objects.length; i < l; ++i) {
                        req = keys$$1 ? idbstore.add(objects[i], keys$$1[i]) : idbstore.add(objects[i]);
                        req.onerror = errorHandler;
                    }
                    // Only need to catch success or error on the last operation
                    // according to the IDB spec.
                    req.onerror = BulkErrorHandlerCatchAll(errorList, done);
                    req.onsuccess = eventSuccessHandler(done);
                }
            });
        },
        add: function (obj, key) {
            /// <summary>
            ///   Add an object to the database. In case an object with same primary key already exists, the object will not be added.
            /// </summary>
            /// <param name="obj" type="Object">A javascript object to insert</param>
            /// <param name="key" optional="true">Primary key</param>
            var creatingHook = this.hook.creating.fire;
            return this._idbstore(READWRITE, function (resolve, reject, idbstore, trans) {
                var hookCtx = {onsuccess: null, onerror: null};
                if (creatingHook !== nop) {
                    var effectiveKey = (key != null) ? key : (idbstore.keyPath ? getByKeyPath(obj, idbstore.keyPath) : undefined);
                    var keyToUse = creatingHook.call(hookCtx, effectiveKey, obj, trans); // Allow subscribers to when("creating") to generate the key.
                    if (effectiveKey == null && keyToUse != null) { // Using "==" and "!=" to check for either null or undefined!
                        if (idbstore.keyPath)
                            setByKeyPath(obj, idbstore.keyPath, keyToUse);
                        else
                            key = keyToUse;
                    }
                }
                try {
                    var req = key != null ? idbstore.add(obj, key) : idbstore.add(obj);
                    req._hookCtx = hookCtx;
                    req.onerror = hookedEventRejectHandler(reject);
                    req.onsuccess = hookedEventSuccessHandler(function (result) {
                        // TODO: Remove these two lines in next major release (2.0?)
                        // It's no good practice to have side effects on provided parameters
                        var keyPath = idbstore.keyPath;
                        if (keyPath) setByKeyPath(obj, keyPath, result);
                        resolve(result);
                    });
                } catch (e) {
                    if (hookCtx.onerror) hookCtx.onerror(e);
                    throw e;
                }
            });
        },

        put: function (obj, key) {
            /// <summary>
            ///   Add an object to the database but in case an object with same primary key alread exists, the existing one will get updated.
            /// </summary>
            /// <param name="obj" type="Object">A javascript object to insert or update</param>
            /// <param name="key" optional="true">Primary key</param>
            var self = this,
                creatingHook = this.hook.creating.fire,
                updatingHook = this.hook.updating.fire;
            if (creatingHook !== nop || updatingHook !== nop) {
                //
                // People listens to when("creating") or when("updating") events!
                // We must know whether the put operation results in an CREATE or UPDATE.
                //
                return this._trans(READWRITE, function (resolve, reject, trans) {
                    // Since key is optional, make sure we get it from obj if not provided
                    var effectiveKey = (key !== undefined) ? key : (self.schema.primKey.keyPath && getByKeyPath(obj, self.schema.primKey.keyPath));
                    if (effectiveKey == null) { // "== null" means checking for either null or undefined.
                        // No primary key. Must use add().
                        self.add(obj).then(resolve, reject);
                    } else {
                        // Primary key exist. Lock transaction and try modifying existing. If nothing modified, call add().
                        trans._lock(); // Needed because operation is splitted into modify() and add().
                        // clone obj before this async call. If caller modifies obj the line after put(), the IDB spec requires that it should not affect operation.
                        obj = deepClone(obj);
                        self.where(":id").equals(effectiveKey).modify(function () {
                            // Replace extisting value with our object
                            // CRUD event firing handled in WriteableCollection.modify()
                            this.value = obj;
                        }).then(function (count) {
                            if (count === 0) {
                                // Object's key was not found. Add the object instead.
                                // CRUD event firing will be done in add()
                                return self.add(obj, key); // Resolving with another Promise. Returned Promise will then resolve with the new key.
                            } else {
                                return effectiveKey; // Resolve with the provided key.
                            }
                        }).finally(function () {
                            trans._unlock();
                        }).then(resolve, reject);
                    }
                });
            } else {
                // Use the standard IDB put() method.
                return this._idbstore(READWRITE, function (resolve, reject, idbstore) {
                    var req = key !== undefined ? idbstore.put(obj, key) : idbstore.put(obj);
                    req.onerror = eventRejectHandler(reject);
                    req.onsuccess = function (ev) {
                        var keyPath = idbstore.keyPath;
                        if (keyPath) setByKeyPath(obj, keyPath, ev.target.result);
                        resolve(req.result);
                    };
                });
            }
        },

        'delete': function (key) {
            /// <param name="key">Primary key of the object to delete</param>
            if (this.hook.deleting.subscribers.length) {
                // People listens to when("deleting") event. Must implement delete using WriteableCollection.delete() that will
                // call the CRUD event. Only WriteableCollection.delete() will know whether an object was actually deleted.
                return this.where(":id").equals(key).delete();
            } else {
                // No one listens. Use standard IDB delete() method.
                return this._idbstore(READWRITE, function (resolve, reject, idbstore) {
                    var req = idbstore.delete(key);
                    req.onerror = eventRejectHandler(reject);
                    req.onsuccess = function () {
                        resolve(req.result);
                    };
                });
            }
        },

        clear: function () {
            if (this.hook.deleting.subscribers.length) {
                // People listens to when("deleting") event. Must implement delete using WriteableCollection.delete() that will
                // call the CRUD event. Only WriteableCollection.delete() will knows which objects that are actually deleted.
                return this.toCollection().delete();
            } else {
                return this._idbstore(READWRITE, function (resolve, reject, idbstore) {
                    var req = idbstore.clear();
                    req.onerror = eventRejectHandler(reject);
                    req.onsuccess = function () {
                        resolve(req.result);
                    };
                });
            }
        },

        update: function (keyOrObject, modifications) {
            if (typeof modifications !== 'object' || isArray(modifications))
                throw new exceptions.InvalidArgument("Modifications must be an object.");
            if (typeof keyOrObject === 'object' && !isArray(keyOrObject)) {
                // object to modify. Also modify given object with the modifications:
                keys(modifications).forEach(function (keyPath) {
                    setByKeyPath(keyOrObject, keyPath, modifications[keyPath]);
                });
                var key = getByKeyPath(keyOrObject, this.schema.primKey.keyPath);
                if (key === undefined) return rejection(new exceptions.InvalidArgument(
                    "Given object does not contain its primary key"), dbUncaught);
                return this.where(":id").equals(key).modify(modifications);
            } else {
                // key to modify
                return this.where(":id").equals(keyOrObject).modify(modifications);
            }
        }
    });
    
    //
    //
    //
    // Transaction Class
    //
    //
    //
    function Transaction(mode, storeNames, dbschema, parent) {
        /// <summary>
        ///    Transaction class. Represents a database transaction. All operations on db goes through a Transaction.
        /// </summary>
        /// <param name="mode" type="String">Any of "readwrite" or "readonly"</param>
        /// <param name="storeNames" type="Array">Array of table names to operate on</param>
        this.db = db;
        this.mode = mode;
        this.storeNames = storeNames;
        this.idbtrans = null;
        this.on = Events(this, "complete", "error", "abort");
        this.parent = parent || null;
        this.active = true;
        this._tables = null;
        this._reculock = 0;
        this._blockedFuncs = [];
        this._psd = null;
        this._dbschema = dbschema;
        this._resolve = null;
        this._reject = null;
        this._completion = new Promise$1 ((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        }).uncaught(dbUncaught);
        
        this._completion.then(
            ()=> {this.on.complete.fire();},
            e => {
                this.on.error.fire(e);
                this.parent ?
                    this.parent._reject(e) :
                    this.active && this.idbtrans && this.idbtrans.abort();
                this.active = false;
                return rejection(e); // Indicate we actually DO NOT catch this error.
            });
    }

    props(Transaction.prototype, {
        //
        // Transaction Protected Methods (not required by API users, but needed internally and eventually by dexie extensions)
        //
        _lock: function () {
            assert (!PSD.global); // Locking and unlocking reuires to be within a PSD scope.
            // Temporary set all requests into a pending queue if they are called before database is ready.
            ++this._reculock; // Recursive read/write lock pattern using PSD (Promise Specific Data) instead of TLS (Thread Local Storage)
            if (this._reculock === 1 && !PSD.global) PSD.lockOwnerFor = this;
            return this;
        },
        _unlock: function () {
            assert (!PSD.global); // Locking and unlocking reuires to be within a PSD scope.
            if (--this._reculock === 0) {
                if (!PSD.global) PSD.lockOwnerFor = null;
                while (this._blockedFuncs.length > 0 && !this._locked()) {
                    var fnAndPSD = this._blockedFuncs.shift();
                    try { usePSD(fnAndPSD[1], fnAndPSD[0]); } catch (e) { }
                }
            }
            return this;
        },
        _locked: function () {
            // Checks if any write-lock is applied on this transaction.
            // To simplify the Dexie API for extension implementations, we support recursive locks.
            // This is accomplished by using "Promise Specific Data" (PSD).
            // PSD data is bound to a Promise and any child Promise emitted through then() or resolve( new Promise() ).
            // PSD is local to code executing on top of the call stacks of any of any code executed by Promise():
            //         * callback given to the Promise() constructor  (function (resolve, reject){...})
            //         * callbacks given to then()/catch()/finally() methods (function (value){...})
            // If creating a new independant Promise instance from within a Promise call stack, the new Promise will derive the PSD from the call stack of the parent Promise.
            // Derivation is done so that the inner PSD __proto__ points to the outer PSD.
            // PSD.lockOwnerFor will point to current transaction object if the currently executing PSD scope owns the lock.
            return this._reculock && PSD.lockOwnerFor !== this;
        },
        create: function (idbtrans) {
            assert(!this.idbtrans);
            if (!idbtrans && !idbdb) {
                switch (dbOpenError && dbOpenError.name) {
                    case "DatabaseClosedError":
                        // Errors where it is no difference whether it was caused by the user operation or an earlier call to db.open()
                        throw new exceptions.DatabaseClosed(dbOpenError);
                    case "MissingAPIError":
                        // Errors where it is no difference whether it was caused by the user operation or an earlier call to db.open()
                        throw new exceptions.MissingAPI(dbOpenError.message, dbOpenError);
                    default:
                        // Make it clear that the user operation was not what caused the error - the error had occurred earlier on db.open()!
                        throw new exceptions.OpenFailed(dbOpenError);
                }
            }
            if (!this.active) throw new exceptions.TransactionInactive();
            assert(this._completion._state === null);

            idbtrans = this.idbtrans = idbtrans || idbdb.transaction(safariMultiStoreFix(this.storeNames), this.mode);
            idbtrans.onerror = wrap(ev => {
                preventDefault(ev);// Prohibit default bubbling to window.error
                this._reject(idbtrans.error);
            });
            idbtrans.onabort = wrap(ev => {
                preventDefault(ev);
                this.active && this._reject(new exceptions.Abort());
                this.active = false;
                this.on("abort").fire(ev);
            });
            idbtrans.oncomplete = wrap(() => {
                this.active = false;
                this._resolve();
            });
            return this;
        },
        _promise: function (mode, fn, bWriteLock) {
            var self = this;
            var p = self._locked() ?
                // Read lock always. Transaction is write-locked. Wait for mutex.
                new Promise$1(function (resolve, reject) {
                    self._blockedFuncs.push([function () {
                        self._promise(mode, fn, bWriteLock).then(resolve, reject);
                    }, PSD]);
                }) :
                newScope(function() {
                    var p_ = self.active ? new Promise$1(function (resolve, reject) {
                        if (mode === READWRITE && self.mode !== READWRITE)
                            throw new exceptions.ReadOnly("Transaction is readonly");
                        if (!self.idbtrans && mode) self.create();
                        if (bWriteLock) self._lock(); // Write lock if write operation is requested
                        fn(resolve, reject, self);
                    }) : rejection(new exceptions.TransactionInactive());
                    if (self.active && bWriteLock) p_.finally(function () {
                        self._unlock();
                    });
                    return p_;
                });

            p._lib = true;
            return p.uncaught(dbUncaught);
        },

        //
        // Transaction Public Properties and Methods
        //
        abort: function () {
            this.active && this._reject(new exceptions.Abort());
            this.active = false;
        },
        
        tables: {
            get: deprecated ("Transaction.tables", function () {
                return arrayToObject(this.storeNames, name => [name, allTables[name]]);
            }, "Use db.tables()")
        },

        complete: deprecated ("Transaction.complete()", function (cb) {
            return this.on("complete", cb);
        }),
        
        error: deprecated ("Transaction.error()", function (cb) {
            return this.on("error", cb);
        }),
        
        table: deprecated ("Transaction.table()", function (name) {
            if (this.storeNames.indexOf(name) === -1)
                throw new exceptions.InvalidTable("Table " + name + " not in transaction");
            return allTables[name];
        })
        
    });

    //
    //
    //
    // WhereClause
    //
    //
    //
    function WhereClause(table, index, orCollection) {
        /// <param name="table" type="Table"></param>
        /// <param name="index" type="String" optional="true"></param>
        /// <param name="orCollection" type="Collection" optional="true"></param>
        this._ctx = {
            table: table,
            index: index === ":id" ? null : index,
            collClass: table._collClass,
            or: orCollection
        };
    }

    props(WhereClause.prototype, function () {

        // WhereClause private methods

        function fail(collectionOrWhereClause, err, T) {
            var collection = collectionOrWhereClause instanceof WhereClause ?
                new collectionOrWhereClause._ctx.collClass(collectionOrWhereClause) :
                collectionOrWhereClause;
                
            collection._ctx.error = T ? new T(err) : new TypeError(err);
            return collection;
        }

        function emptyCollection(whereClause) {
            return new whereClause._ctx.collClass(whereClause, function() { return IDBKeyRange.only(""); }).limit(0);
        }

        function upperFactory(dir) {
            return dir === "next" ? function (s) { return s.toUpperCase(); } : function (s) { return s.toLowerCase(); };
        }
        function lowerFactory(dir) {
            return dir === "next" ? function (s) { return s.toLowerCase(); } : function (s) { return s.toUpperCase(); };
        }
        function nextCasing(key, lowerKey, upperNeedle, lowerNeedle, cmp, dir) {
            var length = Math.min(key.length, lowerNeedle.length);
            var llp = -1;
            for (var i = 0; i < length; ++i) {
                var lwrKeyChar = lowerKey[i];
                if (lwrKeyChar !== lowerNeedle[i]) {
                    if (cmp(key[i], upperNeedle[i]) < 0) return key.substr(0, i) + upperNeedle[i] + upperNeedle.substr(i + 1);
                    if (cmp(key[i], lowerNeedle[i]) < 0) return key.substr(0, i) + lowerNeedle[i] + upperNeedle.substr(i + 1);
                    if (llp >= 0) return key.substr(0, llp) + lowerKey[llp] + upperNeedle.substr(llp + 1);
                    return null;
                }
                if (cmp(key[i], lwrKeyChar) < 0) llp = i;
            }
            if (length < lowerNeedle.length && dir === "next") return key + upperNeedle.substr(key.length);
            if (length < key.length && dir === "prev") return key.substr(0, upperNeedle.length);
            return (llp < 0 ? null : key.substr(0, llp) + lowerNeedle[llp] + upperNeedle.substr(llp + 1));
        }

        function addIgnoreCaseAlgorithm(whereClause, match, needles, suffix) {
            /// <param name="needles" type="Array" elementType="String"></param>
            var upper, lower, compare, upperNeedles, lowerNeedles, direction, nextKeySuffix,
                needlesLen = needles.length;
            if (!needles.every(s => typeof s === 'string')) {
                return fail(whereClause, STRING_EXPECTED);
            }
            function initDirection(dir) {
                upper = upperFactory(dir);
                lower = lowerFactory(dir);
                compare = (dir === "next" ? simpleCompare : simpleCompareReverse);
                var needleBounds = needles.map(function (needle){
                    return {lower: lower(needle), upper: upper(needle)};
                }).sort(function(a,b) {
                    return compare(a.lower, b.lower);
                });
                upperNeedles = needleBounds.map(function (nb){ return nb.upper; });
                lowerNeedles = needleBounds.map(function (nb){ return nb.lower; });
                direction = dir;
                nextKeySuffix = (dir === "next" ? "" : suffix);
            }
            initDirection("next");

            var c = new whereClause._ctx.collClass(whereClause, function() {
                return IDBKeyRange.bound(upperNeedles[0], lowerNeedles[needlesLen-1] + suffix);
            });

            c._ondirectionchange = function (direction) {
                // This event onlys occur before filter is called the first time.
                initDirection(direction);
            };

            var firstPossibleNeedle = 0;

            c._addAlgorithm(function (cursor, advance, resolve) {
                /// <param name="cursor" type="IDBCursor"></param>
                /// <param name="advance" type="Function"></param>
                /// <param name="resolve" type="Function"></param>
                var key = cursor.key;
                if (typeof key !== 'string') return false;
                var lowerKey = lower(key);
                if (match(lowerKey, lowerNeedles, firstPossibleNeedle)) {
                    return true;
                } else {
                    var lowestPossibleCasing = null;
                    for (var i=firstPossibleNeedle; i<needlesLen; ++i) {
                        var casing = nextCasing(key, lowerKey, upperNeedles[i], lowerNeedles[i], compare, direction);
                        if (casing === null && lowestPossibleCasing === null)
                            firstPossibleNeedle = i + 1;
                        else if (lowestPossibleCasing === null || compare(lowestPossibleCasing, casing) > 0) {
                            lowestPossibleCasing = casing;
                        }
                    }
                    if (lowestPossibleCasing !== null) {
                        advance(function () { cursor.continue(lowestPossibleCasing + nextKeySuffix); });
                    } else {
                        advance(resolve);
                    }
                    return false;
                }
            });
            return c;
        }

        //
        // WhereClause public methods
        //
        return {
            between: function (lower, upper, includeLower, includeUpper) {
                /// <summary>
                ///     Filter out records whose where-field lays between given lower and upper values. Applies to Strings, Numbers and Dates.
                /// </summary>
                /// <param name="lower"></param>
                /// <param name="upper"></param>
                /// <param name="includeLower" optional="true">Whether items that equals lower should be included. Default true.</param>
                /// <param name="includeUpper" optional="true">Whether items that equals upper should be included. Default false.</param>
                /// <returns type="Collection"></returns>
                includeLower = includeLower !== false;   // Default to true
                includeUpper = includeUpper === true;    // Default to false
                try {
                    if ((cmp(lower, upper) > 0) ||
                        (cmp(lower, upper) === 0 && (includeLower || includeUpper) && !(includeLower && includeUpper)))
                        return emptyCollection(this); // Workaround for idiotic W3C Specification that DataError must be thrown if lower > upper. The natural result would be to return an empty collection.
                    return new this._ctx.collClass(this, function() { return IDBKeyRange.bound(lower, upper, !includeLower, !includeUpper); });
                } catch (e) {
                    return fail(this, INVALID_KEY_ARGUMENT);
                }
            },
            equals: function (value) {
                return new this._ctx.collClass(this, function() { return IDBKeyRange.only(value); });
            },
            above: function (value) {
                return new this._ctx.collClass(this, function() { return IDBKeyRange.lowerBound(value, true); });
            },
            aboveOrEqual: function (value) {
                return new this._ctx.collClass(this, function() { return IDBKeyRange.lowerBound(value); });
            },
            below: function (value) {
                return new this._ctx.collClass(this, function() { return IDBKeyRange.upperBound(value, true); });
            },
            belowOrEqual: function (value) {
                return new this._ctx.collClass(this, function() { return IDBKeyRange.upperBound(value); });
            },
            startsWith: function (str) {
                /// <param name="str" type="String"></param>
                if (typeof str !== 'string') return fail(this, STRING_EXPECTED);
                return this.between(str, str + maxString, true, true);
            },
            startsWithIgnoreCase: function (str) {
                /// <param name="str" type="String"></param>
                if (str === "") return this.startsWith(str);
                return addIgnoreCaseAlgorithm(this, function (x, a) { return x.indexOf(a[0]) === 0; }, [str], maxString);
            },
            equalsIgnoreCase: function (str) {
                /// <param name="str" type="String"></param>
                return addIgnoreCaseAlgorithm(this, function (x, a) { return x === a[0]; }, [str], "");
            },
            anyOfIgnoreCase: function () {
                var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
                if (set.length === 0) return emptyCollection(this);
                return addIgnoreCaseAlgorithm(this, function (x, a) { return a.indexOf(x) !== -1; }, set, "");
            },
            startsWithAnyOfIgnoreCase: function () {
                var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
                if (set.length === 0) return emptyCollection(this);
                return addIgnoreCaseAlgorithm(this, function (x, a) {
                    return a.some(function(n){
                        return x.indexOf(n) === 0;
                    });}, set, maxString);
            },
            anyOf: function () {
                var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
                var compare = ascending;
                try { set.sort(compare); } catch(e) { return fail(this, INVALID_KEY_ARGUMENT); }
                if (set.length === 0) return emptyCollection(this);
                var c = new this._ctx.collClass(this, function () { return IDBKeyRange.bound(set[0], set[set.length - 1]); });

                c._ondirectionchange = function (direction) {
                    compare = (direction === "next" ? ascending : descending);
                    set.sort(compare);
                };
                var i = 0;
                c._addAlgorithm(function (cursor, advance, resolve) {
                    var key = cursor.key;
                    while (compare(key, set[i]) > 0) {
                        // The cursor has passed beyond this key. Check next.
                        ++i;
                        if (i === set.length) {
                            // There is no next. Stop searching.
                            advance(resolve);
                            return false;
                        }
                    }
                    if (compare(key, set[i]) === 0) {
                        // The current cursor value should be included and we should continue a single step in case next item has the same key or possibly our next key in set.
                        return true;
                    } else {
                        // cursor.key not yet at set[i]. Forward cursor to the next key to hunt for.
                        advance(function () { cursor.continue(set[i]); });
                        return false;
                    }
                });
                return c;
            },

            notEqual: function(value) {
                return this.inAnyRange([[-Infinity, value],[value, maxKey]], {includeLowers: false, includeUppers: false});
            },

            noneOf: function() {
                var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
                if (set.length === 0) return new this._ctx.collClass(this); // Return entire collection.
                try { set.sort(ascending); } catch(e) { return fail(this, INVALID_KEY_ARGUMENT);}
                // Transform ["a","b","c"] to a set of ranges for between/above/below: [[-Infinity,"a"], ["a","b"], ["b","c"], ["c",maxKey]]
                var ranges = set.reduce(function (res, val) { return res ? res.concat([[res[res.length - 1][1], val]]) : [[-Infinity, val]]; }, null);
                ranges.push([set[set.length - 1], maxKey]);
                return this.inAnyRange(ranges, {includeLowers: false, includeUppers: false});
            },

            /** Filter out values withing given set of ranges.
            * Example, give children and elders a rebate of 50%:
            *
            *   db.friends.where('age').inAnyRange([[0,18],[65,Infinity]]).modify({Rebate: 1/2});
            *
            * @param {(string|number|Date|Array)[][]} ranges
            * @param {{includeLowers: boolean, includeUppers: boolean}} options
            */
            inAnyRange: function (ranges, options) {
                var ctx = this._ctx;
                if (ranges.length === 0) return emptyCollection(this);
                if (!ranges.every(function (range) { return range[0] !== undefined && range[1] !== undefined && ascending(range[0], range[1]) <= 0;})) {
                    return fail(this, "First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower", exceptions.InvalidArgument);
                }
                var includeLowers = !options || options.includeLowers !== false;   // Default to true
                var includeUppers = options && options.includeUppers === true;    // Default to false

                function addRange (ranges, newRange) {
                    for (var i=0,l=ranges.length;i<l;++i) {
                        var range = ranges[i];
                        if (cmp(newRange[0], range[1]) < 0 && cmp(newRange[1], range[0]) > 0) {
                            range[0] = min(range[0], newRange[0]);
                            range[1] = max(range[1], newRange[1]);
                            break;
                        }
                    }
                    if (i === l)
                        ranges.push(newRange);
                    return ranges;
                }

                var sortDirection = ascending;
                function rangeSorter(a,b) { return sortDirection(a[0], b[0]);}

                // Join overlapping ranges
                var set;
                try {
                    set = ranges.reduce(addRange, []);
                    set.sort(rangeSorter);
                } catch(ex) {
                    return fail(this, INVALID_KEY_ARGUMENT);
                }

                var i = 0;
                var keyIsBeyondCurrentEntry = includeUppers ?
                    function(key) { return ascending(key, set[i][1]) > 0; } :
                    function(key) { return ascending(key, set[i][1]) >= 0; };

                var keyIsBeforeCurrentEntry = includeLowers ?
                    function(key) { return descending(key, set[i][0]) > 0; } :
                    function(key) { return descending(key, set[i][0]) >= 0; };

                function keyWithinCurrentRange (key) {
                    return !keyIsBeyondCurrentEntry(key) && !keyIsBeforeCurrentEntry(key);
                }

                var checkKey = keyIsBeyondCurrentEntry;

                var c = new ctx.collClass(this, function () {
                    return IDBKeyRange.bound(set[0][0], set[set.length - 1][1], !includeLowers, !includeUppers);
                });

                c._ondirectionchange = function (direction) {
                    if (direction === "next") {
                        checkKey = keyIsBeyondCurrentEntry;
                        sortDirection = ascending;
                    } else {
                        checkKey = keyIsBeforeCurrentEntry;
                        sortDirection = descending;
                    }
                    set.sort(rangeSorter);
                };

                c._addAlgorithm(function (cursor, advance, resolve) {
                    var key = cursor.key;
                    while (checkKey(key)) {
                        // The cursor has passed beyond this key. Check next.
                        ++i;
                        if (i === set.length) {
                            // There is no next. Stop searching.
                            advance(resolve);
                            return false;
                        }
                    }
                    if (keyWithinCurrentRange(key)) {
                        // The current cursor value should be included and we should continue a single step in case next item has the same key or possibly our next key in set.
                        return true;
                    } else if (cmp(key,set[i][1]) === 0 || cmp(key,set[i][0]) === 0) {
                        // includeUpper or includeLower is false so keyWithinCurrentRange() returns false even though we are at range border.
                        // Continue to next key but don't include this one.
                        return false;
                    } else {
                        // cursor.key not yet at set[i]. Forward cursor to the next key to hunt for.
                        advance(function() {
                            if (sortDirection === ascending) cursor.continue(set[i][0]);
                            else cursor.continue(set[i][1]);
                        });
                        return false;
                    }
                });
                return c;
            },
            startsWithAnyOf: function () {
                var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);

                if (!set.every(function (s) { return typeof s === 'string'; })) {
                    return fail(this, "startsWithAnyOf() only works with strings");
                }
                if (set.length === 0) return emptyCollection(this);

                return this.inAnyRange(set.map(function(str) {
                    return [str, str + maxString];
                }));
            }
        };
    });




    //
    //
    //
    // Collection Class
    //
    //
    //
    function Collection(whereClause, keyRangeGenerator) {
        /// <summary>
        ///
        /// </summary>
        /// <param name="whereClause" type="WhereClause">Where clause instance</param>
        /// <param name="keyRangeGenerator" value="function(){ return IDBKeyRange.bound(0,1);}" optional="true"></param>
        var keyRange = null, error = null;
        if (keyRangeGenerator) try {
            keyRange = keyRangeGenerator();
        } catch (ex) {
            error = ex;
        }

        var whereCtx = whereClause._ctx,
            table = whereCtx.table;
        this._ctx = {
            table: table,
            index: whereCtx.index,
            isPrimKey: (!whereCtx.index || (table.schema.primKey.keyPath && whereCtx.index === table.schema.primKey.name)),
            range: keyRange,
            keysOnly: false,
            dir: "next",
            unique: "",
            algorithm: null,
            filter: null,
            replayFilter: null,
            justLimit: true, // True if a replayFilter is just a filter that performs a "limit" operation (or none at all)
            isMatch: null,
            offset: 0,
            limit: Infinity,
            error: error, // If set, any promise must be rejected with this error
            or: whereCtx.or,
            valueMapper: table.hook.reading.fire
        };
    }
    
    function isPlainKeyRange (ctx, ignoreLimitFilter) {
        return !(ctx.filter || ctx.algorithm || ctx.or) &&
            (ignoreLimitFilter ? ctx.justLimit : !ctx.replayFilter);
    }    

    props(Collection.prototype, function () {

        //
        // Collection Private Functions
        //

        function addFilter(ctx, fn) {
            ctx.filter = combine(ctx.filter, fn);
        }

        function addReplayFilter (ctx, factory, isLimitFilter) {
            var curr = ctx.replayFilter;
            ctx.replayFilter = curr ? ()=>combine(curr(), factory()) : factory;
            ctx.justLimit = isLimitFilter && !curr;
        }

        function addMatchFilter(ctx, fn) {
            ctx.isMatch = combine(ctx.isMatch, fn);
        }

        /** @param ctx {
         *      isPrimKey: boolean,
         *      table: Table,
         *      index: string
         * }
         * @param store IDBObjectStore
         **/
        function getIndexOrStore(ctx, store) {
            if (ctx.isPrimKey) return store;
            var indexSpec = ctx.table.schema.idxByName[ctx.index];
            if (!indexSpec) throw new exceptions.Schema("KeyPath " + ctx.index + " on object store " + store.name + " is not indexed");
            return store.index(indexSpec.name);
        }

        /** @param ctx {
         *      isPrimKey: boolean,
         *      table: Table,
         *      index: string,
         *      keysOnly: boolean,
         *      range?: IDBKeyRange,
         *      dir: "next" | "prev"
         * }
         */
        function openCursor(ctx, store) {
            var idxOrStore = getIndexOrStore(ctx, store);
            return ctx.keysOnly && 'openKeyCursor' in idxOrStore ?
                idxOrStore.openKeyCursor(ctx.range || null, ctx.dir + ctx.unique) :
                idxOrStore.openCursor(ctx.range || null, ctx.dir + ctx.unique);
        }

        function iter(ctx, fn, resolve, reject, idbstore) {
            var filter = ctx.replayFilter ? combine(ctx.filter, ctx.replayFilter()) : ctx.filter;
            if (!ctx.or) {
                iterate(openCursor(ctx, idbstore), combine(ctx.algorithm, filter), fn, resolve, reject, !ctx.keysOnly && ctx.valueMapper);
            } else (()=>{
                var set = {};
                var resolved = 0;

                function resolveboth() {
                    if (++resolved === 2) resolve(); // Seems like we just support or btwn max 2 expressions, but there are no limit because we do recursion.
                }

                function union(item, cursor, advance) {
                    if (!filter || filter(cursor, advance, resolveboth, reject)) {
                        var key = cursor.primaryKey.toString(); // Converts any Date to String, String to String, Number to String and Array to comma-separated string
                        if (!hasOwn(set, key)) {
                            set[key] = true;
                            fn(item, cursor, advance);
                        }
                    }
                }

                ctx.or._iterate(union, resolveboth, reject, idbstore);
                iterate(openCursor(ctx, idbstore), ctx.algorithm, union, resolveboth, reject, !ctx.keysOnly && ctx.valueMapper);
            })();
        }
        function getInstanceTemplate(ctx) {
            return ctx.table.schema.instanceTemplate;
        }
        
        return {

            //
            // Collection Protected Functions
            //

            _read: function (fn, cb) {
                var ctx = this._ctx;
                if (ctx.error)
                    return ctx.table._trans(null, function rejector(resolve, reject) { reject(ctx.error); });
                else
                    return ctx.table._idbstore(READONLY, fn).then(cb);
            },
            _write: function (fn) {
                var ctx = this._ctx;
                if (ctx.error)
                    return ctx.table._trans(null, function rejector(resolve, reject) { reject(ctx.error); });
                else
                    return ctx.table._idbstore(READWRITE, fn, "locked"); // When doing write operations on collections, always lock the operation so that upcoming operations gets queued.
            },
            _addAlgorithm: function (fn) {
                var ctx = this._ctx;
                ctx.algorithm = combine(ctx.algorithm, fn);
            },

            _iterate: function (fn, resolve, reject, idbstore) {
                return iter(this._ctx, fn, resolve, reject, idbstore);
            },

            clone: function (props$$1) {
                var rv = Object.create(this.constructor.prototype),
                    ctx = Object.create(this._ctx);
                if (props$$1) extend(ctx, props$$1);
                rv._ctx = ctx;
                return rv;
            },

            raw: function () {
                this._ctx.valueMapper = null;
                return this;
            },

            //
            // Collection Public methods
            //

            each: function (fn) {
                var ctx = this._ctx;

                if (fake) {
                    var item = getInstanceTemplate(ctx),
                        primKeyPath = ctx.table.schema.primKey.keyPath,
                        key = getByKeyPath(item, ctx.index ? ctx.table.schema.idxByName[ctx.index].keyPath : primKeyPath),
                        primaryKey = getByKeyPath(item, primKeyPath);
                    fn(item, {key: key, primaryKey: primaryKey});
                }
                
                return this._read(function (resolve, reject, idbstore) {
                    iter(ctx, fn, resolve, reject, idbstore);
                });
            },

            count: function (cb) {
                if (fake) return Promise$1.resolve(0).then(cb);
                var ctx = this._ctx;

                if (isPlainKeyRange(ctx, true)) {
                    // This is a plain key range. We can use the count() method if the index.
                    return this._read(function (resolve, reject, idbstore) {
                        var idx = getIndexOrStore(ctx, idbstore);
                        var req = (ctx.range ? idx.count(ctx.range) : idx.count());
                        req.onerror = eventRejectHandler(reject);
                        req.onsuccess = function (e) {
                            resolve(Math.min(e.target.result, ctx.limit));
                        };
                    }, cb);
                } else {
                    // Algorithms, filters or expressions are applied. Need to count manually.
                    var count = 0;
                    return this._read(function (resolve, reject, idbstore) {
                        iter(ctx, function () { ++count; return false; }, function () { resolve(count); }, reject, idbstore);
                    }, cb);
                }
            },

            sortBy: function (keyPath, cb) {
                /// <param name="keyPath" type="String"></param>
                var parts = keyPath.split('.').reverse(),
                    lastPart = parts[0],
                    lastIndex = parts.length - 1;
                function getval(obj, i) {
                    if (i) return getval(obj[parts[i]], i - 1);
                    return obj[lastPart];
                }
                var order = this._ctx.dir === "next" ? 1 : -1;

                function sorter(a, b) {
                    var aVal = getval(a, lastIndex),
                        bVal = getval(b, lastIndex);
                    return aVal < bVal ? -order : aVal > bVal ? order : 0;
                }
                return this.toArray(function (a) {
                    return a.sort(sorter);
                }).then(cb);
            },

            toArray: function (cb) {
                var ctx = this._ctx;
                return this._read(function (resolve, reject, idbstore) {
                    fake && resolve([getInstanceTemplate(ctx)]);
                    if (hasGetAll && ctx.dir === 'next' && isPlainKeyRange(ctx, true) && ctx.limit > 0) {
                        // Special optimation if we could use IDBObjectStore.getAll() or
                        // IDBKeyRange.getAll():
                        var readingHook = ctx.table.hook.reading.fire;
                        var idxOrStore = getIndexOrStore(ctx, idbstore);
                        var req = ctx.limit < Infinity ?
                            idxOrStore.getAll(ctx.range, ctx.limit) :
                            idxOrStore.getAll(ctx.range);
                        req.onerror = eventRejectHandler(reject);
                        req.onsuccess = readingHook === mirror ?
                            eventSuccessHandler(resolve) :
                            wrap(eventSuccessHandler(res => {
                                try {resolve (res.map(readingHook));} catch(e) {reject(e);}
                            }));
                    } else {
                        // Getting array through a cursor.
                        var a = [];
                        iter(ctx, function (item) { a.push(item); }, function arrayComplete() {
                            resolve(a);
                        }, reject, idbstore);
                    }
                }, cb);
            },

            offset: function (offset) {
                var ctx = this._ctx;
                if (offset <= 0) return this;
                ctx.offset += offset; // For count()
                if (isPlainKeyRange(ctx)) {
                    addReplayFilter(ctx, ()=> {
                        var offsetLeft = offset;
                        return (cursor, advance) => {
                            if (offsetLeft === 0) return true;
                            if (offsetLeft === 1) { --offsetLeft; return false; }
                            advance(()=> {
                                cursor.advance(offsetLeft);
                                offsetLeft = 0;
                            });
                            return false;
                        };
                    });
                } else {
                    addReplayFilter(ctx, ()=> {
                        var offsetLeft = offset;
                        return () => (--offsetLeft < 0);
                    });
                }
                return this;
            },

            limit: function (numRows) {
                this._ctx.limit = Math.min(this._ctx.limit, numRows); // For count()
                addReplayFilter(this._ctx, ()=> {
                    var rowsLeft = numRows;
                    return function (cursor, advance, resolve) {
                        if (--rowsLeft <= 0) advance(resolve); // Stop after this item has been included
                        return rowsLeft >= 0; // If numRows is already below 0, return false because then 0 was passed to numRows initially. Otherwise we wouldnt come here.
                    };
                }, true);
                return this;
            },

            until: function (filterFunction, bIncludeStopEntry) {
                var ctx = this._ctx;
                fake && filterFunction(getInstanceTemplate(ctx));
                addFilter(this._ctx, function (cursor, advance, resolve) {
                    if (filterFunction(cursor.value)) {
                        advance(resolve);
                        return bIncludeStopEntry;
                    } else {
                        return true;
                    }
                });
                return this;
            },

            first: function (cb) {
                return this.limit(1).toArray(function (a) { return a[0]; }).then(cb);
            },

            last: function (cb) {
                return this.reverse().first(cb);
            },

            filter: function (filterFunction) {
                /// <param name="jsFunctionFilter" type="Function">function(val){return true/false}</param>
                fake && filterFunction(getInstanceTemplate(this._ctx));
                addFilter(this._ctx, function (cursor) {
                    return filterFunction(cursor.value);
                });
                // match filters not used in Dexie.js but can be used by 3rd part libraries to test a
                // collection for a match without querying DB. Used by Dexie.Observable.
                addMatchFilter(this._ctx, filterFunction); 
                return this;
            },
            
            and: function (filterFunction) {
                return this.filter(filterFunction);
            },

            or: function (indexName) {
                return new WhereClause(this._ctx.table, indexName, this);
            },

            reverse: function () {
                this._ctx.dir = (this._ctx.dir === "prev" ? "next" : "prev");
                if (this._ondirectionchange) this._ondirectionchange(this._ctx.dir);
                return this;
            },

            desc: function () {
                return this.reverse();
            },

            eachKey: function (cb) {
                var ctx = this._ctx;
                ctx.keysOnly = !ctx.isMatch;
                return this.each(function (val, cursor) { cb(cursor.key, cursor); });
            },

            eachUniqueKey: function (cb) {
                this._ctx.unique = "unique";
                return this.eachKey(cb);
            },
            
            eachPrimaryKey: function (cb) {
                var ctx = this._ctx;
                ctx.keysOnly = !ctx.isMatch;
                return this.each(function (val, cursor) { cb(cursor.primaryKey, cursor); });
            },

            keys: function (cb) {
                var ctx = this._ctx;
                ctx.keysOnly = !ctx.isMatch;
                var a = [];
                return this.each(function (item, cursor) {
                    a.push(cursor.key);
                }).then(function () {
                    return a;
                }).then(cb);
            },
            
            primaryKeys: function (cb) {
                var ctx = this._ctx;
                if (hasGetAll && ctx.dir === 'next' && isPlainKeyRange(ctx, true) && ctx.limit > 0) {
                    // Special optimation if we could use IDBObjectStore.getAllKeys() or
                    // IDBKeyRange.getAllKeys():
                    return this._read((resolve, reject, idbstore) =>{
                        var idxOrStore = getIndexOrStore(ctx, idbstore);
                        var req = ctx.limit < Infinity ?
                            idxOrStore.getAllKeys(ctx.range, ctx.limit) :
                            idxOrStore.getAllKeys(ctx.range);
                        req.onerror = eventRejectHandler(reject);
                        req.onsuccess = eventSuccessHandler(resolve);
                    }).then(cb);
                }
                ctx.keysOnly = !ctx.isMatch;
                var a = [];
                return this.each(function (item, cursor) {
                    a.push(cursor.primaryKey);
                }).then(function () {
                    return a;
                }).then(cb);
            },

            uniqueKeys: function (cb) {
                this._ctx.unique = "unique";
                return this.keys(cb);
            },

            firstKey: function (cb) {
                return this.limit(1).keys(function (a) { return a[0]; }).then(cb);
            },

            lastKey: function (cb) {
                return this.reverse().firstKey(cb);
            },

            distinct: function () {
                var ctx = this._ctx,
                    idx = ctx.index && ctx.table.schema.idxByName[ctx.index];
                if (!idx || !idx.multi) return this; // distinct() only makes differencies on multiEntry indexes.
                var set = {};
                addFilter(this._ctx, function (cursor) {
                    var strKey = cursor.primaryKey.toString(); // Converts any Date to String, String to String, Number to String and Array to comma-separated string
                    var found = hasOwn(set, strKey);
                    set[strKey] = true;
                    return !found;
                });
                return this;
            }
        };
    });

    //
    //
    // WriteableCollection Class
    //
    //
    function WriteableCollection() {
        Collection.apply(this, arguments);
    }

    derive(WriteableCollection).from(Collection).extend({

        //
        // WriteableCollection Public Methods
        //

        modify: function (changes) {
            var self = this,
                ctx = this._ctx,
                hook = ctx.table.hook,
                updatingHook = hook.updating.fire,
                deletingHook = hook.deleting.fire;

            fake && typeof changes === 'function' && changes.call({ value: ctx.table.schema.instanceTemplate }, ctx.table.schema.instanceTemplate);

            return this._write(function (resolve, reject, idbstore, trans) {
                var modifyer;
                if (typeof changes === 'function') {
                    // Changes is a function that may update, add or delete propterties or even require a deletion the object itself (delete this.item)
                    if (updatingHook === nop && deletingHook === nop) {
                        // Noone cares about what is being changed. Just let the modifier function be the given argument as is.
                        modifyer = changes;
                    } else {
                        // People want to know exactly what is being modified or deleted.
                        // Let modifyer be a proxy function that finds out what changes the caller is actually doing
                        // and call the hooks accordingly!
                        modifyer = function (item) {
                            var origItem = deepClone(item); // Clone the item first so we can compare laters.
                            if (changes.call(this, item, this) === false) return false; // Call the real modifyer function (If it returns false explicitely, it means it dont want to modify anyting on this object)
                            if (!hasOwn(this, "value")) {
                                // The real modifyer function requests a deletion of the object. Inform the deletingHook that a deletion is taking place.
                                deletingHook.call(this, this.primKey, item, trans);
                            } else {
                                // No deletion. Check what was changed
                                var objectDiff = getObjectDiff(origItem, this.value);
                                var additionalChanges = updatingHook.call(this, objectDiff, this.primKey, origItem, trans);
                                if (additionalChanges) {
                                    // Hook want to apply additional modifications. Make sure to fullfill the will of the hook.
                                    item = this.value;
                                    keys(additionalChanges).forEach(function (keyPath) {
                                        setByKeyPath(item, keyPath, additionalChanges[keyPath]);  // Adding {keyPath: undefined} means that the keyPath should be deleted. Handled by setByKeyPath
                                    });
                                }
                            }
                        };
                    }
                } else if (updatingHook === nop) {
                    // changes is a set of {keyPath: value} and no one is listening to the updating hook.
                    var keyPaths = keys(changes);
                    var numKeys = keyPaths.length;
                    modifyer = function (item) {
                        var anythingModified = false;
                        for (var i = 0; i < numKeys; ++i) {
                            var keyPath = keyPaths[i], val = changes[keyPath];
                            if (getByKeyPath(item, keyPath) !== val) {
                                setByKeyPath(item, keyPath, val); // Adding {keyPath: undefined} means that the keyPath should be deleted. Handled by setByKeyPath
                                anythingModified = true;
                            }
                        }
                        return anythingModified;
                    };
                } else {
                    // changes is a set of {keyPath: value} and people are listening to the updating hook so we need to call it and
                    // allow it to add additional modifications to make.
                    var origChanges = changes;
                    changes = shallowClone(origChanges); // Let's work with a clone of the changes keyPath/value set so that we can restore it in case a hook extends it.
                    modifyer = function (item) {
                        var anythingModified = false;
                        var additionalChanges = updatingHook.call(this, changes, this.primKey, deepClone(item), trans);
                        if (additionalChanges) extend(changes, additionalChanges);
                        keys(changes).forEach(function (keyPath) {
                            var val = changes[keyPath];
                            if (getByKeyPath(item, keyPath) !== val) {
                                setByKeyPath(item, keyPath, val);
                                anythingModified = true;
                            }
                        });
                        if (additionalChanges) changes = shallowClone(origChanges); // Restore original changes for next iteration
                        return anythingModified;
                    };
                }

                var count = 0;
                var successCount = 0;
                var iterationComplete = false;
                var failures = [];
                var failKeys = [];
                var currentKey = null;

                function modifyItem(item, cursor) {
                    currentKey = cursor.primaryKey;
                    var thisContext = {
                        primKey: cursor.primaryKey,
                        value: item,
                        onsuccess: null,
                        onerror: null
                    };

                    function onerror(e) {
                        failures.push(e);
                        failKeys.push(thisContext.primKey);
                        checkFinished();
                        return true; // Catch these errors and let a final rejection decide whether or not to abort entire transaction
                    }

                    if (modifyer.call(thisContext, item, thisContext) !== false) { // If a callback explicitely returns false, do not perform the update!
                        var bDelete = !hasOwn(thisContext, "value");
                        ++count;
                        tryCatch(function () {
                            var req = (bDelete ? cursor.delete() : cursor.update(thisContext.value));
                            req._hookCtx = thisContext;
                            req.onerror = hookedEventRejectHandler(onerror);
                            req.onsuccess = hookedEventSuccessHandler(function () {
                                ++successCount;
                                checkFinished();
                            });
                        }, onerror);
                    } else if (thisContext.onsuccess) {
                        // Hook will expect either onerror or onsuccess to always be called!
                        thisContext.onsuccess(thisContext.value);
                    }
                }

                function doReject(e) {
                    if (e) {
                        failures.push(e);
                        failKeys.push(currentKey);
                    }
                    return reject(new ModifyError("Error modifying one or more objects", failures, successCount, failKeys));
                }

                function checkFinished() {
                    if (iterationComplete && successCount + failures.length === count) {
                        if (failures.length > 0)
                            doReject();
                        else
                            resolve(successCount);
                    }
                }
                self.clone().raw()._iterate(modifyItem, function () {
                    iterationComplete = true;
                    checkFinished();
                }, doReject, idbstore);
            });
        },

        'delete': function () {
            var ctx = this._ctx,
                range = ctx.range,
                deletingHook = ctx.table.hook.deleting.fire,
                hasDeleteHook = deletingHook !== nop;
            if (!hasDeleteHook &&
                isPlainKeyRange(ctx) &&
                ((ctx.isPrimKey && !hangsOnDeleteLargeKeyRange) || !range)) // if no range, we'll use clear().
            {
                // May use IDBObjectStore.delete(IDBKeyRange) in this case (Issue #208)
                // For chromium, this is the way most optimized version.
                // For IE/Edge, this could hang the indexedDB engine and make operating system instable
                // (https://gist.github.com/dfahlander/5a39328f029de18222cf2125d56c38f7)
                return this._write((resolve, reject, idbstore) => {
                    // Our API contract is to return a count of deleted items, so we have to count() before delete().
                    var onerror = eventRejectHandler(reject),
                        countReq = (range ? idbstore.count(range) : idbstore.count());
                    countReq.onerror = onerror;
                    countReq.onsuccess = () => {
                        var count = countReq.result;
                        tryCatch(()=> {
                            var delReq = (range ? idbstore.delete(range) : idbstore.clear());
                            delReq.onerror = onerror;
                            delReq.onsuccess = () => resolve(count);
                        }, err => reject(err));
                    };
                });
            }

            // Default version to use when collection is not a vanilla IDBKeyRange on the primary key.
            // Divide into chunks to not starve RAM.
            // If has delete hook, we will have to collect not just keys but also objects, so it will use
            // more memory and need lower chunk size.
            const CHUNKSIZE = hasDeleteHook ? 2000 : 10000;

            return this._write((resolve, reject, idbstore, trans) => {
                var totalCount = 0;
                // Clone collection and change its table and set a limit of CHUNKSIZE on the cloned Collection instance.
                var collection = this
                    .clone({
                        keysOnly: !ctx.isMatch && !hasDeleteHook}) // load just keys (unless filter() or and() or deleteHook has subscribers)
                    .distinct() // In case multiEntry is used, never delete same key twice because resulting count
                                // would become larger than actual delete count.
                    .limit(CHUNKSIZE)
                    .raw(); // Don't filter through reading-hooks (like mapped classes etc)

                var keysOrTuples = [];

                // We're gonna do things on as many chunks that are needed.
                // Use recursion of nextChunk function:
                const nextChunk = () => collection.each(hasDeleteHook ? (val, cursor) => {
                    // Somebody subscribes to hook('deleting'). Collect all primary keys and their values,
                    // so that the hook can be called with its values in bulkDelete().
                    keysOrTuples.push([cursor.primaryKey, cursor.value]);
                } : (val, cursor) => {
                    // No one subscribes to hook('deleting'). Collect only primary keys:
                    keysOrTuples.push(cursor.primaryKey);
                }).then(() => {
                    // Chromium deletes faster when doing it in sort order.
                    hasDeleteHook ?
                        keysOrTuples.sort((a, b)=>ascending(a[0], b[0])) :
                        keysOrTuples.sort(ascending);
                    return bulkDelete(idbstore, trans, keysOrTuples, hasDeleteHook, deletingHook);

                }).then(()=> {
                    var count = keysOrTuples.length;
                    totalCount += count;
                    keysOrTuples = [];
                    return count < CHUNKSIZE ? totalCount : nextChunk();
                });

                resolve (nextChunk());
            });
        }
    });


    //
    //
    //
    // ------------------------- Help functions ---------------------------
    //
    //
    //

    function lowerVersionFirst(a, b) {
        return a._cfg.version - b._cfg.version;
    }

    function setApiOnPlace(objs, tableNames, mode, dbschema) {
        tableNames.forEach(function (tableName) {
            var tableInstance = db._tableFactory(mode, dbschema[tableName]);
            objs.forEach(function (obj) {
                tableName in obj || (obj[tableName] = tableInstance);
            });
        });
    }

    function removeTablesApi(objs) {
        objs.forEach(function (obj) {
            for (var key in obj) {
                if (obj[key] instanceof Table) delete obj[key];
            }
        });
    }

    function iterate(req, filter, fn, resolve, reject, valueMapper) {
        
        // Apply valueMapper (hook('reading') or mappped class)
        var mappedFn = valueMapper ? (x,c,a) => fn(valueMapper(x),c,a) : fn;
        // Wrap fn with PSD and microtick stuff from Promise.
        var wrappedFn = wrap(mappedFn, reject);
        
        if (!req.onerror) req.onerror = eventRejectHandler(reject);
        if (filter) {
            req.onsuccess = trycatcher(function filter_record() {
                var cursor = req.result;
                if (cursor) {
                    var c = function () { cursor.continue(); };
                    if (filter(cursor, function (advancer) { c = advancer; }, resolve, reject))
                        wrappedFn(cursor.value, cursor, function (advancer) { c = advancer; });
                    c();
                } else {
                    resolve();
                }
            }, reject);
        } else {
            req.onsuccess = trycatcher(function filter_record() {
                var cursor = req.result;
                if (cursor) {
                    var c = function () { cursor.continue(); };
                    wrappedFn(cursor.value, cursor, function (advancer) { c = advancer; });
                    c();
                } else {
                    resolve();
                }
            }, reject);
        }
    }

    function parseIndexSyntax(indexes) {
        /// <param name="indexes" type="String"></param>
        /// <returns type="Array" elementType="IndexSpec"></returns>
        var rv = [];
        indexes.split(',').forEach(function (index) {
            index = index.trim();
            var name = index.replace(/([&*]|\+\+)/g, ""); // Remove "&", "++" and "*"
            // Let keyPath of "[a+b]" be ["a","b"]:
            var keyPath = /^\[/.test(name) ? name.match(/^\[(.*)\]$/)[1].split('+') : name;

            rv.push(new IndexSpec(
                name,
                keyPath || null,
                /\&/.test(index),
                /\*/.test(index),
                /\+\+/.test(index),
                isArray(keyPath),
                /\./.test(index)
            ));
        });
        return rv;
    }

    function cmp(key1, key2) {
        return indexedDB.cmp(key1, key2);
    }

    function min(a, b) {
        return cmp(a, b) < 0 ? a : b;
    }

    function max(a, b) {
        return cmp(a, b) > 0 ? a : b;
    }

    function ascending(a,b) {
        return indexedDB.cmp(a,b);
    }

    function descending(a, b) {
        return indexedDB.cmp(b,a);
    }

    function simpleCompare(a, b) {
        return a < b ? -1 : a === b ? 0 : 1;
    }

    function simpleCompareReverse(a, b) {
        return a > b ? -1 : a === b ? 0 : 1;
    }

    function combine(filter1, filter2) {
        return filter1 ?
            filter2 ?
                function () { return filter1.apply(this, arguments) && filter2.apply(this, arguments); } :
                filter1 :
            filter2;
    }

    function readGlobalSchema() {
        db.verno = idbdb.version / 10;
        db._dbSchema = globalSchema = {};
        dbStoreNames = slice(idbdb.objectStoreNames, 0);
        if (dbStoreNames.length === 0) return; // Database contains no stores.
        var trans = idbdb.transaction(safariMultiStoreFix(dbStoreNames), 'readonly');
        dbStoreNames.forEach(function (storeName) {
            var store = trans.objectStore(storeName),
                keyPath = store.keyPath,
                dotted = keyPath && typeof keyPath === 'string' && keyPath.indexOf('.') !== -1;
            var primKey = new IndexSpec(keyPath, keyPath || "", false, false, !!store.autoIncrement, keyPath && typeof keyPath !== 'string', dotted);
            var indexes = [];
            for (var j = 0; j < store.indexNames.length; ++j) {
                var idbindex = store.index(store.indexNames[j]);
                keyPath = idbindex.keyPath;
                dotted = keyPath && typeof keyPath === 'string' && keyPath.indexOf('.') !== -1;
                var index = new IndexSpec(idbindex.name, keyPath, !!idbindex.unique, !!idbindex.multiEntry, false, keyPath && typeof keyPath !== 'string', dotted);
                indexes.push(index);
            }
            globalSchema[storeName] = new TableSchema(storeName, primKey, indexes, {});
        });
        setApiOnPlace([allTables, Transaction.prototype], keys(globalSchema), READWRITE, globalSchema);
    }

    function adjustToExistingIndexNames(schema, idbtrans) {
        /// <summary>
        /// Issue #30 Problem with existing db - adjust to existing index names when migrating from non-dexie db
        /// </summary>
        /// <param name="schema" type="Object">Map between name and TableSchema</param>
        /// <param name="idbtrans" type="IDBTransaction"></param>
        var storeNames = idbtrans.db.objectStoreNames;
        for (var i = 0; i < storeNames.length; ++i) {
            var storeName = storeNames[i];
            var store = idbtrans.objectStore(storeName);
            hasGetAll = 'getAll' in store;
            for (var j = 0; j < store.indexNames.length; ++j) {
                var indexName = store.indexNames[j];
                var keyPath = store.index(indexName).keyPath;
                var dexieName = typeof keyPath === 'string' ? keyPath : "[" + slice(keyPath).join('+') + "]";
                if (schema[storeName]) {
                    var indexSpec = schema[storeName].idxByName[dexieName];
                    if (indexSpec) indexSpec.name = indexName;
                }
            }
        }
    }

    function fireOnBlocked(ev) {
        db.on("blocked").fire(ev);
        // Workaround (not fully*) for missing "versionchange" event in IE,Edge and Safari:
        connections
            .filter(c=>c.name === db.name && c !== db && !c._vcFired)
            .map(c => c.on("versionchange").fire(ev));
    }

    extend(this, {
        Collection: Collection,
        Table: Table,
        Transaction: Transaction,
        Version: Version,
        WhereClause: WhereClause,
        WriteableCollection: WriteableCollection,
        WriteableTable: WriteableTable
    });

    init();

    addons.forEach(function (fn) {
        fn(db);
    });
}

var fakeAutoComplete = function () { };// Will never be changed. We just fake for the IDE that we change it (see doFakeAutoComplete())
var fake = false; // Will never be changed. We just fake for the IDE that we change it (see doFakeAutoComplete())

function parseType(type) {
    if (typeof type === 'function') {
        return new type();
    } else if (isArray(type)) {
        return [parseType(type[0])];
    } else if (type && typeof type === 'object') {
        var rv = {};
        applyStructure(rv, type);
        return rv;
    } else {
        return type;
    }
}

function applyStructure(obj, structure) {
    keys(structure).forEach(function (member) {
        var value = parseType(structure[member]);
        obj[member] = value;
    });
    return obj;
}

function eventSuccessHandler(done) {
    return function (ev) {
        done(ev.target.result);
    }
}

function hookedEventSuccessHandler(resolve) {
    // wrap() is needed when calling hooks because the rare scenario of:
    //  * hook does a db operation that fails immediately (IDB throws exception)
    //    For calling db operations on correct transaction, wrap makes sure to set PSD correctly.
    //    wrap() will also execute in a virtual tick.
    //  * If not wrapped in a virtual tick, direct exception will launch a new physical tick.
    //  * If this was the last event in the bulk, the promise will resolve after a physical tick
    //    and the transaction will have committed already.
    // If no hook, the virtual tick will be executed in the reject()/resolve of the final promise,
    // because it is always marked with _lib = true when created using Transaction._promise().
    return wrap(function(event) {
        var req = event.target,
            result = req.result,
            ctx = req._hookCtx,// Contains the hook error handler. Put here instead of closure to boost performance.
            hookSuccessHandler = ctx && ctx.onsuccess;
        hookSuccessHandler && hookSuccessHandler(result);
        resolve && resolve(result);
    }, resolve);
}

function eventRejectHandler(reject) {
    return function (event) {
        preventDefault(event);
        reject (event.target.error);
        return false;
    };
}

function hookedEventRejectHandler (reject) {
    return wrap(function (event) {
        // See comment on hookedEventSuccessHandler() why wrap() is needed only when supporting hooks.
        
        var req = event.target,
            err = req.error,
            ctx = req._hookCtx,// Contains the hook error handler. Put here instead of closure to boost performance.
            hookErrorHandler = ctx && ctx.onerror;
        hookErrorHandler && hookErrorHandler(err);
        preventDefault(event);
        reject (err);
        return false;
    });
}

function preventDefault(event) {
    if (event.stopPropagation) // IndexedDBShim doesnt support this on Safari 8 and below.
        event.stopPropagation();
    if (event.preventDefault) // IndexedDBShim doesnt support this on Safari 8 and below.
        event.preventDefault();
}

function globalDatabaseList(cb) {
    var val,
        localStorage = Dexie.dependencies.localStorage;
    if (!localStorage) return cb([]); // Envs without localStorage support
    try {
        val = JSON.parse(localStorage.getItem('Dexie.DatabaseNames') || "[]");
    } catch (e) {
        val = [];
    }
    if (cb(val)) {
        localStorage.setItem('Dexie.DatabaseNames', JSON.stringify(val));
    }
}

function awaitIterator (iterator) {
    var callNext = result => iterator.next(result),
        doThrow = error => iterator.throw(error),
        onSuccess = step(callNext),
        onError = step(doThrow);

    function step(getNext) {
        return val => {
            var next = getNext(val),
                value = next.value;

            return next.done ? value :
                (!value || typeof value.then !== 'function' ?
                    isArray(value) ? Promise$1.all(value).then(onSuccess, onError) : onSuccess(value) :
                    value.then(onSuccess, onError));
        };
    }

    return step(callNext)();
}

//
// IndexSpec struct
//
function IndexSpec(name, keyPath, unique, multi, auto, compound, dotted) {
    /// <param name="name" type="String"></param>
    /// <param name="keyPath" type="String"></param>
    /// <param name="unique" type="Boolean"></param>
    /// <param name="multi" type="Boolean"></param>
    /// <param name="auto" type="Boolean"></param>
    /// <param name="compound" type="Boolean"></param>
    /// <param name="dotted" type="Boolean"></param>
    this.name = name;
    this.keyPath = keyPath;
    this.unique = unique;
    this.multi = multi;
    this.auto = auto;
    this.compound = compound;
    this.dotted = dotted;
    var keyPathSrc = typeof keyPath === 'string' ? keyPath : keyPath && ('[' + [].join.call(keyPath, '+') + ']');
    this.src = (unique ? '&' : '') + (multi ? '*' : '') + (auto ? "++" : "") + keyPathSrc;
}

//
// TableSchema struct
//
function TableSchema(name, primKey, indexes, instanceTemplate) {
    /// <param name="name" type="String"></param>
    /// <param name="primKey" type="IndexSpec"></param>
    /// <param name="indexes" type="Array" elementType="IndexSpec"></param>
    /// <param name="instanceTemplate" type="Object"></param>
    this.name = name;
    this.primKey = primKey || new IndexSpec();
    this.indexes = indexes || [new IndexSpec()];
    this.instanceTemplate = instanceTemplate;
    this.mappedClass = null;
    this.idxByName = arrayToObject(indexes, index => [index.name, index]);
}

// Used in when defining dependencies later...
// (If IndexedDBShim is loaded, prefer it before standard indexedDB)
var idbshim = _global.idbModules && _global.idbModules.shimIndexedDB ? _global.idbModules : {};

function safariMultiStoreFix(storeNames) {
    return storeNames.length === 1 ? storeNames[0] : storeNames;
}

function getNativeGetDatabaseNamesFn(indexedDB) {
    var fn = indexedDB && (indexedDB.getDatabaseNames || indexedDB.webkitGetDatabaseNames);
    return fn && fn.bind(indexedDB);
}

// Export Error classes
props(Dexie, fullNameExceptions); // Dexie.XXXError = class XXXError {...};

//
// Static methods and properties
// 
props(Dexie, {
    
    //
    // Static delete() method.
    //
    delete: function (databaseName) {
        var db = new Dexie(databaseName),
            promise = db.delete();
        promise.onblocked = function (fn) {
            db.on("blocked", fn);
            return this;
        };
        return promise;
    },
    
    //
    // Static exists() method.
    //
    exists: function(name) {
        return new Dexie(name).open().then(db=>{
            db.close();
            return true;
        }).catch(Dexie.NoSuchDatabaseError, () => false);
    },
    
    //
    // Static method for retrieving a list of all existing databases at current host.
    //
    getDatabaseNames: function (cb) {
        return new Promise$1(function (resolve, reject) {
            var getDatabaseNames = getNativeGetDatabaseNamesFn(indexedDB);
            if (getDatabaseNames) { // In case getDatabaseNames() becomes standard, let's prepare to support it:
                var req = getDatabaseNames();
                req.onsuccess = function (event) {
                    resolve(slice(event.target.result, 0)); // Converst DOMStringList to Array<String>
                };
                req.onerror = eventRejectHandler(reject);
            } else {
                globalDatabaseList(function (val) {
                    resolve(val);
                    return false;
                });
            }
        }).then(cb);
    },
    
    defineClass: function (structure) {
        /// <summary>
        ///     Create a javascript constructor based on given template for which properties to expect in the class.
        ///     Any property that is a constructor function will act as a type. So {name: String} will be equal to {name: new String()}.
        /// </summary>
        /// <param name="structure">Helps IDE code completion by knowing the members that objects contain and not just the indexes. Also
        /// know what type each member has. Example: {name: String, emailAddresses: [String], properties: {shoeSize: Number}}</param>

        // Default constructor able to copy given properties into this object.
        function Class(properties) {
            /// <param name="properties" type="Object" optional="true">Properties to initialize object with.
            /// </param>
            properties ? extend(this, properties) : fake && applyStructure(this, structure);
        }
        return Class;
    },
    
    applyStructure: applyStructure,
    
    ignoreTransaction: function (scopeFunc) {
        // In case caller is within a transaction but needs to create a separate transaction.
        // Example of usage:
        //
        // Let's say we have a logger function in our app. Other application-logic should be unaware of the
        // logger function and not need to include the 'logentries' table in all transaction it performs.
        // The logging should always be done in a separate transaction and not be dependant on the current
        // running transaction context. Then you could use Dexie.ignoreTransaction() to run code that starts a new transaction.
        //
        //     Dexie.ignoreTransaction(function() {
        //         db.logentries.add(newLogEntry);
        //     });
        //
        // Unless using Dexie.ignoreTransaction(), the above example would try to reuse the current transaction
        // in current Promise-scope.
        //
        // An alternative to Dexie.ignoreTransaction() would be setImmediate() or setTimeout(). The reason we still provide an
        // API for this because
        //  1) The intention of writing the statement could be unclear if using setImmediate() or setTimeout().
        //  2) setTimeout() would wait unnescessary until firing. This is however not the case with setImmediate().
        //  3) setImmediate() is not supported in the ES standard.
        //  4) You might want to keep other PSD state that was set in a parent PSD, such as PSD.letThrough.
        return PSD.trans ?
            usePSD(PSD.transless, scopeFunc) : // Use the closest parent that was non-transactional.
            scopeFunc(); // No need to change scope because there is no ongoing transaction.
    },
    
    vip: function (fn) {
        // To be used by subscribers to the on('ready') event.
        // This will let caller through to access DB even when it is blocked while the db.ready() subscribers are firing.
        // This would have worked automatically if we were certain that the Provider was using Dexie.Promise for all asyncronic operations. The promise PSD
        // from the provider.connect() call would then be derived all the way to when provider would call localDatabase.applyChanges(). But since
        // the provider more likely is using non-promise async APIs or other thenable implementations, we cannot assume that.
        // Note that this method is only useful for on('ready') subscribers that is returning a Promise from the event. If not using vip()
        // the database could deadlock since it wont open until the returned Promise is resolved, and any non-VIPed operation started by
        // the caller will not resolve until database is opened.
        return newScope(function () {
            PSD.letThrough = true; // Make sure we are let through if still blocking db due to onready is firing.
            return fn();
        });
    },

    async: function (generatorFn) {
        return function () {
            try {
                var rv = awaitIterator(generatorFn.apply(this, arguments));
                if (!rv || typeof rv.then !== 'function')
                    return Promise$1.resolve(rv);
                return rv;
            } catch (e) {
                return rejection (e);
            }
        };
    },

    spawn: function (generatorFn, args, thiz) {
        try {
            var rv = awaitIterator(generatorFn.apply(thiz, args || []));
            if (!rv || typeof rv.then !== 'function')
                return Promise$1.resolve(rv);
            return rv;
        } catch (e) {
            return rejection(e);
        }
    },
    
    // Dexie.currentTransaction property
    currentTransaction: {
        get: () => PSD.trans || null
    },
    
    // Export our Promise implementation since it can be handy as a standalone Promise implementation
    Promise: Promise$1,
    
    // Dexie.debug proptery:
    // Dexie.debug = false
    // Dexie.debug = true
    // Dexie.debug = "dexie" - don't hide dexie's stack frames.
    debug: {
        get: () => debug,
        set: value => {
            setDebug(value, value === 'dexie' ? ()=>true : dexieStackFrameFilter);
        }
    },
    
    // Export our derive/extend/override methodology
    derive: derive,
    extend: extend,
    props: props,
    override: override,
    // Export our Events() function - can be handy as a toolkit
    Events: Events,
    events: { get: deprecated(()=>Events) }, // Backward compatible lowercase version.
    // Utilities
    getByKeyPath: getByKeyPath,
    setByKeyPath: setByKeyPath,
    delByKeyPath: delByKeyPath,
    shallowClone: shallowClone,
    deepClone: deepClone,
    getObjectDiff: getObjectDiff,
    asap: asap,
    maxKey: maxKey,
    // Addon registry
    addons: [],
    // Global DB connection list
    connections: connections,
    
    MultiModifyError: exceptions.Modify, // Backward compatibility 0.9.8. Deprecate.
    errnames: errnames,
    
    // Export other static classes
    IndexSpec: IndexSpec,
    TableSchema: TableSchema,
    
    //
    // Dependencies
    //
    // These will automatically work in browsers with indexedDB support, or where an indexedDB polyfill has been included.
    //
    // In node.js, however, these properties must be set "manually" before instansiating a new Dexie().
    // For node.js, you need to require indexeddb-js or similar and then set these deps.
    //
    dependencies: {
        // Required:
        indexedDB: idbshim.shimIndexedDB || _global.indexedDB || _global.mozIndexedDB || _global.webkitIndexedDB || _global.msIndexedDB,
        IDBKeyRange: idbshim.IDBKeyRange || _global.IDBKeyRange || _global.webkitIDBKeyRange
    },
    
    // API Version Number: Type Number, make sure to always set a version number that can be comparable correctly. Example: 0.9, 0.91, 0.92, 1.0, 1.01, 1.1, 1.2, 1.21, etc.
    semVer: DEXIE_VERSION,
    version: DEXIE_VERSION.split('.')
        .map(n => parseInt(n))
        .reduce((p,c,i) => p + (c/Math.pow(10,i*2))),
    fakeAutoComplete: fakeAutoComplete,
    
    // https://github.com/dfahlander/Dexie.js/issues/186
    // typescript compiler tsc in mode ts-->es5 & commonJS, will expect require() to return
    // x.default. Workaround: Set Dexie.default = Dexie.
    default: Dexie
});

tryCatch(()=>{
    // Optional dependencies
    // localStorage
    Dexie.dependencies.localStorage =
        ((typeof chrome !== "undefined" && chrome !== null ? chrome.storage : void 0) != null ? null : _global.localStorage);
});

// Map DOMErrors and DOMExceptions to corresponding Dexie errors. May change in Dexie v2.0.
Promise$1.rejectionMapper = mapError;

// Fool IDE to improve autocomplete. Tested with Visual Studio 2013 and 2015.
doFakeAutoComplete(function() {
    Dexie.fakeAutoComplete = fakeAutoComplete = doFakeAutoComplete;
    Dexie.fake = fake = true;
});

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();









var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};











var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};

var CurveDatabase = function (_Dexie) {
    inherits(CurveDatabase, _Dexie);

    function CurveDatabase(name) {
        classCallCheck(this, CurveDatabase);

        var _this = possibleConstructorReturn(this, (CurveDatabase.__proto__ || Object.getPrototypeOf(CurveDatabase)).call(this, name));

        _this.version(1).stores({
            values: '&index, value'
        });
        return _this;
    }

    return CurveDatabase;
}(Dexie);
var CurveCache = function () {
    function CurveCache(name) {
        classCallCheck(this, CurveCache);

        this.db = new CurveDatabase(name);
    }

    createClass(CurveCache, [{
        key: 'add_value',
        value: function add_value(index, value) {
            this.db.values.add({ index: index, value: value }).catch(function (e) {
                console.log("error:", e);
            });
        }
    }]);
    return CurveCache;
}();
var IntervalDatabase = function (_Dexie2) {
    inherits(IntervalDatabase, _Dexie2);

    function IntervalDatabase(name) {
        classCallCheck(this, IntervalDatabase);

        var _this2 = possibleConstructorReturn(this, (IntervalDatabase.__proto__ || Object.getPrototypeOf(IntervalDatabase)).call(this, name));

        _this2.version(1).stores({
            values: '&start, end'
        });
        return _this2;
    }

    return IntervalDatabase;
}(Dexie);
var IntervalCache = function () {
    function IntervalCache(name) {
        classCallCheck(this, IntervalCache);

        this.db = new IntervalDatabase(name.concat('_intervals'));
    }
    /*
    add_value(index: number, value: number){
      this.db.values.add({index:index, value:value}).catch(e => {
        console.log("error:", e)
      })
    }
    */
    /*
       
     X---X     X------X             X-----X              X-----X     X---X
                        |----------------------------------------|
                  start                                     end
    */


    createClass(IntervalCache, [{
        key: 'mark_interval_as_loaded',
        value: function mark_interval_as_loaded(start, end) {
            var _this3 = this;

            //this.db.intervals.where("start").between(monitor._start, monitor._end).toArray(got_data => {
            // within one transaction
            // find all interval that end is greater (or equal?) to provided start
            // and start is less then provided end
            // for each found element:
            //     if found interval start is less then provided start new interval start to be set to found interval start
            //     if found interval end is greater then provided end then new interval end to be set to found interval end
            //     delete interval
            // add new interva;
            //this.db
            //transaction is really not necessary we can communicate that interval
            //is being update by other means also if we read and there tranaction
            // probably not that big of a deal. probably over time we will serialize
            // all stuff that goes into database to make sure nothing fishy is going
            // on
            var mark_start = start;
            var mark_end = end;
            this.db.transaction('rw', this.db.intervals, function () {
                //
                // Transaction Scope
                //
                //this.db.intervals.where("end").above(start).and(this.db.intervals.where("start").below(end)).toArray(got_intervals => {
                _this3.db.intervals.where("end").above(start).and(function (interval) {
                    return interval.start < end;
                }).toArray(function (got_intervals) {
                    //this.db.intervals.where("end").above(start).toArray(got_intervals => {
                    // probably most efficient way to do it is to query fist and last instead
                    for (var v = 0; v < got_intervals.length; v++) {
                        //console.log(">",got_data[v].index, " : ", got_data[v].value)
                        if (got_intervals[v].start < mark_start) {
                            mark_start = got_intervals[v].start;
                        }
                        if (got_intervals[v].end > mark_end) {
                            mark_end = got_intervals[v].end;
                        }
                    }
                });
                // can we do something better, reuse query
                _this3.db.intervals.where("end").above(start).and(function (interval) {
                    return interval.start < end;
                }).delete();
                //this.db.intervals.where("end").above(start).below(end).delete()
                //this.db.intervals.where("end").above(start).delete()
                _this3.db.intervals.add({ start: mark_start, end: mark_end }).catch(function (e) {
                    console.log("can not add interval error:", e);
                });
            }).then(function (result) {
                //
                // Transaction Committed
                //
            }).catch(function (error) {
                //
                // Transaction Failed
                //
            });
        }
    }, {
        key: 'get_unloaded_range',
        value: function get_unloaded_range(start, end) {
            var _this4 = this;

            // same as maesk interval (move to function?)
            // if found 0:
            //     return [start, end]
            // else:
            //     tail = None
            //     iterate over intervals:
            //     if tail is None:
            //         tail = end
            //     else:
            //         add_interval = [tail, i.start]
            //         tail = end;
            //     after loop
            //     if tail < end:
            //       add_interval = [tail, end]
            var range_start = start;
            var range_end = end;
            var result = [];
            var unloaded = [];
            this.db.transaction('rw', this.db.intervals, function () {
                //
                // Transaction Scope
                //
                //this.db.intervals.where("end").above(start).and(this.db.intervals.where("start").below(end)).toArray(got_intervals => {
                _this4.db.intervals.where("end").above(start).and(function (interval) {
                    return interval.start < end;
                }).toArray(function (got_intervals) {
                    //this.db.intervals.where("end").above(start).toArray(got_intervals => {
                    // probably most efficient way to do it is to query fist and last instead
                    for (var v = 0; v < got_intervals.length; v++) {
                        // if interval starts before range_start
                        if (got_intervals[v].start <= range_start) {
                            if (got_intervals[v].end >= range_end) {
                                return [];
                            }
                            if (got_intervals[v].end > range_start) {
                                range_start = got_intervals[v].end;
                                continue;
                            }
                        }
                        // if interval ends after range_end
                        if (got_intervals[v].end >= range_end) {
                            if (got_intervals[v].start <= range_start) {
                                return [];
                            }
                            if (got_intervals[v].start <= range_end) {
                                range_end = got_intervals[v].start;
                                continue;
                            }
                        }
                        result.push([got_intervals[v].start, got_intervals[v].end]);
                    }
                    /*
                    for (let v=0; v<got_intervals.length; v++) {
                      //console.log(">",got_data[v].index, " : ", got_data[v].value)
                      if (got_intervals[v].start < mark_start) {
                        mark_start = got_intervals[v].start;
                      }
                         if (got_intervals[v].end > mark_end) {
                        mark_end = got_intervals[v].end;
                      }
                    }
                    */
                });
                /*
                if (resut.Length) {
                 }
                */
                var i_start = range_start;
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = result[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var loaded_interval = _step.value;

                        var i_end = loaded_interval[0];
                        unloaded.push([i_start, i_end]);
                        i_start = loaded_interval[1];
                    }
                    /*
                    // can we do something better, reuse query
                    this.db.intervals.where("end").above(start).and( interval => interval.start < end).delete()
                    //this.db.intervals.where("end").above(start).below(end).delete()
                    //this.db.intervals.where("end").above(start).delete()
                     this.db.intervals.add({start:mark_start, end:mark_end}).catch(e => {
                      console.log("can not add interval error:", e)
                    })
                    */
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                            _iterator.return();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }).then(function (result) {
                //
                // Transaction Committed
                //
            }).catch(function (error) {
                //
                // Transaction Failed
                //
            });
            return unloaded;
        }
    }]);
    return IntervalCache;
}();

/*

The way it should work

App may have one or more data sources registered.

Example:
   Current dataset (Dataset_Current) and let say yesterdays dataset (Dataset_Previous)
   Either of datasets may be shifted, to superimpose one dataset over another (less likely but also possible to shit individual curves of dataset)

To consumer (log plot engine for example), there should be no difference

However when data is requested from worker thread each dataset offset is specifiied:


SubscribeForRange {

  start: 1000.0,
  end: 1200.0

   'OPC1:channelA': {
        offset: 0.0;
  },

   'OPC2:channelB': {
        offset: 10.0;
    }

    'OPC3:channelC': {
         offset: -3.0;
     }
}

indexed are never altered in dataloader













//In general one will want
//When log object is created DataMonitor is created, in normal circumstances


//whenever log is scrolled message is passed









*/
/*
export class ChannelRef {
  datasource:DataCache
  channel:string
}
*/
var DataCache = function () {
    function DataCache(name) {
        classCallCheck(this, DataCache);

        this.db = new CurveCache(name);
    }

    createClass(DataCache, [{
        key: "add_realtime",
        value: function add_realtime(time, value) {
            //cc.add_value(index, value);
            //console.log(' got data ', array_data[0], ' ::: ', array_data[1], "latency:", (now - array_data[0][0]));
            //onsole.log(' >>>> got data ', time, ', ', value);
            this.db.add_value(time, value);
        }
    }]);
    return DataCache;
}();
/*
interface DataHandler {
  //callback interface
  on_data(channels:Array<ChannelRef>,
  start:number,
  end:number,
  data_buf:any)
}
*/
var DataMonitor = function () {
    function DataMonitor(data_manager) {
        classCallCheck(this, DataMonitor);

        this._channels = new Set();
        this._data_manager = data_manager;
    }

    createClass(DataMonitor, [{
        key: "monitorChannel",
        value: function monitorChannel(channel) {
            if (!this._channels.has(channel)) {
                this._channels.add(channel);
                this._data_manager._subscribe(channel);
            }
        }
    }, {
        key: "stopMonitorChannel",
        value: function stopMonitorChannel(channel) {
            if (!this._channels.has(channel)) {
                this._channels.add(channel);
                this._data_manager._unsubscribe(channel);
            }
        }
    }]);
    return DataMonitor;
}();
var DataManager = function () {
    function DataManager() {
        classCallCheck(this, DataManager);

        //monitors: Map<DataMonitor>;
        // set of named monitors that "remember" what channels are used for which
        // data interval
        this._monitors = new Map();
        // dictionary for channel to its relevant store
        this._channels_cache = new Map();
        this._subscriptions = new Map();
    }

    createClass(DataManager, [{
        key: "getMonitor",
        value: function getMonitor(name) {
            if (this._monitors.has(name)) {
                return this._monitors.get(name);
            }
            var new_monitor = new DataMonitor(this);
            this._monitors.set(name, new_monitor);
            return new_monitor;
        }
    }, {
        key: "getChannelCache",
        value: function getChannelCache(name) {
            if (this._channels_cache.has(name)) {
                return this._channels_cache.get(name);
            }
            var new_channel_cache = new DataCache(name);
            this._channels_cache.set(name, new_channel_cache);
            return new_channel_cache;
        }
    }, {
        key: "_subscribe",
        value: function _subscribe(channel) {
            // subscribe counts subscribtions and only if there was
            // 0 subscribtions to channel new subscribtion will
            // start, otherwise we only increment counter
            if (!this._subscriptions.has(channel)) {
                this._subscriptions.set(channel, 0);
            }
            var number_of_subscriptions = this._subscriptions.get(channel);
            var need_to_subscribe = number_of_subscriptions == 0;
            number_of_subscriptions += 1;
            this._subscriptions.set(channel, number_of_subscriptions);
            if (need_to_subscribe) {
                this.subscribe_to_channel(channel);
            }
        }
    }, {
        key: "_unsubscribe",
        value: function _unsubscribe(channel) {
            // unsubscribe decremenets counter
            if (!this._subscriptions.has(channel)) {
                this._subscriptions.set(channel, 0);
            }
            var number_of_subscriptions = this._subscriptions.get(channel);
            number_of_subscriptions -= 1;
            this._subscriptions.set(channel, number_of_subscriptions);
            if (number_of_subscriptions == 0) {
                this.unsubscribe_from_channel(channel);
            }
        }
    }]);
    return DataManager;
}();

var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};





function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var wampy = createCommonjsModule(function (module, exports) {
/**
 * Project: wampy.js
 *
 * https://github.com/KSDaemon/wampy.js
 *
 * A lightweight client-side implementation of
 * WAMP (The WebSocket Application Messaging Protocol v2)
 * http://wamp.ws
 *
 * Provides asynchronous RPC/PubSub over WebSocket.
 *
 * Copyright 2014 KSDaemon. Licensed under the MIT License.
 * See @license text at http://www.opensource.org/licenses/mit-license.php
 *
 */

'use strict';

// Module boilerplate to support browser globals and browserify and AMD.
(function (root, m) {
    if (typeof undefined === 'function' && undefined.amd) {
        // AMD. Register as an anonymous module.
        undefined(['exports'], m);
    } else if ('object' === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        module.exports = m();
    } else {
        // Browser globals
        root.Wampy = m();
    }
}(commonjsGlobal, function () {

    const WAMP_MSG_SPEC = {
            HELLO: 1,
            WELCOME: 2,
            ABORT: 3,
            CHALLENGE: 4,
            AUTHENTICATE: 5,
            GOODBYE: 6,
            ERROR: 8,
            PUBLISH: 16,
            PUBLISHED: 17,
            SUBSCRIBE: 32,
            SUBSCRIBED: 33,
            UNSUBSCRIBE: 34,
            UNSUBSCRIBED: 35,
            EVENT: 36,
            CALL: 48,
            CANCEL: 49,
            RESULT: 50,
            REGISTER: 64,
            REGISTERED: 65,
            UNREGISTER: 66,
            UNREGISTERED: 67,
            INVOCATION: 68,
            INTERRUPT: 69,
            YIELD: 70
        },

        WAMP_ERROR_MSG = {
            SUCCESS: {
                code: 0,
                description: 'Success!'
            },
            URI_ERROR: {
                code: 1,
                description: 'Topic URI doesn\'t meet requirements!'
            },
            NO_BROKER: {
                code: 2,
                description: 'Server doesn\'t provide broker role!'
            },
            NO_CALLBACK_SPEC: {
                code: 3,
                description: 'No required callback function specified!'
            },
            INVALID_PARAM: {
                code: 4,
                description: 'Invalid parameter(s) specified!'
            },
            NON_EXIST_UNSUBSCRIBE: {
                code: 7,
                description: 'Trying to unsubscribe from non existent subscription!'
            },
            NO_DEALER: {
                code: 12,
                description: 'Server doesn\'t provide dealer role!'
            },
            RPC_ALREADY_REGISTERED: {
                code: 15,
                description: 'RPC already registered!'
            },
            NON_EXIST_RPC_UNREG: {
                code: 17,
                description: 'Received rpc unregistration for non existent rpc!'
            },
            NON_EXIST_RPC_INVOCATION: {
                code: 19,
                description: 'Received invocation for non existent rpc!'
            },
            NON_EXIST_RPC_REQ_ID: {
                code: 20,
                description: 'No RPC calls in action with specified request ID!'
            },
            NO_REALM: {
                code: 21,
                description: 'No realm specified!'
            },
            NO_WS_OR_URL: {
                code: 22,
                description: 'No websocket provided or URL specified is incorrect!'
            },
            NO_CRA_CB_OR_ID: {
                code: 23,
                description: 'No onChallenge callback or authid was provided for authentication!'
            },
            CRA_EXCEPTION: {
                code: 24,
                description: 'Exception raised during CRA challenge processing'
            }
        },

        isNode = (typeof process === 'object' && Object.prototype.toString.call(process) === '[object process]');

    function getServerUrlBrowser (url) {
        let scheme, port;

        if (/^ws(s)?:\/\//.test(url)) {   // ws scheme is specified
            return url;
        }

        scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

        if (!url) {
            port = window.location.port !== '' ? ':' + window.location.port : '';
            return scheme + window.location.hostname + port + '/ws';
        } else if (url[0] === '/') {    // just path on current server
            port = window.location.port !== '' ? ':' + window.location.port : '';
            return scheme + window.location.hostname + port + url;
        } else {    // domain
            return scheme + url;
        }
    }

    function getServerUrlNode (url) {
        if (/^ws(s)?:\/\//.test(url)) {   // ws scheme is specified
            return url;
        } else {
            return null;
        }
    }

    function getWebSocket (url, protocols, ws) {
        const parsedUrl = isNode ? getServerUrlNode(url) : getServerUrlBrowser(url);

        if (!parsedUrl) {
            return null;
        }

        if (ws) {   // User provided webSocket class
            return new ws(parsedUrl, protocols);
        } else if (isNode) {    // we're in node, but no webSocket provided
            return null;
        } else if ('WebSocket' in window) {
            // Chrome, MSIE, newer Firefox
            return new window.WebSocket(parsedUrl, protocols);
        } else if ('MozWebSocket' in window) {
            // older versions of Firefox
            return new window.MozWebSocket(parsedUrl, protocols);
        }

        return null;
    }

    /**
     * WAMP Client Class
     */
    class Wampy {

        /**
         * Wampy constructor
         * @param {string} url
         * @param {Object} options
         */
        constructor (url, options) {

            /**
             * Wampy version
             * @type {string}
             * @private
             */
            this.version = 'v4.1.0';

            /**
             * WS Url
             * @type {string}
             * @private
             */
            this._url = (typeof url === 'string') ? url : null;

            /**
             * WS protocols
             * @type {Array}
             * @private
             */
            this._protocols = ['wamp.2.json'];

            /**
             * WAMP features, supported by Wampy
             * @type {object}
             * @private
             */
            this._wamp_features = {
                agent: 'Wampy.js ' + this.version,
                roles: {
                    publisher: {
                        features: {
                            subscriber_blackwhite_listing: true,
                            publisher_exclusion: true,
                            publisher_identification: true
                        }
                    },
                    subscriber: {},
                    caller: {
                        features: {
                            caller_identification: true,
                            progressive_call_results: true,
                            call_canceling: true,
                            call_timeout: true
                        }
                    },
                    callee: {
                        features: {
                            caller_identification: true
                        }
                    }
                }
            };

            /**
             * Internal cache for object lifetime
             * @type {Object}
             * @private
             */
            this._cache = {
                /**
                 * WAMP Session ID
                 * @type {string}
                 */
                sessionId: null,

                /**
                 * Server WAMP roles and features
                 */
                server_wamp_features: { roles: {} },

                /**
                 * Are we in state of saying goodbye
                 * @type {boolean}
                 */
                isSayingGoodbye: false,

                /**
                 * Status of last operation
                 */
                opStatus: { code: 0, description: 'Success!', reqId: 0 },

                /**
                 * Timer for reconnection
                 * @type {null}
                 */
                timer: null,

                /**
                 * Reconnection attempts
                 * @type {number}
                 */
                reconnectingAttempts: 0
            };

            /**
             * WebSocket object
             * @type {Object}
             * @private
             */
            this._ws = null;

            /**
             * Internal queue for websocket requests, for case of disconnect
             * @type {Array}
             * @private
             */
            this._wsQueue = [];

            /**
             * Internal queue for wamp requests
             * @type {object}
             * @private
             */
            this._requests = {};

            /**
             * Stored RPC
             * @type {object}
             * @private
             */
            this._calls = {};

            /**
             * Stored Pub/Sub
             * @type {object}
             * @private
             */
            this._subscriptions = {};

            /**
             * Stored Pub/Sub topics
             * @type {Array}
             * @private
             */
            this._subsTopics = new Set();

            /**
             * Stored RPC Registrations
             * @type {object}
             * @private
             */
            this._rpcRegs = {};

            /**
             * Stored RPC names
             * @type {Array}
             * @private
             */
            this._rpcNames = new Set();

            /**
             * Options hash-table
             * @type {Object}
             * @private
             */
            this._options = {
                /**
                 * Logging
                 * @type {boolean}
                 */
                debug: false,

                /**
                 * Reconnecting flag
                 * @type {boolean}
                 */
                autoReconnect: true,

                /**
                 * Reconnecting interval (in ms)
                 * @type {number}
                 */
                reconnectInterval: 2 * 1000,

                /**
                 * Maximum reconnection retries
                 * @type {number}
                 */
                maxRetries: 25,

                /**
                 * Message serializer
                 * @type {string}
                 */
                transportEncoding: 'json',

                /**
                 * WAMP Realm to join
                 * @type {string}
                 */
                realm: null,

                /**
                 * Custom attributes to send to router on hello
                 * @type {object}
                 */
                helloCustomDetails: null,

                /**
                 * Authentication id to use in challenge
                 * @type {string}
                 */
                authid: null,

                /**
                 * Supported authentication methods
                 * @type {array}
                 */
                authmethods: [],

                /**
                 * onChallenge callback
                 * @type {function}
                 */
                onChallenge: null,

                /**
                 * onConnect callback
                 * @type {function}
                 */
                onConnect: null,

                /**
                 * onClose callback
                 * @type {function}
                 */
                onClose: null,

                /**
                 * onError callback
                 * @type {function}
                 */
                onError: null,

                /**
                 * onReconnect callback
                 * @type {function}
                 */
                onReconnect: null,

                /**
                 * onReconnectSuccess callback
                 * @type {function}
                 */
                onReconnectSuccess: null,

                /**
                 * User provided WebSocket class
                 * @type {function}
                 */
                ws: null,

                /**
                 * User provided msgpack class
                 * @type {function}
                 */
                msgpackCoder: null
            };

            if (this._isPlainObject(options)) {
                this._options = this._merge(this._options, options);
            } else if (this._isPlainObject(url)) {
                this._options = this._merge(this._options, url);
            }

            this.connect();
        }

        /* Internal utils methods */
        /**
         * Internal logger
         * @private
         */
        _log () {
            if (this._options.debug) {
                console.log(arguments);
            }
        }

        /**
         * Get the new unique request id
         * @returns {number}
         * @private
         */
        _getReqId () {
            let reqId;
            const max = 2 ^ 53;

            do {
                reqId = Math.floor(Math.random() * max);
            } while (reqId in this._requests);

            return reqId;
        }

        /**
         * Merge argument objects into one
         * @returns {Object}
         * @private
         */
        _merge () {
            const obj = {}, l = arguments.length;
            let i, attr;

            for (i = 0; i < l; i++) {
                for (attr in arguments[i]) {
                    obj[attr] = arguments[i][attr];
                }
            }

            return obj;
        }

        /**
         * Check if value is array
         * @param obj
         * @returns {boolean}
         * @private
         */
        _isArray (obj) {
            return (!!obj) && (Array.isArray(obj));
        }

        /**
         * Check if value is object literal
         * @param obj
         * @returns {boolean}
         * @private
         */
        _isPlainObject (obj) {
            return (!!obj) && (obj.constructor === Object);
        }

        /**
         * Fix websocket protocols based on options
         * @private
         */
        _setWsProtocols () {
            if (this._options.msgpackCoder) {
                if (this._options.transportEncoding === 'msgpack') {
                    this._protocols = ['wamp.2.msgpack', 'wamp.2.json'];
                } else {
                    this._protocols = ['wamp.2.json', 'wamp.2.msgpack'];
                }
            }
        }

        /**
         * Prerequisite checks for any wampy api call
         * @param {string} topicURI
         * @param {string} role
         * @param {object} callbacks
         * @returns {boolean}
         * @private
         */
        _preReqChecks (topicURI, role, callbacks) {
            let flag = true;

            if (this._cache.sessionId && !this._cache.server_wamp_features.roles[role]) {
                this._cache.opStatus = WAMP_ERROR_MSG['NO_' + role.toUpperCase()];
                flag = false;
            }

            if (topicURI && !this._validateURI(topicURI)) {
                this._cache.opStatus = WAMP_ERROR_MSG.URI_ERROR;
                flag = false;
            }

            if (flag) {
                return true;
            }

            if (this._isPlainObject(callbacks) && callbacks.onError) {
                callbacks.onError(this._cache.opStatus.description);
            }

            return false;
        }

        /**
         * Validate uri
         * @param {string} uri
         * @returns {boolean}
         * @private
         */
        _validateURI (uri) {
            const re = /^([0-9a-zA-Z_]{2,}\.)*([0-9a-zA-Z_]{2,})$/;
            return !(!re.test(uri) || uri.indexOf('wamp') === 0);
        }

        /**
         * Encode WAMP message
         * @param {Array} msg
         * @returns {*}
         * @private
         */
        _encode (msg) {

            if (this._options.transportEncoding === 'msgpack' && this._options.msgpackCoder) {
                try {
                    return this._options.msgpackCoder.encode(msg);
                } catch (e) {
                    throw new Error('[wampy] msgpack encode exception!');
                }
            } else {
                return JSON.stringify(msg);
            }
        }

        /**
         * Decode WAMP message
         * @param  msg
         * @returns {array}
         * @private
         */
        _decode (msg) {
            if (this._options.transportEncoding === 'msgpack' && this._options.msgpackCoder) {
                try {
                    return this._options.msgpackCoder.decode(new Uint8Array(msg));
                } catch (e) {
                    throw new Error('[wampy] msgpack decode exception!');
                }
            } else {
                return JSON.parse(msg);
            }
        }

        /**
         * Send encoded message to server
         * @param {Array} msg
         * @private
         */
        _send (msg) {
            if (msg) {
                this._wsQueue.push(this._encode(msg));
            }

            if (this._ws && this._ws.readyState === 1 && this._cache.sessionId) {
                while (this._wsQueue.length) {
                    this._ws.send(this._wsQueue.shift());
                }
            }
        }

        /**
         * Reset internal state and cache
         * @private
         */
        _resetState () {
            this._wsQueue = [];
            this._subscriptions = {};
            this._subsTopics = new Set();
            this._requests = {};
            this._calls = {};
            this._rpcRegs = {};
            this._rpcNames = new Set();

            // Just keep attrs that are have to be present
            this._cache = {
                reconnectingAttempts: 0
            };
        }

        /**
         * Initialize internal websocket callbacks
         * @private
         */
        _initWsCallbacks () {
            if (this._ws) {
                this._ws.onopen = () => { this._wsOnOpen(); };
                this._ws.onclose = event => { this._wsOnClose(event); };
                this._ws.onmessage = event => { this._wsOnMessage(event); };
                this._ws.onerror = error => { this._wsOnError(error); };
            }
        }

        _wsOnOpen () {
            const options = this._merge(this._options.helloCustomDetails, this._wamp_features);

            if (this._options.authid) {
                options.authmethods = this._options._authmethods;
                options.authid = this._options.authid;
            }

            this._log('[wampy] websocket connected');

            if (this._ws.protocol) {
                this._options.transportEncoding = this._ws.protocol.split('.')[2];
            }

            if (this._options.transportEncoding === 'msgpack') {
                this._ws.binaryType = 'arraybuffer';
            }

            // WAMP SPEC: [HELLO, Realm|uri, Details|dict]
            // Sending directly 'cause it's a hello msg and no sessionId check is needed
            this._ws.send(this._encode([WAMP_MSG_SPEC.HELLO, this._options.realm, options]));
        }

        _wsOnClose (event) {
            const root = isNode ? commonjsGlobal : window;
            this._log('[wampy] websocket disconnected. Info: ', event);

            // Automatic reconnection
            if ((this._cache.sessionId || this._cache.reconnectingAttempts) &&
                this._options.autoReconnect && this._cache.reconnectingAttempts < this._options.maxRetries &&
                !this._cache.isSayingGoodbye) {
                this._cache.sessionId = null;
                this._cache.timer = root.setTimeout(
                    () => { this._wsReconnect(); },
                    this._options.reconnectInterval
                );
            } else {
                // No reconnection needed or reached max retries count
                if (this._options.onClose) {
                    this._options.onClose();
                }

                this._resetState();
                this._ws = null;
            }
        }

        _wsOnMessage (event) {
            let data, id, i, msg, p;

            this._log('[wampy] websocket message received', event.data);

            data = this._decode(event.data);

            switch (data[0]) {
                case WAMP_MSG_SPEC.WELCOME:
                    // WAMP SPEC: [WELCOME, Session|id, Details|dict]

                    this._cache.sessionId = data[1];
                    this._cache.server_wamp_features = data[2];

                    if (this._cache.reconnectingAttempts) {
                        // There was reconnection

                        this._cache.reconnectingAttempts = 0;

                        if (this._options.onReconnectSuccess) {
                            this._options.onReconnectSuccess();
                        }

                        // Let's renew all previous state
                        this._renewSubscriptions();
                        this._renewRegistrations();

                    } else {
                        // Firing onConnect event on real connection to WAMP server
                        if (this._options.onConnect) {
                            this._options.onConnect();
                        }
                    }

                    // Send local queue if there is something out there
                    this._send();

                    break;
                case WAMP_MSG_SPEC.ABORT:
                    // WAMP SPEC: [ABORT, Details|dict, Reason|uri]
                    if (this._options.onError) {
                        this._options.onError(data[1].message ? data[1].message : data[2]);
                    }
                    this._ws.close();
                    break;
                case WAMP_MSG_SPEC.CHALLENGE:
                    // WAMP SPEC: [CHALLENGE, AuthMethod|string, Extra|dict]

                    if (this._options.authid && typeof this._options.onChallenge === 'function') {

                        p = new Promise((resolve, reject) => {
                            resolve(this._options.onChallenge(data[1], data[2]));
                        });

                        p.then((key) => {

                            // Sending directly 'cause it's a challenge msg and no sessionId check is needed
                            this._ws.send(this._encode([WAMP_MSG_SPEC.AUTHENTICATE, key, {}]));

                        }).catch(e => {
                            this._ws.send(this._encode([
                                WAMP_MSG_SPEC.ABORT,
                                { message: 'Exception in onChallenge handler raised!' },
                                'wamp.error.cannot_authenticate'
                            ]));
                            if (this._options.onError) {
                                this._options.onError(WAMP_ERROR_MSG.CRA_EXCEPTION.description);
                            }
                            this._ws.close();
                            this._cache.opStatus = WAMP_ERROR_MSG.CRA_EXCEPTION;
                        });

                    } else {

                        this._ws.send(this._encode([
                            WAMP_MSG_SPEC.ABORT,
                            { message: WAMP_ERROR_MSG.NO_CRA_CB_OR_ID.description },
                            'wamp.error.cannot_authenticate'
                        ]));
                        if (this._options.onError) {
                            this._options.onError(WAMP_ERROR_MSG.NO_CRA_CB_OR_ID.description);
                        }
                        this._ws.close();
                        this._cache.opStatus = WAMP_ERROR_MSG.NO_CRA_CB_OR_ID;

                    }
                    break;
                case WAMP_MSG_SPEC.GOODBYE:
                    // WAMP SPEC: [GOODBYE, Details|dict, Reason|uri]
                    if (!this._cache.isSayingGoodbye) {    // get goodbye, initiated by server
                        this._cache.isSayingGoodbye = true;
                        this._send([WAMP_MSG_SPEC.GOODBYE, {}, 'wamp.error.goodbye_and_out']);
                    }
                    this._cache.sessionId = null;
                    this._ws.close();
                    break;
                case WAMP_MSG_SPEC.ERROR:
                    // WAMP SPEC: [ERROR, REQUEST.Type|int, REQUEST.Request|id, Details|dict,
                    //             Error|uri, (Arguments|list, ArgumentsKw|dict)]
                    switch (data[1]) {
                        case WAMP_MSG_SPEC.SUBSCRIBE:
                        case WAMP_MSG_SPEC.UNSUBSCRIBE:
                        case WAMP_MSG_SPEC.PUBLISH:
                        case WAMP_MSG_SPEC.REGISTER:
                        case WAMP_MSG_SPEC.UNREGISTER:

                            this._requests[data[2]] && this._requests[data[2]].callbacks.onError &&
                            this._requests[data[2]].callbacks.onError(data[4], data[3], data[5], data[6]);
                            delete this._requests[data[2]];

                            break;
                        case WAMP_MSG_SPEC.INVOCATION:
                            break;
                        case WAMP_MSG_SPEC.CALL:

                            // WAMP SPEC: [ERROR, CALL, CALL.Request|id, Details|dict,
                            //             Error|uri, Arguments|list, ArgumentsKw|dict]
                            this._calls[data[2]] && this._calls[data[2]].onError &&
                            this._calls[data[2]].onError(data[4], data[3], data[5], data[6]);
                            delete this._calls[data[2]];

                            break;
                        default:
                            this._log('[wampy] Received non-compliant WAMP ERROR message');
                            break;
                    }
                    break;
                case WAMP_MSG_SPEC.SUBSCRIBED:
                    // WAMP SPEC: [SUBSCRIBED, SUBSCRIBE.Request|id, Subscription|id]
                    if (this._requests[data[1]]) {
                        this._subscriptions[this._requests[data[1]].topic] = this._subscriptions[data[2]] = {
                            id: data[2],
                            callbacks: [this._requests[data[1]].callbacks.onEvent]
                        };

                        this._subsTopics.add(this._requests[data[1]].topic);

                        if (this._requests[data[1]].callbacks.onSuccess) {
                            this._requests[data[1]].callbacks.onSuccess();
                        }

                        delete this._requests[data[1]];

                    }
                    break;
                case WAMP_MSG_SPEC.UNSUBSCRIBED:
                    // WAMP SPEC: [UNSUBSCRIBED, UNSUBSCRIBE.Request|id]
                    if (this._requests[data[1]]) {
                        id = this._subscriptions[this._requests[data[1]].topic].id;
                        delete this._subscriptions[this._requests[data[1]].topic];
                        delete this._subscriptions[id];

                        if (this._subsTopics.has(this._requests[data[1]].topic)) {
                            this._subsTopics.delete(this._requests[data[1]].topic);
                        }

                        if (this._requests[data[1]].callbacks.onSuccess) {
                            this._requests[data[1]].callbacks.onSuccess();
                        }

                        delete this._requests[data[1]];
                    }
                    break;
                case WAMP_MSG_SPEC.PUBLISHED:
                    // WAMP SPEC: [PUBLISHED, PUBLISH.Request|id, Publication|id]
                    if (this._requests[data[1]]) {
                        if (this._requests[data[1]].callbacks && this._requests[data[1]].callbacks.onSuccess) {
                            this._requests[data[1]].callbacks.onSuccess();
                        }

                        delete this._requests[data[1]];

                    }
                    break;
                case WAMP_MSG_SPEC.EVENT:
                    if (this._subscriptions[data[1]]) {

                        // WAMP SPEC: [EVENT, SUBSCRIBED.Subscription|id, PUBLISHED.Publication|id,
                        //             Details|dict, PUBLISH.Arguments|list, PUBLISH.ArgumentKw|dict]

                        i = this._subscriptions[data[1]].callbacks.length;
                        while (i--) {
                            this._subscriptions[data[1]].callbacks[i](data[4], data[5]);
                        }

                    }
                    break;
                case WAMP_MSG_SPEC.RESULT:
                    if (this._calls[data[1]]) {

                        // WAMP SPEC: [RESULT, CALL.Request|id, Details|dict,
                        //             YIELD.Arguments|list, YIELD.ArgumentsKw|dict]

                        this._calls[data[1]].onSuccess(data[3], data[4]);
                        if (!(data[2].progress && data[2].progress === true)) {
                            // We receive final result (progressive or not)
                            delete this._calls[data[1]];
                        }

                    }
                    break;
                // case WAMP_MSG_SPEC.REGISTER:
                //     // WAMP SPEC:
                //     break;
                case WAMP_MSG_SPEC.REGISTERED:
                    // WAMP SPEC: [REGISTERED, REGISTER.Request|id, Registration|id]
                    if (this._requests[data[1]]) {
                        this._rpcRegs[this._requests[data[1]].topic] = this._rpcRegs[data[2]] = {
                            id: data[2],
                            callbacks: [this._requests[data[1]].callbacks.rpc]
                        };

                        this._rpcNames.add(this._requests[data[1]].topic);

                        if (this._requests[data[1]].callbacks && this._requests[data[1]].callbacks.onSuccess) {
                            this._requests[data[1]].callbacks.onSuccess();
                        }

                        delete this._requests[data[1]];

                    }
                    break;
                // case WAMP_MSG_SPEC.UNREGISTER:
                //     // WAMP SPEC:
                //     break;
                case WAMP_MSG_SPEC.UNREGISTERED:
                    // WAMP SPEC: [UNREGISTERED, UNREGISTER.Request|id]
                    if (this._requests[data[1]]) {
                        id = this._rpcRegs[this._requests[data[1]].topic].id;
                        delete this._rpcRegs[this._requests[data[1]].topic];
                        delete this._rpcRegs[id];

                        if (this._rpcNames.has(this._requests[data[1]].topic)) {
                            this._rpcNames.delete(this._requests[data[1]].topic);
                        }

                        if (this._requests[data[1]].callbacks && this._requests[data[1]].callbacks.onSuccess) {
                            this._requests[data[1]].callbacks.onSuccess();
                        }

                        delete this._requests[data[1]];
                    }
                    break;
                case WAMP_MSG_SPEC.INVOCATION:
                    if (this._rpcRegs[data[2]]) {

                        // WAMP SPEC: [INVOCATION, Request|id, REGISTERED.Registration|id,
                        //             Details|dict, CALL.Arguments|list, CALL.ArgumentsKw|dict]

                        p = new Promise((resolve, reject) => {
                            resolve(this._rpcRegs[data[2]].callbacks[0](data[4], data[5], data[3]));
                        });

                        p.then((results) => {
                            // WAMP SPEC: [YIELD, INVOCATION.Request|id, Options|dict, (Arguments|list, ArgumentsKw|dict)]
                            msg = [WAMP_MSG_SPEC.YIELD, data[1], {}];
                            if (this._isArray(results)) {
                                // Options
                                if (this._isPlainObject(results[0])) {
                                    msg[2] = results[0];
                                }

                                if (this._isArray(results[1])) {
                                    msg.push(results[1]);
                                } else if (typeof (results[1]) !== 'undefined') {
                                    msg.push([results[1]]);
                                }

                                if (this._isPlainObject(results[2])) {
                                    if (msg.length === 3) {
                                        msg.push(null);
                                    }
                                    msg.push(results[2]);
                                }
                            } else {
                                msg = [WAMP_MSG_SPEC.YIELD, data[1], {}];
                            }
                            this._send(msg);

                        }).catch(e => {
                            let msg = [WAMP_MSG_SPEC.ERROR, WAMP_MSG_SPEC.INVOCATION,
                                data[1], e.details || {}, e.uri || 'wamp.error.invocation_exception'];

                            if (e.argsList && this._isArray(e.argsList)) {
                                msg.push(e.argsList);
                            }

                            if (e.argsDict && this._isPlainObject(e.argsDict)) {
                                if (msg.length === 5) {
                                    msg.push(null);
                                }
                                msg.push(e.argsDict);
                            }
                            this._send(msg);
                        });

                    } else {
                        // WAMP SPEC: [ERROR, INVOCATION, INVOCATION.Request|id, Details|dict, Error|uri]
                        this._send([WAMP_MSG_SPEC.ERROR, WAMP_MSG_SPEC.INVOCATION,
                            data[1], {}, 'wamp.error.no_such_procedure']);
                        this._cache.opStatus = WAMP_ERROR_MSG.NON_EXIST_RPC_INVOCATION;
                    }

                    break;
                // case WAMP_MSG_SPEC.INTERRUPT:
                //     // WAMP SPEC:
                //     break;
                // case WAMP_MSG_SPEC.YIELD:
                //     // WAMP SPEC:
                //     break;
                default:
                    this._log('[wampy] Received non-compliant WAMP message');
                    break;
            }
        }

        _wsOnError (error) {
            this._log('[wampy] websocket error');

            if (this._options.onError) {
                this._options.onError(error);
            }
        }

        _wsReconnect () {
            this._log('[wampy] websocket reconnecting...');

            if (this._options.onReconnect) {
                this._options.onReconnect();
            }

            this._cache.reconnectingAttempts++;
            this._ws = getWebSocket(this._url, this._protocols, this._options.ws);
            this._initWsCallbacks();
        }

        _renewSubscriptions () {
            let i;
            const subs = this._subscriptions,
                st = this._subsTopics;

            this._subscriptions = {};
            this._subsTopics = new Set();

            for (let topic of st) {
                i = subs[topic].callbacks.length;
                while (i--) {
                    this.subscribe(topic, subs[topic].callbacks[i]);
                }
            }
        }

        _renewRegistrations () {
            const rpcs = this._rpcRegs,
                rn = this._rpcNames;

            this._rpcRegs = {};
            this._rpcNames = new Set();

            for (let rpcName of rn) {
                this.register(rpcName, { rpc: rpcs[rpcName].callbacks[0] });
            }
        }

        /* Wampy public API */

        /**
         * Get or set Wampy options
         *
         * To get options - call without parameters
         * To set options - pass hash-table with options values
         *
         * @param {object} opts
         * @returns {*}
         */
        options (opts) {
            if (typeof (opts) === 'undefined') {
                return this._options;
            } else if (this._isPlainObject(opts)) {
                this._options = this._merge(this._options, opts);
                return this;
            }
        }

        /**
         * Get the status of last operation
         *
         * @returns {code, description}
         *      code: 0 - if operation was successful
         *      code > 0 - if error occurred
         *      description contains details about error
         *      reqId: last send request ID
         */
        getOpStatus () {
            return this._cache.opStatus;
        }

        /**
         * Get the WAMP Session ID
         *
         * @returns {string} Session ID
         */
        getSessionId () {
            return this._cache.sessionId;
        }

        /**
         * Connect to server
         * @param {string} url New url (optional)
         * @returns {Wampy}
         */
        connect (url) {
            if (url) {
                this._url = url;
            }

            if (this._options.realm) {

                const authp = (this._options.authid ? 1 : 0) +
                    ((this._isArray(this._options.authmethods) && this._options.authmethods.length) ? 1 : 0) +
                    (typeof this._options.onChallenge === 'function' ? 1 : 0);

                if (authp > 0 && authp < 3) {
                    this._cache.opStatus = WAMP_ERROR_MSG.NO_CRA_CB_OR_ID;
                    return this;
                }

                this._setWsProtocols();
                this._ws = getWebSocket(this._url, this._protocols, this._options.ws);
                if (!this._ws) {
                    this._cache.opStatus = WAMP_ERROR_MSG.NO_WS_OR_URL;
                    return this;
                }
                this._initWsCallbacks();

            } else {
                this._cache.opStatus = WAMP_ERROR_MSG.NO_REALM;
            }

            return this;
        }

        /**
         * Disconnect from server
         * @returns {Wampy}
         */
        disconnect () {
            if (this._cache.sessionId) {
                // need to send goodbye message to server
                this._cache.isSayingGoodbye = true;
                this._send([WAMP_MSG_SPEC.GOODBYE, {}, 'wamp.error.system_shutdown']);
            } else if (this._ws) {
                this._ws.close();
            }

            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;

            return this;
        }

        /**
         * Abort WAMP session establishment
         *
         * @returns {Wampy}
         */
        abort () {

            if (!this._cache.sessionId && this._ws.readyState === 1) {
                this._send([WAMP_MSG_SPEC.ABORT, {}, 'wamp.error.abort']);
                this._cache.sessionId = null;
            }

            this._ws.close();
            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;

            return this;
        }

        /**
         * Subscribe to a topic on a broker
         *
         * @param {string} topicURI
         * @param {function|object} callbacks - if it is a function - it will be treated as published event callback
         *                          or it can be hash table of callbacks:
         *                          { onSuccess: will be called when subscribe would be confirmed
         *                            onError: will be called if subscribe would be aborted
         *                            onEvent: will be called on receiving published event }
         *
         * @returns {Wampy}
         */
        subscribe (topicURI, callbacks) {
            let reqId;

            if (!this._preReqChecks(topicURI, 'broker', callbacks)) {
                return this;
            }

            if (typeof callbacks === 'function') {
                callbacks = { onEvent: callbacks };
            } else if (!this._isPlainObject(callbacks) || typeof (callbacks.onEvent) === 'undefined') {
                this._cache.opStatus = WAMP_ERROR_MSG.NO_CALLBACK_SPEC;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

                return this;
            }

            if (!this._subscriptions[topicURI] || !this._subscriptions[topicURI].callbacks.length) {
                // no such subscription or processing unsubscribing

                reqId = this._getReqId();

                this._requests[reqId] = {
                    topic: topicURI,
                    callbacks: callbacks
                };

                // WAMP SPEC: [SUBSCRIBE, Request|id, Options|dict, Topic|uri]
                this._send([WAMP_MSG_SPEC.SUBSCRIBE, reqId, {}, topicURI]);

            } else {    // already have subscription to this topic
                // There is no such callback yet
                if (this._subscriptions[topicURI].callbacks.indexOf(callbacks.onEvent) < 0) {
                    this._subscriptions[topicURI].callbacks.push(callbacks.onEvent);
                }

                if (callbacks.onSuccess) {
                    callbacks.onSuccess();
                }
            }

            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
            this._cache.opStatus.reqId = reqId;
            return this;
        }

        /**
         * Unsubscribe from topic
         * @param {string} topicURI
         * @param {function|object} callbacks - if it is a function - it will be treated as
         *                          published event callback to remove or it can be hash table of callbacks:
         *                          { onSuccess: will be called when unsubscribe would be confirmed
         *                            onError: will be called if unsubscribe would be aborted
         *                            onEvent: published event callback to remove }
         * @returns {Wampy}
         */
        unsubscribe (topicURI, callbacks) {
            let reqId, i = -1;

            if (!this._preReqChecks(null, 'broker', callbacks)) {
                return this;
            }

            if (this._subscriptions[topicURI]) {

                reqId = this._getReqId();

                if (typeof (callbacks) === 'undefined') {
                    this._subscriptions[topicURI].callbacks = [];
                    callbacks = {};
                } else if (typeof callbacks === 'function') {
                    i = this._subscriptions[topicURI].callbacks.indexOf(callbacks);
                    callbacks = {};
                } else if (callbacks.onEvent && typeof callbacks.onEvent === 'function') {
                    i = this._subscriptions[topicURI].callbacks.indexOf(callbacks.onEvent);
                } else {
                    this._subscriptions[topicURI].callbacks = [];
                }

                if (i >= 0) {
                    this._subscriptions[topicURI].callbacks.splice(i, 1);
                }

                if (this._subscriptions[topicURI].callbacks.length) {
                    // There are another callbacks for this topic
                    this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
                    return this;
                }

                this._requests[reqId] = {
                    topic: topicURI,
                    callbacks: callbacks
                };

                // WAMP_SPEC: [UNSUBSCRIBE, Request|id, SUBSCRIBED.Subscription|id]
                this._send([WAMP_MSG_SPEC.UNSUBSCRIBE, reqId, this._subscriptions[topicURI].id]);

            } else {
                this._cache.opStatus = WAMP_ERROR_MSG.NON_EXIST_UNSUBSCRIBE;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

                return this;
            }

            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
            this._cache.opStatus.reqId = reqId;
            return this;
        }

        /**
         * Publish a event to topic
         * @param {string} topicURI
         * @param {string|number|Array|object} payload - optional parameter.
         * @param {object} callbacks - optional hash table of callbacks:
         *                          { onSuccess: will be called when publishing would be confirmed
         *                            onError: will be called if publishing would be aborted }
         * @param {object} advancedOptions - optional parameter. Must include any or all of the options:
         *                          { exclude: integer|array WAMP session id(s) that won't receive a published event,
         *                                      even though they may be subscribed
         *                            exclude_authid: string|array Authentication id(s) that won't receive
         *                                      a published event, even though they may be subscribed
         *                            exclude_authrole: string|array Authentication role(s) that won't receive
         *                                      a published event, even though they may be subscribed
         *                            eligible: integer|array WAMP session id(s) that are allowed
         *                                      to receive a published event
         *                            eligible_authid: string|array Authentication id(s) that are allowed
         *                                      to receive a published event
         *                            eligible_authrole: string|array Authentication role(s) that are allowed
         *                                      to receive a published event
         *                            exclude_me: bool flag of receiving publishing event by initiator
         *                            disclose_me: bool flag of disclosure of publisher identity (its WAMP session ID)
         *                                      to receivers of a published event }
         * @returns {Wampy}
         */
        publish (topicURI, payload, callbacks, advancedOptions) {
            let reqId, msg, err = false;
            const options = {};

            if (!this._preReqChecks(topicURI, 'broker', callbacks)) {
                return this;
            }

            if (this._isPlainObject(callbacks)) {
                options.acknowledge = true;
            }

            if (typeof (advancedOptions) !== 'undefined') {

                if (this._isPlainObject(advancedOptions)) {
                    if (advancedOptions.exclude) {
                        if (this._isArray(advancedOptions.exclude) && advancedOptions.exclude.length) {
                            options.exclude = advancedOptions.exclude;
                        } else if (typeof advancedOptions.exclude === 'number') {
                            options.exclude = [advancedOptions.exclude];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.exclude_authid) {
                        if (this._isArray(advancedOptions.exclude_authid) && advancedOptions.exclude_authid.length) {
                            options.exclude_authid = advancedOptions.exclude_authid;
                        } else if (typeof advancedOptions.exclude_authid === 'string') {
                            options.exclude_authid = [advancedOptions.exclude_authid];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.exclude_authrole) {
                        if (this._isArray(advancedOptions.exclude_authrole) && advancedOptions.exclude_authrole.length) {
                            options.exclude_authrole = advancedOptions.exclude_authrole;
                        } else if (typeof advancedOptions.exclude_authrole === 'string') {
                            options.exclude_authrole = [advancedOptions.exclude_authrole];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.eligible) {
                        if (this._isArray(advancedOptions.eligible) && advancedOptions.eligible.length) {
                            options.eligible = advancedOptions.eligible;
                        } else if (typeof advancedOptions.eligible === 'number') {
                            options.eligible = [advancedOptions.eligible];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.eligible_authid) {
                        if (this._isArray(advancedOptions.eligible_authid) && advancedOptions.eligible_authid.length) {
                            options.eligible_authid = advancedOptions.eligible_authid;
                        } else if (typeof advancedOptions.eligible_authid === 'string') {
                            options.eligible_authid = [advancedOptions.eligible_authid];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.eligible_authrole) {
                        if (this._isArray(advancedOptions.eligible_authrole) && advancedOptions.eligible_authrole.length) {
                            options.eligible_authrole = advancedOptions.eligible_authrole;
                        } else if (typeof advancedOptions.eligible_authrole === 'string') {
                            options.eligible_authrole = [advancedOptions.eligible_authrole];
                        } else {
                            err = true;
                        }
                    }

                    if (advancedOptions.hasOwnProperty('exclude_me')) {
                        options.exclude_me = advancedOptions.exclude_me !== false;
                    }

                    if (advancedOptions.hasOwnProperty('disclose_me')) {
                        options.disclose_me = advancedOptions.disclose_me === true;
                    }

                } else {
                    err = true;
                }

                if (err) {
                    this._cache.opStatus = WAMP_ERROR_MSG.INVALID_PARAM;

                    if (this._isPlainObject(callbacks) && callbacks.onError) {
                        callbacks.onError(this._cache.opStatus.description);
                    }

                    return this;
                }
            }

            reqId = this._getReqId();

            switch (arguments.length) {
                case 1:
                    // WAMP_SPEC: [PUBLISH, Request|id, Options|dict, Topic|uri]
                    msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI];
                    break;
                case 2:
                    // WAMP_SPEC: [PUBLISH, Request|id, Options|dict, Topic|uri, Arguments|list (, ArgumentsKw|dict)]
                    if (this._isArray(payload)) {
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, payload];
                    } else if (this._isPlainObject(payload)) {
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, [], payload];
                    } else {    // assume it's a single value
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, [payload]];
                    }
                    break;
                default:
                    this._requests[reqId] = {
                        topic: topicURI,
                        callbacks: callbacks
                    };

                    // WAMP_SPEC: [PUBLISH, Request|id, Options|dict, Topic|uri, Arguments|list (, ArgumentsKw|dict)]
                    if (this._isArray(payload)) {
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, payload];
                    } else if (this._isPlainObject(payload)) {
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, [], payload];
                    } else {    // assume it's a single value
                        msg = [WAMP_MSG_SPEC.PUBLISH, reqId, options, topicURI, [payload]];
                    }
                    break;
            }

            this._send(msg);
            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
            this._cache.opStatus.reqId = reqId;
            return this;
        }

        /**
         * Remote Procedure Call
         * @param {string} topicURI
         * @param {string|number|Array|object} payload - can be either a value of any type or null
         * @param {function|object} callbacks - if it is a function - it will be treated as result callback function
         *                          or it can be hash table of callbacks:
         *                          { onSuccess: will be called with result on successful call
         *                            onError: will be called if invocation would be aborted }
         * @param {object} advancedOptions - optional parameter. Must include any or all of the options:
         *                          { disclose_me: bool flag of disclosure of Caller identity (WAMP session ID)
         *                                  to endpoints of a routed call
         *                            receive_progress: bool flag for receiving progressive results. In this case
         *                                  onSuccess function will be called every time on receiving result
         *                            timeout: integer timeout (in ms) for the call to finish }
         * @returns {Wampy}
         */
        call (topicURI, payload, callbacks, advancedOptions) {
            let reqId, msg, err = false;
            const options = {};

            if (!this._preReqChecks(topicURI, 'dealer', callbacks)) {
                return this;
            }

            if (typeof callbacks === 'function') {
                callbacks = { onSuccess: callbacks };
            } else if (!this._isPlainObject(callbacks) || typeof (callbacks.onSuccess) === 'undefined') {
                this._cache.opStatus = WAMP_ERROR_MSG.NO_CALLBACK_SPEC;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

                return this;
            }

            if (typeof (advancedOptions) !== 'undefined') {

                if (this._isPlainObject(advancedOptions)) {
                    if (advancedOptions.hasOwnProperty('disclose_me')) {
                        options.disclose_me = advancedOptions.disclose_me === true;
                    }

                    if (advancedOptions.hasOwnProperty('receive_progress')) {
                        options.receive_progress = advancedOptions.receive_progress === true;
                    }

                    if (advancedOptions.hasOwnProperty('timeout')) {
                        if (typeof advancedOptions.timeout === 'number') {
                            options.timeout = advancedOptions.timeout;
                        } else {
                            err = true;
                        }
                    }

                } else {
                    err = true;
                }

                if (err) {
                    this._cache.opStatus = WAMP_ERROR_MSG.INVALID_PARAM;

                    if (this._isPlainObject(callbacks) && callbacks.onError) {
                        callbacks.onError(this._cache.opStatus.description);
                    }

                    return this;
                }
            }

            do {
                reqId = this._getReqId();
            } while (reqId in this._calls);

            this._calls[reqId] = callbacks;

            // WAMP SPEC: [CALL, Request|id, Options|dict, Procedure|uri, (Arguments|list, ArgumentsKw|dict)]
            if (payload === null) {
                msg = [WAMP_MSG_SPEC.CALL, reqId, options, topicURI];
            } else {
                if (this._isArray(payload)) {
                    msg = [WAMP_MSG_SPEC.CALL, reqId, options, topicURI, payload];
                } else if (this._isPlainObject(payload)) {
                    msg = [WAMP_MSG_SPEC.CALL, reqId, options, topicURI, [], payload];
                } else {    // assume it's a single value
                    msg = [WAMP_MSG_SPEC.CALL, reqId, options, topicURI, [payload]];
                }
            }

            this._send(msg);
            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
            this._cache.opStatus.reqId = reqId;
            return this;
        }

        /**
         * RPC invocation cancelling
         *
         * @param {int} reqId RPC call request ID
         * @param {function|object} callbacks - if it is a function - it will be called if successfully
         *                          sent canceling message or it can be hash table of callbacks:
         *                          { onSuccess: will be called if successfully sent canceling message
         *                            onError: will be called if some error occurred }
         * @param {object} advancedOptions - optional parameter. Must include any or all of the options:
         *                          { mode: string|one of the possible modes:
         *                                  "skip" | "kill" | "killnowait". Skip is default.
          *                          }
         *
         * @returns {Wampy}
         */
        cancel (reqId, callbacks, advancedOptions) {
            const options = { mode: 'skip' };

            if (!this._preReqChecks(null, 'dealer', callbacks)) {
                return this;
            }

            if (!reqId || !this._calls[reqId]) {
                this._cache.opStatus = WAMP_ERROR_MSG.NON_EXIST_RPC_REQ_ID;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

                return this;
            }

            if ((typeof (advancedOptions) !== 'undefined') &&
                (this._isPlainObject(advancedOptions)) &&
                (advancedOptions.hasOwnProperty('mode'))) {

                options.mode = /skip|kill|killnowait/.test(advancedOptions.mode) ? advancedOptions.mode : 'skip' ;
            }

            // WAMP SPEC: [CANCEL, CALL.Request|id, Options|dict]
            this._send([WAMP_MSG_SPEC.CANCEL, reqId, options]);
            this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
            this._cache.opStatus.reqId = reqId;

            callbacks.onSuccess && callbacks.onSuccess();

            return this;
        }

        /**
         * RPC registration for invocation
         * @param {string} topicURI
         * @param {function|object} callbacks - if it is a function - it will be treated as rpc itself
         *                          or it can be hash table of callbacks:
         *                          { rpc: registered procedure
         *                            onSuccess: will be called on successful registration
         *                            onError: will be called if registration would be aborted }
         * @returns {Wampy}
         */
        register (topicURI, callbacks) {
            let reqId;

            if (!this._preReqChecks(topicURI, 'dealer', callbacks)) {
                return this;
            }

            if (typeof callbacks === 'function') {
                callbacks = { rpc: callbacks };
            } else if (!this._isPlainObject(callbacks) || typeof (callbacks.rpc) === 'undefined') {
                this._cache.opStatus = WAMP_ERROR_MSG.NO_CALLBACK_SPEC;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

                return this;
            }

            if (!this._rpcRegs[topicURI] || !this._rpcRegs[topicURI].callbacks.length) {
                // no such registration or processing unregistering

                reqId = this._getReqId();

                this._requests[reqId] = {
                    topic: topicURI,
                    callbacks: callbacks
                };

                // WAMP SPEC: [REGISTER, Request|id, Options|dict, Procedure|uri]
                this._send([WAMP_MSG_SPEC.REGISTER, reqId, {}, topicURI]);
                this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
                this._cache.opStatus.reqId = reqId;
            } else {    // already have registration with such topicURI
                this._cache.opStatus = WAMP_ERROR_MSG.RPC_ALREADY_REGISTERED;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

            }

            return this;

        }

        /**
         * RPC unregistration for invocation
         * @param {string} topicURI
         * @param {function|object} callbacks - if it is a function, it will be called on successful unregistration
         *                          or it can be hash table of callbacks:
         *                          { onSuccess: will be called on successful unregistration
         *                            onError: will be called if unregistration would be aborted }
         * @returns {Wampy}
         */
        unregister (topicURI, callbacks) {
            let reqId;

            if (!this._preReqChecks(topicURI, 'dealer', callbacks)) {
                return this;
            }

            if (typeof callbacks === 'function') {
                callbacks = { onSuccess: callbacks };
            }

            if (this._rpcRegs[topicURI]) {   // there is such registration

                reqId = this._getReqId();

                this._requests[reqId] = {
                    topic: topicURI,
                    callbacks: callbacks
                };

                // WAMP SPEC: [UNREGISTER, Request|id, REGISTERED.Registration|id]
                this._send([WAMP_MSG_SPEC.UNREGISTER, reqId, this._rpcRegs[topicURI].id]);
                this._cache.opStatus = WAMP_ERROR_MSG.SUCCESS;
                this._cache.opStatus.reqId = reqId;
            } else {    // there is no registration with such topicURI
                this._cache.opStatus = WAMP_ERROR_MSG.NON_EXIST_RPC_UNREG;

                if (this._isPlainObject(callbacks) && callbacks.onError) {
                    callbacks.onError(this._cache.opStatus.description);
                }

            }

            return this;
        }
    }

    return Wampy;

}));
});

//var postMessage:any = thispostMessage
//console.log("postMessage", postMessage)
function unixtime() {
    var now = Date.now() / 1000.0;
    return now;
}

var RemoteDataManager = function (_DataManager) {
    inherits(RemoteDataManager, _DataManager);

    function RemoteDataManager() {
        classCallCheck(this, RemoteDataManager);

        var _this = possibleConstructorReturn(this, (RemoteDataManager.__proto__ || Object.getPrototypeOf(RemoteDataManager)).call(this));

        _this.time_to_feed = function () {
            console.log("time to feed a dog");
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                var _loop = function _loop() {
                    var monitor_name = _step.value;

                    //console.log("***");
                    var monitor = _this._monitors.get(monitor_name);
                    //console.log("mon",monitor_name, "ch", monitor._channels)
                    var _iteratorNormalCompletion2 = true;
                    var _didIteratorError2 = false;
                    var _iteratorError2 = undefined;

                    try {
                        var _loop2 = function _loop2() {
                            var channel_name = _step2.value;

                            //if (channel_name != channel) {
                            //  continue;
                            //}
                            //let chan_obj = monitor._channels.get(channel_name)
                            var channel_data_cache = monitor._data_manager._channels_cache.get(channel_name);
                            channel_data_cache.db.db.values.where("index").between(monitor._start, monitor._end).toArray(function (got_data) {
                                var index_array = [];
                                var data_array = [];
                                for (var v = 0; v < got_data.length; v++) {
                                    //console.log(">",got_data[v].index, " : ", got_data[v].value)
                                    index_array.push(got_data[v].index);
                                    data_array.push(got_data[v].value);
                                }
                                //console.log("data:", got_data)
                                postMessage([MSG_HISTORICAL_DATA, monitor_name, channel_name, [index_array, data_array]]);
                                //
                            });
                            //console.log("postMessage!");
                        };

                        for (var _iterator2 = monitor._data_manager._channels_cache.keys()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                            _loop2();
                        }
                    } catch (err) {
                        _didIteratorError2 = true;
                        _iteratorError2 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                _iterator2.return();
                            }
                        } finally {
                            if (_didIteratorError2) {
                                throw _iteratorError2;
                            }
                        }
                    }
                };

                for (var _iterator = _this._monitors.keys()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    _loop();
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        };
        var z = setInterval(_this.time_to_feed, 1000);
        _this.start_comm();
        return _this;
    }

    createClass(RemoteDataManager, [{
        key: "subscribe_realtime_channel",
        value: function subscribe_realtime_channel(channel) {
            var _this2 = this;

            var subscription_base = 'realtime.data_';
            var subscription = subscription_base.concat(channel);
            console.log("subscribing to:", subscription);
            this.ws.subscribe(subscription, {
                onSuccess: function onSuccess() {
                    console.log("successfuly subscribed to", subscription);
                },
                onError: function onError(err, details) {
                    console.log("error", err, " = ", details);
                },
                onEvent: function onEvent(array_data, object_data) {
                    var index = array_data[0][0];
                    var value = array_data[0][1];
                    var now = Date.now() / 1000.0;
                    //todo check that this monitor is interested in
                    //realtime channel
                    _this2.getChannelCache(channel).add_realtime(index, value);
                    //console.log(this._monitors);
                    //console.log("!!!");
                    var _iteratorNormalCompletion3 = true;
                    var _didIteratorError3 = false;
                    var _iteratorError3 = undefined;

                    try {
                        for (var _iterator3 = _this2._monitors.keys()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                            var _monitor_name = _step3.value;

                            //console.log("***");
                            var _monitor = _this2._monitors.get(_monitor_name);
                            //console.log("mon",monitor_name, "ch", monitor._channels)
                            var _iteratorNormalCompletion4 = true;
                            var _didIteratorError4 = false;
                            var _iteratorError4 = undefined;

                            try {
                                for (var _iterator4 = _monitor._channels[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                    var _channel_name = _step4.value;

                                    if (_channel_name != channel) {
                                        continue;
                                    }
                                    //console.log("postMessage!");
                                    postMessage([MSG_REALTIME_DATA, _monitor_name, channel, [[index], [value]]]);
                                }
                            } catch (err) {
                                _didIteratorError4 = true;
                                _iteratorError4 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                                        _iterator4.return();
                                    }
                                } finally {
                                    if (_didIteratorError4) {
                                        throw _iteratorError4;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        _didIteratorError3 = true;
                        _iteratorError3 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                _iterator3.return();
                            }
                        } finally {
                            if (_didIteratorError3) {
                                throw _iteratorError3;
                            }
                        }
                    }
                }
            });
        }
    }, {
        key: "start_comm",
        value: function start_comm() {
            var _this3 = this;

            this.ws = new wampy('ws://127.0.0.1:8080/ws', {
                realm: 'realm1',
                ws: WebSocket,
                onConnect: function onConnect() {
                    console.log('Connected to Router!');
                    for (var channel in _this3._subscriptions) {
                        _this3.subscribe_realtime_channel(channel);
                    }
                }
            });
        }
    }, {
        key: "subscribe_to_channel",
        value: function subscribe_to_channel(channel) {
            console.log("Wamp subscribe");
            this.subscribe_realtime_channel(channel);
        }
    }, {
        key: "unsubscribe_from_channel",
        value: function unsubscribe_from_channel(channel) {}
    }]);
    return RemoteDataManager;
}(DataManager);

var remote_data_manager = new RemoteDataManager();
function subscribe(msg) {
    var dataset_id = msg.data[1];
    var channel = msg.data[2];
    console.log("worker_dataloader subscribing dataset:", dataset_id, ' channel:', channel);
    //postMessage([MSG_DATA, msg.data[1] , [[1,2,3],[4,5,6]], ])
    remote_data_manager.getMonitor(dataset_id).monitorChannel(channel);
}
function unsubscribe(msg) {
    var dataset_id = msg.data[1];
    var channel = msg.data[2];
    console.log("worker_dataloader unsubscribing from dataset:", dataset_id, ' channel:', channel);
    remote_data_manager.getMonitor(dataset_id).stopMonitorChannel(channel);
}
function set_range_of_interest(msg) {
    var dataset_id = msg.data[1];
    var start = msg.data[2];
    var end = msg.data[3];
    var max_points = msg.data[4];
    console.log("worker_dataloader dataset:", dataset_id, ' range:', start, '..', end, ' cnt:', max_points);
    remote_data_manager.getMonitor(dataset_id)._start = start;
    remote_data_manager.getMonitor(dataset_id)._end = end;
    remote_data_manager.getMonitor(dataset_id)._max_points = max_points;
    remote_data_manager.getMonitor(dataset_id)._time_range_updated = unixtime();
}
self.onmessage = function (msg) {
    switch (msg.data[0]) {
        case MSG_SUBSCRIBE:
            subscribe(msg);
            break;
        case MSG_UNSUBSCRIBE:
            unsubscribe(msg);
            break;
        case MSG_SET_RANGE_OF_INTEREST:
            set_range_of_interest(msg);
            break;
        default:
            console.log('Unknown message received', msg);
    }
};