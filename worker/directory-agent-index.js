var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/dashboard.ts
function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard \u2014 Cannabicultor</title>
<style>
  :root{ --bg:#f6f7f8; --card:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb;
         --accent:#00ab8e; --accent2:#0a7d5a; --warn:#b45309; --track:#eceef0; }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#0f1113; --card:#181b1e; --fg:#e8eaed; --muted:#9aa0a6; --line:#2a2f34; --track:#23282d; }
  }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{padding:18px 20px 6px;max-width:1000px;margin:0 auto}
  header h1{font-size:18px;margin:0;font-weight:680}
  header .sub{color:var(--muted);font-size:13px}
  main{max-width:1000px;margin:0 auto;padding:12px 20px 40px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:22px 0 10px}
  .grid{display:grid;gap:12px}
  .kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .kpi .n{font-size:26px;font-weight:700;line-height:1.1}
  .kpi .l{color:var(--muted);font-size:13px;margin-top:2px}
  .kpi.act{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  .cta{display:inline-block;margin-top:6px;font-size:13px;color:var(--accent);text-decoration:none;font-weight:600}
  .dir{display:grid;grid-template-columns:1fr;gap:10px}
  .dirrow{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;
    padding:10px 0;border-bottom:1px solid var(--line)}
  .dirrow:last-child{border-bottom:0}
  .dname{font-weight:600} .dname small{color:var(--muted);font-weight:400;display:block}
  .bar{background:var(--track);border-radius:8px;height:22px;position:relative;overflow:hidden}
  .bar > i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:8px}
  .bar > span{position:relative;z-index:1;font-size:12px;padding:0 8px;line-height:22px;color:var(--fg);mix-blend-mode:difference;filter:invert(1)}
  .gaps{font-size:12px;color:var(--muted);margin-top:4px}
  .gaps b{color:var(--warn);font-weight:600}
  .two{grid-template-columns:1fr 1fr}
  @media(max-width:720px){.two{grid-template-columns:1fr}.dirrow{grid-template-columns:1fr}}
  ul.q{list-style:none;margin:0;padding:0} ul.q li{padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}
  ul.q li:last-child{border-bottom:0} ul.q .meta{color:var(--muted);font-size:12px}
  .chip{display:inline-block;background:var(--track);border-radius:999px;padding:2px 10px;margin:3px 4px 0 0;font-size:13px}
  .chip b{color:var(--accent)}
  .spark{display:flex;gap:10px;align-items:flex-end;margin-top:12px}
  .col{flex:1;text-align:center;min-width:0}
  .colbar{background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:6px 6px 0 0;min-height:3px;margin:0 auto;width:70%}
  .col .cn{font-weight:600;font-size:13px;margin-top:4px} .col .cs{font-size:11px;color:var(--muted)}
  .col .cd{font-size:11px;color:var(--muted);margin-top:2px}
  .funnel{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:13px;color:var(--muted)}
  .funnel b{color:var(--fg);font-size:16px}
  .empty{color:var(--muted);text-align:center;padding:40px}
  .chart-svg{display:block;width:100%;height:auto}
  .legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)}
  .legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
  /* El verde de marca (#0F3020) se funde con el fondo de las tarjetas en modo oscuro:
     un halo claro solo-CSS mantiene el color exacto de marca pero lo hace legible. */
  .chart-halo{fill:none;stroke:none}
  .bar-green{stroke:none}
  @media (prefers-color-scheme: dark){
    .chart-halo{stroke:rgba(255,255,255,.55)}
    .bar-green{stroke:rgba(255,255,255,.4);stroke-width:1}
  }
</style>
</head>
<body>
<header>
  <h1>Buenos d\xEDas \u{1F331} \u2014 Cannabicultor</h1>
  <div class="sub" id="sub">Cargando\u2026</div>
</header>
<main id="app"></main>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
const app = document.getElementById('app');
const fmt = n => (n??0).toLocaleString('es-ES');

function bar(pct){ return '<div class="bar"><i style="width:'+pct+'%"></i><span>'+pct+'% completo</span></div>'; }

function render(d){
  document.getElementById('sub').textContent =
    'Actualizado ' + new Date(d.generado).toLocaleString('es-ES');
  const totalDir = d.directorios.reduce((a,x)=>a+x.total,0);
  const p = d.pendientes, act = d.actividad, ia = d.ia;

  let h = '';
  // --- Lo que te toca hoy ---
  h += '<h2>Lo que te toca hoy</h2><div class="grid kpis">';
  h += '<div class="card kpi '+(p.propuestas?'act':'')+'"><div class="n">'+fmt(p.propuestas)+'</div><div class="l">datos por aprobar</div>'+
       (p.propuestas?'<a class="cta" href="/review?token='+encodeURIComponent(token)+'">Revisar \u2192</a>':'')+'</div>';
  h += '<div class="card kpi '+(p.candidatos?'act':'')+'"><div class="n">'+fmt(p.candidatos)+'</div><div class="l">negocios nuevos por revisar</div>'+
       (p.candidatos?'<a class="cta" href="/review?token='+encodeURIComponent(token)+'">Revisar \u2192</a>':'')+'</div>';
  // Fotos de variedades (candidatas del buscador + subidas de usuarios): el contador llega aparte (/api/fotos-var).
  h += '<div class="card kpi" id="kpi-fotovar"><div class="n" id="kpi-fotovar-n">\u2026</div><div class="l">fotos de variedades por aprobar</div>'+
       '<div class="gaps" id="kpi-fotovar-sub"></div>'+
       '<a class="cta" href="/review?tab=fotos&token='+encodeURIComponent(token)+'">Revisar \u2192</a></div>';
  h += '<div class="card kpi"><div class="n">'+fmt(act.propuestas_publicadas_7d)+'</div><div class="l">publicados (7 d\xEDas)</div></div>';
  h += '<div class="card kpi"><div class="n">'+fmt(act.candidatos_nuevos_7d)+'</div><div class="l">descubiertos (7 d\xEDas)</div></div>';
  h += '</div>';

  // --- Directorios + completitud ---
  h += '<h2>Directorios ('+fmt(totalDir)+' fichas)</h2><div class="card dir">';
  for(const x of d.directorios){
    // Completitud = promedio de campos rellenos entre los campos rastreados de esa tabla.
    const gapFields = ['sin_web','sin_tel','sin_desc','sin_thc'].filter(k=>x[k]!=null);
    let pct = 0;
    if(x.total && gapFields.length){
      const fill = gapFields.reduce((a,k)=>a+(1-(x[k]/x.total)),0)/gapFields.length;
      pct = Math.round(100*fill);
    }
    const gaps = [];
    if(x.sin_web!=null) gaps.push('<b>'+fmt(x.sin_web)+'</b> sin web');
    if(x.sin_tel!=null) gaps.push('<b>'+fmt(x.sin_tel)+'</b> sin tel');
    if(x.sin_desc!=null) gaps.push('<b>'+fmt(x.sin_desc)+'</b> sin descripci\xF3n');
    if(x.sin_thc!=null) gaps.push('<b>'+fmt(x.sin_thc)+'</b> sin THC');
    h += '<div class="dirrow"><div class="dname">'+x.label+'<small>'+fmt(x.total)+' \xB7 '+fmt(x.indexables)+' indexables</small></div>'+
         '<div>'+bar(pct)+'<div class="gaps">'+gaps.join(' \xB7 ')+'</div></div></div>';
  }
  h += '</div>';

  // --- Negocio / web ---
  const nb = d.negocio || {};
  const td = nb.trafico_dia || [];
  const maxV = Math.max(1, ...td.map(x=>x.vistas));
  h += '<h2>Negocio \xB7 web</h2><div class="grid kpis">';
  h += '<div class="card kpi"><div class="n">'+fmt(nb.usuarios_total)+'</div><div class="l">usuarios registrados</div>'+
       (nb.usuarios_7d?'<div class="cta">+'+fmt(nb.usuarios_7d)+' en 7 d\xEDas</div>':'')+'</div>';
  h += '<div class="card kpi"><div class="n">'+fmt(nb.onboarding_inicio_7d)+'</div><div class="l">onboarding iniciado (7d)</div></div>';
  h += '<div class="card kpi"><div class="n">'+fmt(nb.registro_ok_7d)+'</div><div class="l">registros completados (7d)</div></div>';
  h += '<div class="card kpi"><div class="n">'+fmt(d.trafico.page_views_7d)+'</div><div class="l">p\xE1ginas vistas (7d)</div></div>';
  h += '</div>';
  // tr\xE1fico real por d\xEDa + funnel de registro
  h += '<div class="grid two" style="margin-top:12px">';
  h += '<div class="card"><div class="l" style="color:var(--muted);font-size:13px">Tr\xE1fico real por d\xEDa (sin bots ni visitas internas)</div><div class="spark">'+
       (td.length?td.map(t=>'<div class="col"><div class="colbar" style="height:'+Math.round(64*t.vistas/maxV)+'px"></div>'+
          '<div class="cn">'+fmt(t.vistas)+'</div><div class="cs">'+fmt(t.sesiones)+' ses</div>'+
          '<div class="cd">'+new Date(t.dia).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})+'</div></div>').join(''):'<div class="empty">sin datos</div>')+
       '</div></div>';
  h += '<div class="card"><div class="l" style="color:var(--muted);font-size:13px">Embudo de registro (7 d\xEDas)</div>'+
       '<div class="funnel"><span><b>'+fmt(nb.onboarding_inicio_7d)+'</b> onboarding</span>\u2192'+
       '<span><b>'+fmt(nb.registro_intento_7d)+'</b> intento</span>\u2192'+
       '<span><b>'+fmt(nb.registro_ok_7d)+'</b> registro \u2713</span></div>'+
       '<div class="l" style="color:var(--muted);font-size:13px;margin:12px 0 4px">Usuarios por plan</div>'+
       (nb.usuarios_por_plan||[]).map(p=>'<span class="chip">'+esc(p.plan)+' <b>'+fmt(p.n)+'</b></span>').join('')+'</div>';
  h += '</div>';

  // --- IA + actividad ---
  h += '<h2>Pulso de la IA</h2><div class="grid two">';
  h += '<div class="card"><div class="grid kpis" style="grid-template-columns:1fr 1fr">'+
       '<div class="kpi"><div class="n">'+fmt(ia.hoy)+'</div><div class="l">consultas hoy</div></div>'+
       '<div class="kpi"><div class="n">'+fmt(ia.semana)+'</div><div class="l">consultas 7 d\xEDas</div></div></div>'+
       '<div style="margin-top:10px">'+ia.top_categorias.map(c=>'<span class="chip">'+c.categoria+' <b>'+fmt(c.n)+'</b></span>').join('')+'</div>'+
       '<div class="gaps" style="margin-top:10px">'+fmt(d.trafico.page_views_7d)+' p\xE1ginas vistas (7 d\xEDas)</div></div>';
  h += '<div class="card"><div class="l" style="color:var(--muted);font-size:13px;margin-bottom:6px">\xDAltimas consultas al asistente</div><ul class="q">'+
       (ia.ultimas.length?ia.ultimas.map(q=>'<li>'+esc(q.pregunta)+'\u2026<div class="meta">'+new Date(q.created_at).toLocaleString('es-ES')+' \xB7 '+esc(q.canal||'')+'</div></li>').join(''):'<li class="empty">sin datos</li>')+
       '</ul></div>';
  h += '</div>';

  // --- Paises (ejecucion manual) ---
  h += '<h2>Pa\xEDses \xB7 buscador y enriquecedor</h2><div class="card">'+
       '<select id="arPais" onchange="paisEj()"><option value="AR">Argentina</option><option value="CL">Chile</option><option value="MX">M\xE9xico</option><option value="CO">Colombia</option></select> '+
       '<select id="arModo"><option value="ambos">ambos</option><option value="descubrir">descubrir</option><option value="enriquecer">enriquecer</option></select> '+
       '<input id="arCiudades" placeholder="ciudades (opcional): CABA,C\xF3rdoba,Rosario" size="34"> '+
       '<button onclick="runPais(1)">Dry run (no escribe)</button> '+
       '<button onclick="if(confirm(\\'Ejecutar \\'+document.getElementById(\\'arPais\\').value+\\' de verdad? Gasta SerpApi y escribe.\\'))runPais(0)">Ejecutar</button>'+
       '<pre id="arOut" class="gaps" style="white-space:pre-wrap;max-height:320px;overflow:auto"></pre></div>';

  app.innerHTML = h;
  fetch('/api/fotos-var?token='+encodeURIComponent(token)+'&limite=1').then(r=>r.ok?r.json():null).then(j=>{
    if(!j||!j.conteo) throw 0;
    document.getElementById('kpi-fotovar-n').textContent = fmt(j.conteo.pendiente);
    if(j.conteo.pendiente) document.getElementById('kpi-fotovar').classList.add('act');
    document.getElementById('kpi-fotovar-sub').textContent = fmt(j.conteo.aprobada)+' aprobadas \xB7 '+fmt(j.conteo.rechazada)+' rechazadas';
  }).catch(()=>{ const n=document.getElementById('kpi-fotovar-n'); if(n) n.textContent='\u2014'; });
}
const EJ_CIUDADES={AR:'CABA,C\xF3rdoba,Rosario',CL:'Santiago,Valpara\xEDso,Concepci\xF3n',MX:'Ciudad de M\xE9xico,Guadalajara,Monterrey',CO:'Bogot\xE1,Medell\xEDn,Cali'};
function paisEj(){ document.getElementById('arCiudades').placeholder='ciudades (opcional): '+EJ_CIUDADES[document.getElementById('arPais').value]; }
async function runPais(dry){
  const out = document.getElementById('arOut'); out.textContent = 'Ejecutando\u2026';
  try{
    const c = document.getElementById('arCiudades').value.trim(); const ciu = c ? '&ciudades='+encodeURIComponent(c) : '';
    const r = await fetch('/run-pais?token='+encodeURIComponent(token)+'&pais='+document.getElementById('arPais').value+'&modo='+document.getElementById('arModo').value+'&dry='+dry+ciu);
    out.textContent = JSON.stringify(await r.json(), null, 2);
  }catch(e){ out.textContent = 'Error '+e.message; }
}
function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

// Colores de marca para las graficas (fijos, no dependen de tema claro/oscuro).
const BRAND_GREEN = '#0F3020';
const BRAND_GOLD = '#F0C040';

function fmtDay(iso){
  return new Date(iso+'T00:00:00Z').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',timeZone:'UTC'});
}

// Barras: una serie, sin dependencias externas (SVG a mano).
function svgBarChart(data, key, color){
  const w=600, h=190, padT=22, padB=26, padX=10;
  const vals = data.map(d=>d[key]);
  const max = Math.max(1, ...vals);
  const innerW = w - padX*2;
  const bw = innerW/data.length;
  let out = '';
  data.forEach((d,i)=>{
    const v = d[key];
    const bh = Math.round((h-padT-padB) * (v/max));
    const x = padX + i*bw + bw*0.18;
    const bwid = bw*0.64;
    const y = h - padB - bh;
    out += '<rect class="bar-green" x="'+x.toFixed(1)+'" y="'+y+'" width="'+bwid.toFixed(1)+'" height="'+Math.max(bh,1)+'" rx="3" fill="'+color+'"></rect>';
    out += '<text x="'+(x+bwid/2).toFixed(1)+'" y="'+(y-6)+'" text-anchor="middle" font-size="11" fill="var(--fg)">'+fmt(v)+'</text>';
    out += '<text x="'+(x+bwid/2).toFixed(1)+'" y="'+(h-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+fmtDay(d.dia)+'</text>';
  });
  return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="P\xE1ginas vistas por d\xEDa">'+out+'</svg>';
}

// Lineas: dos series con escalas independientes (valores muy distintos: consultas 0-30, usuarios en las decenas).
function svgDualLineChart(data, keyA, colorA, keyB, colorB){
  const w=600, h=190, padT=22, padB=26, padX=14;
  const n = data.length;
  const xStep = n>1 ? (w-padX*2)/(n-1) : 0;
  function scaleY(vals){
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = (max-min) || 1;
    return vals.map(v => h-padB-((v-min)/range)*(h-padT-padB));
  }
  const valsA = data.map(d=>d[keyA]);
  const valsB = data.map(d=>d[keyB]);
  const yA = scaleY(valsA);
  const yB = scaleY(valsB);
  const xs = data.map((_,i)=>padX+i*xStep);
  function pathFor(ys){ return ys.map((y,i)=>(i===0?'M':'L')+xs[i].toFixed(1)+','+y.toFixed(1)).join(' '); }
  function dotsAndLabels(ys, vals, color, dy, halo){
    return ys.map((y,i)=>
      (halo?'<circle class="chart-halo" cx="'+xs[i].toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4.5"></circle>':'')+
      '<circle cx="'+xs[i].toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3" fill="'+color+'"></circle>'+
      '<text x="'+xs[i].toFixed(1)+'" y="'+(y+dy).toFixed(1)+'" text-anchor="middle" font-size="10" fill="'+color+'">'+fmt(vals[i])+'</text>'
    ).join('');
  }
  // Halo detras de la linea/puntos verdes: en claro es invisible, en oscuro los separa del fondo de la tarjeta.
  let out = '<path class="chart-halo" d="'+pathFor(yA)+'" stroke-width="5"></path>';
  out += '<path d="'+pathFor(yA)+'" fill="none" stroke="'+colorA+'" stroke-width="2.5"></path>';
  out += dotsAndLabels(yA, valsA, colorA, -8, true);
  out += '<path d="'+pathFor(yB)+'" fill="none" stroke="'+colorB+'" stroke-width="2.5" stroke-dasharray="5 3"></path>';
  out += dotsAndLabels(yB, valsB, colorB, 14);
  out += data.map((d,i)=>'<text x="'+xs[i].toFixed(1)+'" y="'+(h-6)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+fmtDay(d.dia)+'</text>').join('');
  return '<svg class="chart-svg" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Consultas IA y usuarios totales por d\xEDa">'+out+'</svg>';
}

function renderMetrics(metrics){
  let h = '<h2>\xDAltimos 7 d\xEDas</h2><div class="grid two">';
  h += '<div class="card"><div class="l" style="color:var(--muted);font-size:13px;margin-bottom:6px">P\xE1ginas vistas por d\xEDa</div>'+
       svgBarChart(metrics, 'page_views', BRAND_GREEN)+'</div>';
  h += '<div class="card"><div class="l" style="color:var(--muted);font-size:13px;margin-bottom:6px">Consultas IA y usuarios totales por d\xEDa</div>'+
       svgDualLineChart(metrics, 'consultas', BRAND_GREEN, 'usuarios_total', BRAND_GOLD)+
       '<div class="legend"><span><i style="background:'+BRAND_GREEN+'"></i>Consultas IA</span><span><i style="background:'+BRAND_GOLD+'"></i>Usuarios totales</span></div></div>';
  h += '</div>';
  app.insertAdjacentHTML('beforeend', h);
}

function renderVentas(v){
  var pend = v.pendientes||0, e = v.embudo||{};
  var h = '<h2>Ventas</h2><div class="grid kpis">' +
    '<div class="card kpi '+(pend?'act':'')+'"><div class="n">'+fmt(pend)+'</div><div class="l">por aprobar en ventas</div><a class="cta" href="/ventas?token='+encodeURIComponent(token)+'">Abrir ventas \u2192</a></div>' +
    '<div class="card kpi"><div class="n">'+fmt(v.leads_total)+'</div><div class="l">leads ('+fmt(v.leads_con_email)+' con email)</div></div>' +
    '<div class="card kpi"><div class="n">'+fmt((e.email1_enviado||0)+(e.demo_enviado||0))+'</div><div class="l">contactados, esperando</div></div>' +
    '<div class="card kpi"><div class="n">'+fmt((e.respondio||0)+(e.demo_pendiente||0)+(e.demo_usado||0)+(e.reunion||0))+'</div><div class="l">conversaciones activas</div></div></div>';
  var el = document.getElementById('app');
  var hs = el.querySelectorAll('h2');
  if(hs.length>1) hs[1].insertAdjacentHTML('beforebegin', h); else el.insertAdjacentHTML('beforeend', h);
}
Promise.all([
  fetch('/api/dashboard?token='+encodeURIComponent(token)).then(r=>{ if(!r.ok) throw new Error('dashboard '+r.status); return r.json(); }),
  fetch('/api/metrics-7d?token='+encodeURIComponent(token)).then(r=>{ if(!r.ok) throw new Error('metrics-7d '+r.status); return r.json(); }),
]).then(([d,m])=>{
  render(d.stats);
  renderMetrics(m.metrics);
  fetch('/api/ventas/resumen?token='+encodeURIComponent(token)).then(function(r){return r.ok?r.json():null;}).then(function(v){ if(v&&v.ok) renderVentas(v.resumen); }).catch(function(){});
}).catch(e=>{ app.innerHTML='<div class="empty">Error '+e.message+' \u2014 \xBFtoken correcto?</div>'; });
<\/script>
</body>
</html>`;
}
__name(dashboardHtml, "dashboardHtml");

// src/supa.ts
function headers(env2, extra = {}) {
  return {
    apikey: env2.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
__name(headers, "headers");
async function restGet(env2, path) {
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(env2)
  });
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}
__name(restGet, "restGet");
async function restPost(env2, table3, rows, prefer = "return=minimal") {
  if (rows.length === 0) return;
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${table3}`, {
    method: "POST",
    headers: headers(env2, { Prefer: prefer }),
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    throw new Error(`POST ${table3} -> ${res.status} ${await res.text()}`);
  }
}
__name(restPost, "restPost");
async function restInsertReturning(env2, table3, row) {
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${table3}`, {
    method: "POST",
    headers: headers(env2, { Prefer: "return=representation" }),
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    throw new Error(`INSERT ${table3} -> ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0];
}
__name(restInsertReturning, "restInsertReturning");
async function restPatch(env2, path, patch) {
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(env2, { Prefer: "return=minimal" }),
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    throw new Error(`PATCH ${path} -> ${res.status} ${await res.text()}`);
  }
}
__name(restPatch, "restPatch");
async function restRpc(env2, fn, args = {}) {
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(env2),
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`RPC ${fn} -> ${res.status} ${await res.text()}`);
  return res.json();
}
__name(restRpc, "restRpc");
async function lockedFields(env2, entityTable, entityId) {
  const rows = await restGet(
    env2,
    `field_locks?select=field_name&entity_table=eq.${entityTable}&entity_id=eq.${entityId}&is_locked=eq.true`
  );
  return new Set(rows.map((r) => r.field_name));
}
__name(lockedFields, "lockedFields");
async function pendingFields(env2, entityTable, entityId) {
  const rows = await restGet(
    env2,
    `field_proposals?select=field_name&entity_table=eq.${entityTable}&entity_id=eq.${entityId}&status=eq.pendiente`
  );
  return new Set(rows.map((r) => r.field_name));
}
__name(pendingFields, "pendingFields");
function normalizeRows(rows) {
  const keys = /* @__PURE__ */ new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  return rows.map((r) => Object.fromEntries([...keys].map((k) => [k, k in r ? r[k] : null])));
}
__name(normalizeRows, "normalizeRows");
async function restPostResilient(env2, table3, rows, prefer = "return=minimal") {
  const out = { written: 0, failed: 0, firstError: null, failedIdx: [], batchRetried: false };
  if (rows.length === 0) return out;
  const norm3 = normalizeRows(rows);
  try {
    await restPost(env2, table3, norm3, prefer);
    out.written = rows.length;
    return out;
  } catch (err) {
    out.batchRetried = true;
    out.firstError = String(err?.message ?? err);
  }
  for (let i = 0; i < norm3.length; i++) {
    try {
      await restPost(env2, table3, [norm3[i]], prefer);
      out.written++;
    } catch (err) {
      out.failed++;
      out.failedIdx.push(i);
      out.firstError = String(err?.message ?? err);
    }
  }
  if (out.failed === 0) out.firstError = null;
  return out;
}
__name(restPostResilient, "restPostResilient");
async function restPatchReturning(env2, path, patch) {
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(env2, { Prefer: "return=representation" }),
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status} ${await res.text()}`);
  return await res.json();
}
__name(restPatchReturning, "restPatchReturning");

// src/budget.ts
var SerpBudget = class {
  constructor(pais, perRun, perDay, usedToday) {
    this.pais = pais;
    this.perRun = perRun;
    this.perDay = perDay;
    this.usedToday = usedToday;
  }
  pais;
  perRun;
  perDay;
  usedToday;
  static {
    __name(this, "SerpBudget");
  }
  usedRun = 0;
  // busquedas de esta ejecucion (no se reinicia al persistir)
  persisted = 0;
  // parte de usedRun ya guardada en directory_serp_usage
  refused = 0;
  // Reserva una busqueda. false si se superaria el tope de ejecucion o de dia.
  take() {
    if (this.usedRun >= this.perRun || this.usedToday + this.usedRun >= this.perDay) {
      this.refused++;
      return false;
    }
    this.usedRun++;
    return true;
  }
  snapshot() {
    return {
      pais: this.pais,
      searches_run: this.usedRun,
      cap_run: this.perRun,
      searches_day: this.usedToday + this.usedRun,
      cap_day: this.perDay,
      refused: this.refused
    };
  }
};
var today = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "today");
var CAPS = {
  ES: { run: 30, day: 40 },
  AR: { run: 24, day: 30 },
  CL: { run: 36, day: 45 },
  MX: { run: 40, day: 80 },
  CO: { run: 40, day: 80 }
};
async function loadBudget(env2, cfg) {
  const d = CAPS[cfg.code] ?? { run: cfg.maxSearchesPerRun, day: cfg.maxSearchesPerDay };
  const perRun = parseInt(env2[`${cfg.code}_MAX_SEARCHES_RUN`] || "", 10) || d.run;
  const perDay = parseInt(env2[`${cfg.code}_MAX_SEARCHES_DAY`] || "", 10) || d.day;
  let used = 0;
  try {
    const rows = await restGet(env2, `directory_serp_usage?select=calls&pais=eq.${cfg.code}&dia=eq.${today()}&limit=1`);
    used = rows[0]?.calls ?? 0;
  } catch {
    used = perDay;
  }
  return new SerpBudget(cfg.code, perRun, perDay, used);
}
__name(loadBudget, "loadBudget");
async function commitBudget(env2, b) {
  const delta = b.usedRun - b.persisted;
  if (delta <= 0) return;
  await restPost(
    env2,
    "directory_serp_usage?on_conflict=pais,dia",
    [{ pais: b.pais, dia: today(), calls: b.usedToday + b.usedRun, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
    "return=minimal,resolution=merge-duplicates"
  );
  b.persisted = b.usedRun;
}
__name(commitBudget, "commitBudget");

// src/maps.ts
var placesKey = /* @__PURE__ */ __name((env2) => env2.GOOGLE_PLACES_API_KEY || env2.GOOGLE_PLACES_KEY || void 0, "placesKey");
var PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
var F_PRO = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryTypeDisplayName",
  "places.businessStatus"
];
var F_ENT = [
  ...F_PRO,
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.rating",
  "places.userRatingCount"
];
var DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
function placesAddress(cfg, a) {
  if (!a) return void 0;
  if (cfg.code !== "ES") return a;
  return a.replace(/,\s*(españa|spain)\s*$/i, "");
}
__name(placesAddress, "placesAddress");
async function placesMaps(env2, query, cfg, opts = {}) {
  const level = opts.level ?? (String(env2.PLACES_DISCOVER_LEVEL || "pro").toLowerCase() === "enterprise" ? "enterprise" : "pro");
  const body = { textQuery: query, languageCode: cfg.hl, regionCode: String(cfg.gl).toUpperCase(), pageSize: 20 };
  if (opts.ll) {
    const z = opts.zoom ?? 12;
    body.locationBias = {
      circle: { center: { latitude: opts.ll.lat, longitude: opts.ll.lon }, radius: Math.min(5e4, 15e3 * 2 ** (12 - z)) }
    };
  }
  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": placesKey(env2),
      "X-Goog-FieldMask": (level === "enterprise" ? F_ENT : F_PRO).join(",")
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Places maps -> ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.places ?? []).filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY").map((p) => {
    const hours = {};
    (p.regularOpeningHours?.weekdayDescriptions ?? []).forEach((d, i) => {
      const v = String(d).split(": ").slice(1).join(": ").trim();
      if (DAY_KEYS[i] && v) hours[DAY_KEYS[i]] = v;
    });
    return {
      title: p.displayName?.text ?? "",
      place_id: p.id,
      address: placesAddress(cfg, p.formattedAddress),
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
      website: p.websiteUri,
      gps_coordinates: p.location ? { latitude: p.location.latitude, longitude: p.location.longitude } : void 0,
      operating_hours: Object.keys(hours).length ? hours : void 0,
      rating: p.rating,
      reviews: p.userRatingCount,
      type: p.primaryTypeDisplayName?.text ?? p.types?.[0]
    };
  });
}
__name(placesMaps, "placesMaps");
async function serpMapsLegacy(env2, query, cfg, opts = {}) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", cfg.hl);
  url.searchParams.set("gl", cfg.gl);
  if (opts.ll) url.searchParams.set("ll", `@${opts.ll.lat},${opts.ll.lon},${opts.zoom ?? 12}z`);
  url.searchParams.set("api_key", env2.SERPAPI_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SerpAPI maps -> ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.local_results ?? (data.place_results ? [data.place_results] : []);
}
__name(serpMapsLegacy, "serpMapsLegacy");
function mapsUrl(placeId) {
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null;
}
__name(mapsUrl, "mapsUrl");
var DAYS = [
  ["monday", "L"],
  ["tuesday", "M"],
  ["wednesday", "X"],
  ["thursday", "J"],
  ["friday", "V"],
  ["saturday", "S"],
  ["sunday", "D"]
];
function horarioFrom(h) {
  if (!h) return null;
  const parts = DAYS.map(([k, l]) => h[k] ? `${l} ${h[k]}` : null).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
__name(horarioFrom, "horarioFrom");

// src/search.ts
async function serpSearchLegacy(env2, query) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "es");
  url.searchParams.set("gl", "es");
  url.searchParams.set("num", "8");
  url.searchParams.set("api_key", env2.SERPAPI_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpAPI -> ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const organic = (data.organic_results ?? []).slice(0, 6).map((r) => ({ title: r.title ?? "", link: r.link ?? "", snippet: r.snippet ?? "" }));
  return {
    query,
    knowledgeGraph: data.knowledge_graph ?? null,
    organic,
    homepage: null
  };
}
__name(serpSearchLegacy, "serpSearchLegacy");
async function fetchHomepage(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8e3);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CannabicultorDirectoryBot/0.1 (+https://cannabicultor.com)" },
      redirect: "follow"
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 4e3);
    return { url, text };
  } catch {
    return null;
  }
}
__name(fetchHomepage, "fetchHomepage");
async function fetchHomepageHtml(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8e3);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CannabicultorDirectoryBot/0.1 (+https://cannabicultor.com)" },
      redirect: "follow"
    });
    clearTimeout(t);
    if (!res.ok) return "";
    return (await res.text()).slice(0, 2e5);
  } catch {
    return "";
  }
}
__name(fetchHomepageHtml, "fetchHomepageHtml");

// src/providers.ts
var PROV_DEFAULT_CAP = {
  _GP_PRO: 4500,
  // gratis 5.000/mes
  _GP_ENT: 900,
  // gratis 1.000/mes
  _SERP: 850
  // plan Starter 1.000/mes
};
var PROV_CAP_ENV = { _GP_PRO: "CAP_GP_PRO_MONTH", _GP_ENT: "CAP_GP_ENT_MONTH", _SERP: "CAP_SERP_MONTH" };
var provMonth = {};
var provPending = {};
var BudgetError = class extends Error {
  static {
    __name(this, "BudgetError");
  }
  budget = true;
  constructor(m) {
    super(m);
  }
};
var monthStart = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 8) + "01", "monthStart");
function resetProviders() {
  for (const k of Object.keys(provMonth)) delete provMonth[k];
}
__name(resetProviders, "resetProviders");
async function takeProvider(env2, key) {
  const cap = parseInt(env2[PROV_CAP_ENV[key]] || "", 10) || PROV_DEFAULT_CAP[key];
  if (provMonth[key] === void 0) {
    try {
      const rows = await restGet(env2, `directory_serp_usage?select=calls&pais=eq.${key}&dia=gte.${monthStart()}`);
      provMonth[key] = rows.reduce((s, r) => s + (r.calls || 0), 0);
    } catch {
      return false;
    }
  }
  if (provMonth[key] + (provPending[key] ?? 0) >= cap) return false;
  provPending[key] = (provPending[key] ?? 0) + 1;
  return true;
}
__name(takeProvider, "takeProvider");
async function flushProviders(env2) {
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  for (const key of Object.keys(provPending)) {
    const n = provPending[key];
    if (!n) continue;
    try {
      const rows = await restGet(env2, `directory_serp_usage?select=calls&pais=eq.${key}&dia=eq.${day}&limit=1`);
      const prev = rows[0]?.calls ?? 0;
      await restPost(
        env2,
        "directory_serp_usage?on_conflict=pais,dia",
        [{ pais: key, dia: day, calls: prev + n, updated_at: (/* @__PURE__ */ new Date()).toISOString() }],
        "return=minimal,resolution=merge-duplicates"
      );
      provPending[key] = 0;
      delete provMonth[key];
    } catch (e) {
      console.log("[providers] no se pudo guardar", key, n, String(e));
    }
  }
}
__name(flushProviders, "flushProviders");
async function providerSnapshot(env2) {
  const out = {};
  for (const key of Object.keys(PROV_DEFAULT_CAP)) {
    const cap = parseInt(env2[PROV_CAP_ENV[key]] || "", 10) || PROV_DEFAULT_CAP[key];
    try {
      const rows = await restGet(env2, `directory_serp_usage?select=calls&pais=eq.${key}&dia=gte.${monthStart()}`);
      out[key] = { mes: rows.reduce((s, r) => s + (r.calls || 0), 0), tope: cap };
    } catch {
      out[key] = { mes: null, tope: cap };
    }
  }
  return out;
}
__name(providerSnapshot, "providerSnapshot");
var placesOn = /* @__PURE__ */ __name((env2) => !!placesKey(env2) && String(env2.MAPS_PROVIDER || "").toLowerCase() !== "serpapi", "placesOn");
var isQuotaErr = /* @__PURE__ */ __name((e) => /\b(429|RESOURCE_EXHAUSTED|RATE_LIMIT|OVER_QUERY_LIMIT)\b/.test(String(e?.message ?? e)), "isQuotaErr");
async function serpMaps(env2, query, cfg, opts = {}) {
  const level = opts.level === "enterprise" ? "enterprise" : "pro";
  if (placesOn(env2)) {
    const key = level === "enterprise" ? "_GP_ENT" : "_GP_PRO";
    if (await takeProvider(env2, key)) {
      try {
        return await placesMaps(env2, query, cfg, { ...opts, level });
      } catch (e) {
        if (!isQuotaErr(e)) throw e;
      }
    }
  }
  if (String(env2.SERP_FALLBACK ?? "1") === "0") throw new BudgetError("sin cuota gratis de Google y SERP_FALLBACK=0");
  if (!await takeProvider(env2, "_SERP")) throw new BudgetError("presupuesto mensual agotado (Google y SerpApi)");
  return serpMapsLegacy(env2, query, cfg, opts);
}
__name(serpMaps, "serpMaps");
async function serpSearch(env2, query) {
  if (!await takeProvider(env2, "_SERP")) throw new BudgetError("presupuesto mensual SerpApi agotado");
  return serpSearchLegacy(env2, query);
}
__name(serpSearch, "serpSearch");

// src/regiones.ts
var REGIONES_CL = [
  { canon: "Regi\xF3n de Arica y Parinacota", aliases: ["Arica y Parinacota"] },
  { canon: "Regi\xF3n de Tarapac\xE1", aliases: ["Tarapac\xE1"] },
  { canon: "Regi\xF3n de Antofagasta", aliases: ["Antofagasta"] },
  { canon: "Regi\xF3n de Atacama", aliases: ["Atacama"] },
  { canon: "Regi\xF3n de Coquimbo", aliases: ["Coquimbo"] },
  { canon: "Regi\xF3n de Valpara\xEDso", aliases: ["Valpara\xEDso"] },
  { canon: "Regi\xF3n Metropolitana", aliases: ["Metropolitana", "Metropolitana de Santiago", "Regi\xF3n Metropolitana de Santiago", "RM", "Santiago", "Santiago de Chile"] },
  { canon: "Regi\xF3n de O'Higgins", aliases: ["O'Higgins", "OHiggins", "Libertador General Bernardo O'Higgins", "Regi\xF3n del Libertador General Bernardo O'Higgins", "Libertador Bernardo O'Higgins"] },
  { canon: "Regi\xF3n del Maule", aliases: ["Maule"] },
  { canon: "Regi\xF3n de \xD1uble", aliases: ["\xD1uble"] },
  { canon: "Regi\xF3n del Biob\xEDo", aliases: ["Biob\xEDo", "B\xEDo B\xEDo", "Bio-Bio", "Biobio", "B\xEDo-B\xEDo"] },
  { canon: "Regi\xF3n de La Araucan\xEDa", aliases: ["La Araucan\xEDa", "Araucan\xEDa", "Araucania"] },
  { canon: "Regi\xF3n de Los R\xEDos", aliases: ["Los R\xEDos"] },
  { canon: "Regi\xF3n de Los Lagos", aliases: ["Los Lagos"] },
  { canon: "Regi\xF3n de Ays\xE9n", aliases: ["Ays\xE9n", "Ays\xE9n del General Carlos Ib\xE1\xF1ez del Campo", "Regi\xF3n de Ays\xE9n del General Carlos Ib\xE1\xF1ez del Campo"] },
  { canon: "Regi\xF3n de Magallanes", aliases: ["Magallanes", "Magallanes y de la Ant\xE1rtica Chilena", "Regi\xF3n de Magallanes y de la Ant\xE1rtica Chilena"] }
];
var REGIONES_MX = [
  { canon: "Aguascalientes", aliases: [] },
  { canon: "Baja California", aliases: ["B.C.", "Baja California Norte"] },
  { canon: "Baja California Sur", aliases: ["B.C.S."] },
  { canon: "Campeche", aliases: [] },
  { canon: "Chiapas", aliases: [] },
  { canon: "Chihuahua", aliases: [] },
  { canon: "Ciudad de M\xE9xico", aliases: ["CDMX", "Distrito Federal", "D.F.", "Ciudad de Mexico", "Mexico City"] },
  { canon: "Coahuila", aliases: ["Coahuila de Zaragoza"] },
  { canon: "Colima", aliases: [] },
  { canon: "Durango", aliases: [] },
  { canon: "Estado de M\xE9xico", aliases: ["Edomex", "Edo. de M\xE9xico", "Edo. Mex.", "Estado de Mexico", "Mexico State"] },
  { canon: "Guanajuato", aliases: [] },
  { canon: "Guerrero", aliases: [] },
  { canon: "Hidalgo", aliases: [] },
  { canon: "Jalisco", aliases: [] },
  { canon: "Michoac\xE1n", aliases: ["Michoac\xE1n de Ocampo"] },
  { canon: "Morelos", aliases: [] },
  { canon: "Nayarit", aliases: [] },
  { canon: "Nuevo Le\xF3n", aliases: ["N.L."] },
  { canon: "Oaxaca", aliases: [] },
  { canon: "Puebla", aliases: [] },
  { canon: "Quer\xE9taro", aliases: ["Quer\xE9taro de Arteaga", "Qro."] },
  { canon: "Quintana Roo", aliases: ["Q. Roo"] },
  { canon: "San Luis Potos\xED", aliases: ["S.L.P."] },
  { canon: "Sinaloa", aliases: [] },
  { canon: "Sonora", aliases: [] },
  { canon: "Tabasco", aliases: [] },
  { canon: "Tamaulipas", aliases: [] },
  { canon: "Tlaxcala", aliases: [] },
  { canon: "Veracruz", aliases: ["Veracruz de Ignacio de la Llave"] },
  { canon: "Yucat\xE1n", aliases: [] },
  { canon: "Zacatecas", aliases: [] }
];
var REGIONES_CO = [
  { canon: "Amazonas", aliases: [] },
  { canon: "Antioquia", aliases: [] },
  { canon: "Arauca", aliases: [] },
  { canon: "Atl\xE1ntico", aliases: [] },
  { canon: "Bogot\xE1 D.C.", aliases: ["Bogot\xE1", "Bogota", "Bogot\xE1 DC", "Bogota D.C.", "Bogot\xE1, D.C.", "D.C.", "Distrito Capital", "Distrito Capital de Bogot\xE1"] },
  { canon: "Bol\xEDvar", aliases: [] },
  { canon: "Boyac\xE1", aliases: [] },
  { canon: "Caldas", aliases: [] },
  { canon: "Caquet\xE1", aliases: [] },
  { canon: "Casanare", aliases: [] },
  { canon: "Cauca", aliases: [] },
  { canon: "Cesar", aliases: [] },
  { canon: "Choc\xF3", aliases: [] },
  { canon: "C\xF3rdoba", aliases: [] },
  { canon: "Cundinamarca", aliases: [] },
  { canon: "Guain\xEDa", aliases: [] },
  { canon: "Guaviare", aliases: [] },
  { canon: "Huila", aliases: [] },
  { canon: "La Guajira", aliases: ["Guajira"] },
  { canon: "Magdalena", aliases: [] },
  { canon: "Meta", aliases: [] },
  { canon: "Nari\xF1o", aliases: [] },
  { canon: "Norte de Santander", aliases: [] },
  { canon: "Putumayo", aliases: [] },
  { canon: "Quind\xEDo", aliases: [] },
  { canon: "Risaralda", aliases: [] },
  { canon: "San Andr\xE9s y Providencia", aliases: ["San Andr\xE9s", "Archipi\xE9lago de San Andr\xE9s, Providencia y Santa Catalina"] },
  { canon: "Santander", aliases: [] },
  { canon: "Sucre", aliases: [] },
  { canon: "Tolima", aliases: [] },
  { canon: "Valle del Cauca", aliases: ["Valle"] },
  { canon: "Vaup\xE9s", aliases: [] },
  { canon: "Vichada", aliases: [] }
];
var REGIONES_PAIS = { CL: REGIONES_CL, MX: REGIONES_MX, CO: REGIONES_CO };
var PRUEBA_REGION_CL = [
  "region metropolitana",
  "metropolitana de santiago",
  "region de arica y parinacota",
  "arica y parinacota",
  "region de tarapaca",
  "region de antofagasta",
  "region de atacama",
  "region de coquimbo",
  "region de valparaiso",
  "region de o higgins",
  "region del maule",
  "region de nuble",
  "region del biobio",
  "region de la araucania",
  "region de los rios",
  "region de los lagos",
  "region de aysen",
  "region de magallanes",
  "magallanes y de la antartica chilena",
  "libertador general bernardo o higgins",
  "biobio"
];
var PRUEBA_ALIAS_CL = ["rm", "santiago de chile"];
var PRUEBA_REGION_MX = [
  "aguascalientes",
  "baja california",
  "baja california sur",
  "campeche",
  "chiapas",
  "chihuahua",
  "ciudad de mexico",
  "coahuila",
  "colima",
  "durango",
  "estado de mexico",
  "guanajuato",
  "guerrero",
  "hidalgo",
  "jalisco",
  "michoacan",
  "morelos",
  "nayarit",
  "nuevo leon",
  "oaxaca",
  "puebla",
  "queretaro",
  "quintana roo",
  "san luis potosi",
  "sinaloa",
  "sonora",
  "tabasco",
  "tamaulipas",
  "tlaxcala",
  "veracruz",
  "yucatan",
  "zacatecas"
];
var PRUEBA_ALIAS_MX = [
  "cdmx",
  "edomex",
  "distrito federal",
  "d.f.",
  "ags.",
  "b.c.",
  "b.c.s.",
  "camp.",
  "chis.",
  "chih.",
  "coah.",
  "dgo.",
  "gto.",
  "gro.",
  "hgo.",
  "jal.",
  "mex.",
  "mich.",
  "mor.",
  "nay.",
  "n.l.",
  "oax.",
  "pue.",
  "qro.",
  "q. roo",
  "s.l.p.",
  "sin.",
  "son.",
  "tab.",
  "tamps.",
  "tlax.",
  "ver.",
  "yuc.",
  "zac."
];
var PRUEBA_REGION_CO = [
  "antioquia",
  "arauca",
  "atlantico",
  "bogota",
  "bogota d.c.",
  "bogota dc",
  "distrito capital",
  "boyaca",
  "caldas",
  "caqueta",
  "casanare",
  "cauca",
  "cesar",
  "choco",
  "cundinamarca",
  "guainia",
  "guaviare",
  "huila",
  "la guajira",
  "magdalena",
  "narino",
  "norte de santander",
  "putumayo",
  "quindio",
  "risaralda",
  "san andres y providencia",
  "santander",
  "tolima",
  "valle del cauca",
  "vaupes",
  "vichada"
];
var PRUEBA_ALIAS_CO = [];

// src/normalize.ts
function isEmpty(v) {
  return v === null || v === void 0 || typeof v === "string" && v.trim() === "";
}
__name(isEmpty, "isEmpty");
function normWords(s) {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
__name(normWords, "normWords");
function norm(s) {
  return normWords(s).replace(/[^a-z0-9]+/g, "").trim();
}
__name(norm, "norm");
function slugify(s) {
  return normWords(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
__name(slugify, "slugify");
function domainOf(url) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
__name(domainOf, "domainOf");
var AR_AREA4 = /* @__PURE__ */ new Set([
  "2901",
  "2964",
  "2966",
  "2920",
  "2944",
  "2804",
  "3541",
  "2284",
  "2477",
  "2324",
  "2323",
  "3489",
  "3487",
  "2262",
  "2972",
  "2627",
  "3446"
]);
function arAreaLen(nat) {
  if (nat.startsWith("11")) return 2;
  return AR_AREA4.has(nat.slice(0, 4)) ? 4 : 3;
}
__name(arAreaLen, "arAreaLen");
function parseArPhone(raw) {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  let mobile = false;
  d = d.replace(/^00/, "");
  if (d.startsWith("54") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) {
    d = d.slice(1);
    mobile = true;
  }
  d = d.replace(/^0/, "");
  if (d.length === 12) {
    const a = arAreaLen(d);
    if (d.slice(a, a + 2) === "15") {
      d = d.slice(0, a) + d.slice(a + 2);
      mobile = true;
    }
  }
  if (d.length !== 10) return null;
  return { key: d, mobile };
}
__name(parseArPhone, "parseArPhone");
var MX_AREA2 = /* @__PURE__ */ new Set(["55", "56", "33", "81"]);
function parsePhone(prefix, raw) {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^00/, "");
  if (prefix === "56") {
    if (d.startsWith("56") && d.length >= 11) d = d.slice(2);
    d = d.replace(/^0/, "");
    if (d.length !== 9) return null;
    return { key: d, mobile: d.startsWith("9") };
  }
  if (prefix === "52") {
    if (d.startsWith("52") && d.length >= 12) d = d.slice(2);
    d = d.replace(/^(044|045)/, "");
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    if (d.length !== 10) return null;
    return { key: d, mobile: false };
  }
  if (prefix === "57") {
    if (d.startsWith("57") && (d.length === 10 || d.length === 12)) d = d.slice(2);
    if (d.length === 8) d = "60" + d;
    if (d.length !== 10) return null;
    if (d.startsWith("3")) return { key: d, mobile: true };
    if (d.startsWith("60")) return { key: d, mobile: false };
    return null;
  }
  return null;
}
__name(parsePhone, "parsePhone");
var PHONE_PREFIXES = /* @__PURE__ */ new Set(["56", "52", "57"]);
var hasPhonePlan = /* @__PURE__ */ __name((prefix) => PHONE_PREFIXES.has(prefix), "hasPhonePlan");
function formatPhone(prefix, raw) {
  if (isEmpty(raw)) return null;
  const p = parsePhone(prefix, raw);
  if (!p) return raw.trim();
  const k = p.key;
  if (prefix === "56") {
    if (p.mobile) return `+56 9 ${k.slice(1, 5)} ${k.slice(5)}`;
    if (k.startsWith("2")) return `+56 2 ${k.slice(1, 5)} ${k.slice(5)}`;
    return `+56 ${k.slice(0, 2)} ${k.slice(2, 5)} ${k.slice(5)}`;
  }
  if (prefix === "52") {
    return MX_AREA2.has(k.slice(0, 2)) ? `+52 ${k.slice(0, 2)} ${k.slice(2, 6)} ${k.slice(6)}` : `+52 ${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6)}`;
  }
  return `+57 ${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6)}`;
}
__name(formatPhone, "formatPhone");
function normalizePhoneFor(prefix, raw) {
  if (prefix === "54") return normalizePhoneAR(raw);
  if (hasPhonePlan(prefix)) return formatPhone(prefix, raw);
  return isEmpty(raw) ? null : raw.trim();
}
__name(normalizePhoneFor, "normalizePhoneFor");
function phoneDigits(s, prefix = "34") {
  if (prefix === "54") {
    const p = parseArPhone(s);
    if (p) return p.key;
    return (s ?? "").replace(/\D/g, "").replace(/^0054/, "").replace(/^54/, "").replace(/^0/, "");
  }
  if (hasPhonePlan(prefix)) {
    const p = parsePhone(prefix, s);
    if (p) return p.key;
    return (s ?? "").replace(/\D/g, "").replace(new RegExp(`^00${prefix}`), "").replace(new RegExp(`^${prefix}`), "").replace(/^0/, "");
  }
  return (s ?? "").replace(/\D/g, "").replace(/^0034/, "").replace(/^34/, "");
}
__name(phoneDigits, "phoneDigits");
function normalizePhoneAR(raw) {
  if (isEmpty(raw)) return null;
  const p = parseArPhone(raw);
  if (!p) return raw.trim();
  const a = arAreaLen(p.key);
  const area = p.key.slice(0, a);
  const sub = p.key.slice(a);
  const head = sub.slice(0, sub.length - 4);
  const local = `${head}-${sub.slice(-4)}`;
  return `+54 ${p.mobile ? "9 " : ""}${area} ${local}`;
}
__name(normalizePhoneAR, "normalizePhoneAR");
var PROVINCIAS_AR = [
  "CABA",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "C\xF3rdoba",
  "Corrientes",
  "Entre R\xEDos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuqu\xE9n",
  "R\xEDo Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucum\xE1n"
];
var PROV_BY_KEY = new Map(PROVINCIAS_AR.map((p) => [norm(p), p]));
for (const alias of ["Ciudad Aut\xF3noma de Buenos Aires", "Capital Federal", "Ciudad de Buenos Aires", "Ciudad Autonoma", "C.A.B.A."]) {
  PROV_BY_KEY.set(norm(alias), "CABA");
}
var REGIONES_CONOCIDAS = new Set(PROVINCIAS_AR);
for (const regiones of Object.values(REGIONES_PAIS)) {
  for (const r of regiones) {
    REGIONES_CONOCIDAS.add(r.canon);
    for (const k of [r.canon, ...r.aliases]) PROV_BY_KEY.set(norm(k), r.canon);
  }
}
function normalizeProvincia(raw) {
  if (isEmpty(raw)) return null;
  const cleaned = raw.trim().replace(/^provincia\s+(de(l)?\s+)?/i, "").trim();
  const direct = PROV_BY_KEY.get(norm(cleaned));
  if (direct) return direct;
  const bare = cleaned.replace(/^(regi[oó]n|departamento|estado)\s+(de(l|\s+la)?\s+)?/i, "").replace(/\s+(region|regi[oó]n)$/i, "").trim();
  return (bare !== cleaned ? PROV_BY_KEY.get(norm(bare)) : void 0) ?? cleaned;
}
__name(normalizeProvincia, "normalizeProvincia");
var IG_BLOCK = /* @__PURE__ */ new Set([
  "squarespace",
  "wix",
  "wixsite",
  "wordpress",
  "shopify",
  "tiendanube",
  "nuvemshop",
  "linktree",
  "linktr",
  "linktr.ee",
  "facebook",
  "fb",
  "meta",
  "instagram",
  "google",
  "youtube",
  "tiktok",
  "twitter",
  "x",
  "whatsapp",
  "threads",
  "mercadolibre",
  "mercadoshops",
  "godaddy",
  "weebly",
  "jimdo",
  "canva",
  "blogger",
  "blogspot",
  "pinterest",
  "tumblr",
  "sharer",
  "share",
  "explore",
  "reel",
  "reels",
  "p",
  "accounts",
  "about",
  "stories",
  "direct",
  "tv",
  "developer",
  "help",
  "legal",
  "privacy",
  "terms",
  "business",
  "creators",
  "cannabis",
  "marihuana",
  "weed",
  "growshop",
  "grow",
  "cbd",
  "argentina",
  "buenosaires",
  "chile",
  "mexico",
  "colombia",
  "santiago",
  "bogota",
  "cdmx",
  "hemp",
  "wixstudio",
  "webnode",
  "strikingly",
  "carrd",
  "hostinger",
  "webflow"
]);
function isBlockedInstagram(handle) {
  const h = (handle ?? "").toLowerCase().replace(/^@/, "");
  return !h || IG_BLOCK.has(h) || IG_BLOCK.has(h.replace(/[._]/g, ""));
}
__name(isBlockedInstagram, "isBlockedInstagram");
function instagramUrl(raw) {
  if (isEmpty(raw)) return null;
  const s = raw.trim();
  const m = s.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/i) ?? s.match(/^@?([A-Za-z0-9._]{2,30})$/);
  if (!m) return null;
  const h = m[1].replace(/\/$/, "");
  if (isBlockedInstagram(h)) return null;
  return `https://www.instagram.com/${h}/`;
}
__name(instagramUrl, "instagramUrl");
function instagramLooksLikeName(handle, name) {
  const h = norm(handle), n = nameKey(name);
  if (!h || !n) return false;
  return h.includes(n) || n.includes(h) || dice(h, n) >= 0.6;
}
__name(instagramLooksLikeName, "instagramLooksLikeName");
function findInstagram(html, name) {
  const seen = /* @__PURE__ */ new Set();
  const found = [];
  for (const m of (html ?? "").matchAll(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{2,30})/gi)) {
    const u = instagramUrl(m[0]);
    if (u && !seen.has(u)) {
      seen.add(u);
      found.push(u);
    }
  }
  if (!found.length) return null;
  if (name) {
    const like = found.find((u) => instagramLooksLikeName(u.split("/").filter(Boolean).pop() ?? "", name));
    if (like) return like;
  }
  return found[0];
}
__name(findInstagram, "findInstagram");
var GENERIC_NAME = /* @__PURE__ */ new Set([
  "grow",
  "shop",
  "growshop",
  "growshops",
  "tienda",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "the",
  "cultivo",
  "cultivos",
  "club",
  "ong",
  "asociacion",
  "civil",
  "online",
  "distribuidora",
  "growclub",
  "growstore",
  "growcenter",
  "fundacion",
  "corporacion",
  "tabaqueria",
  "tabaco",
  "smoke",
  "hidroponico",
  "hidroponicos",
  "hidroponica",
  "hidroponia",
  "vivero"
]);
var JUNK_WORDS = /* @__PURE__ */ new Set([
  ...GENERIC_NAME,
  "cannabis",
  "cannabico",
  "cannabica",
  "cannabicos",
  "aceite",
  "aceites",
  "espacio",
  "cbd",
  "marihuana",
  "hemp",
  "venta",
  "productos",
  "producto",
  "insumos",
  "cultivos",
  "medicinal",
  "medicinales",
  "semillas",
  "vape"
]);
function tokens(s) {
  return normWords(s).split(/[^a-z0-9]+/).filter(Boolean);
}
__name(tokens, "tokens");
function baseName(s) {
  return (s ?? "").replace(/\([^)]*\)?/g, " ").replace(/\[[^\]]*\]?/g, " ").replace(/^\s*[A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d10-9]{2,6}\s*[-\u2013\u2014:|]\s+/, "").trim();
}
__name(baseName, "baseName");
function distinctiveTokens(s) {
  return tokens(baseName(s)).filter((t) => !GENERIC_NAME.has(t));
}
__name(distinctiveTokens, "distinctiveTokens");
function coreTokens(s) {
  const d = distinctiveTokens(s);
  const hard = d.filter((t) => !SOFT_GENERIC.has(t));
  return hard.length ? hard : d;
}
__name(coreTokens, "coreTokens");
function nameKey(s) {
  const d = distinctiveTokens(s);
  return d.length ? d.join("") : norm(s);
}
__name(nameKey, "nameKey");
var SOFT_GENERIC = /* @__PURE__ */ new Set(["cannabis", "cannabico", "cannabica", "cannabicos", "social", "cbd", "weed", "marihuana", "hemp", "argentina", "medicinal", "medicinales", "terapeutico"]);
function dedupeKey(s) {
  return coreTokens(s).join("") || norm(s);
}
__name(dedupeKey, "dedupeKey");
function nameTokens(s) {
  return coreTokens(s).join(" ");
}
__name(nameTokens, "nameTokens");
function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
__name(bigrams, "bigrams");
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const m = /* @__PURE__ */ new Map();
  for (const x of A) m.set(x, (m.get(x) ?? 0) + 1);
  let hit = 0;
  for (const x of B) {
    const n = m.get(x) ?? 0;
    if (n > 0) {
      hit++;
      m.set(x, n - 1);
    }
  }
  return 2 * hit / (A.length + B.length);
}
__name(dice, "dice");
function trigramSet(s) {
  const out = /* @__PURE__ */ new Set();
  for (const w of normWords(s).split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}
__name(trigramSet, "trigramSet");
function trigramSim(a, b) {
  const A = trigramSet(a ?? ""), B = trigramSet(b ?? "");
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
__name(trigramSim, "trigramSim");
function tokenSubset(a, b) {
  const A = coreTokens(a), B = coreTokens(b);
  if (!A.length || !B.length) return false;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  return small.every((x) => big.some((y) => tokMatch(x, y)));
}
__name(tokenSubset, "tokenSubset");
function tokMatch(a, b) {
  return a === b || a + "s" === b || b + "s" === a || a.length >= 5 && b.length >= 5 && dice(a, b) >= 0.85;
}
__name(tokMatch, "tokMatch");
function nameSimilarity(a, b) {
  const A = coreTokens(a), B = coreTokens(b);
  if (!A.length && !B.length) return norm(a) && norm(a) === norm(b) ? 1 : 0;
  if (!A.length || !B.length) return 0;
  if (A.join("") === B.join("")) return 1;
  let common = 0;
  const used = /* @__PURE__ */ new Set();
  for (const x of A) {
    const j = B.findIndex((y, i) => !used.has(i) && tokMatch(x, y));
    if (j >= 0) {
      used.add(j);
      common++;
    }
  }
  if (common === 0) return 0;
  const jac = common / (A.length + B.length - common);
  const ja = A.join(""), jb = B.join("");
  const dj = dice(ja, jb);
  return Math.max(jac, dj >= 0.92 ? dj : 0);
}
__name(nameSimilarity, "nameSimilarity");
var EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
var DAY = "(?:lun|mar|mie|mi\xE9|jue|vie|sab|s\xE1b|dom)\\w*\\.?";
function cleanName(raw) {
  let s = (raw ?? "").replace(EMOJI, " ");
  s = s.replace(/\([^)]*\)?/g, " ").replace(/\[[^\]]*\]?/g, " ");
  s = s.replace(new RegExp(`\\b${DAY}\\s*(?:a|-|\u2013|y)\\s*${DAY}`, "gi"), " ");
  s = s.replace(/\b(?:de\s+)?\d{1,2}(?:[:.]\d{2})?\s*(?:a|-|\u2013)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:hs?|hrs?|h)\b\.?/gi, " ");
  s = s.replace(/\b\d{1,2}[:.]\d{2}\s*(?:hs?|hrs?|am|pm)?\b/gi, " ");
  const cut = s.match(/^(.{3,}?)\s[|\u2022\u00b7\u2013\u2014-]\s(.*)$/);
  if (cut && (/\d/.test(cut[2]) || /\b(av|avenida|calle|ruta|km|local)\b/i.test(cut[2]))) s = cut[1];
  const addr = s.match(/^(.{3,}?)\s+(?:av\.?|avenida|calle|ruta)\s.*$/i);
  if (addr) s = addr[1];
  s = s.replace(/\s+/g, " ").replace(/^[\s\-|,:.\u2013\u2014]+|[\s\-|,:.\u2013\u2014]+$/g, "");
  if (s.length > 80) {
    const cutAt = s.lastIndexOf(" ", 80);
    s = s.slice(0, cutAt > 20 ? cutAt : 80).trim();
  }
  return s;
}
__name(cleanName, "cleanName");
var SALE = /^[-\u2013|,:\s]*(ventas?|vendo|vendemos|se\s+vende\w*)\b/i;
function isParticular(raw) {
  const s = (raw ?? "").trim();
  if (SALE.test(s)) return true;
  const words = s.split(/\s+/);
  for (let k = 1; k <= 3 && k < words.length; k++) {
    const prefix = words.slice(0, k);
    if (!prefix.every((w) => /^\p{Lu}[\p{Ll}'\u2019]+$/u.test(w))) break;
    if (!SALE.test(words.slice(k).join(" "))) continue;
    return !prefix.some((w) => tokens(w).some((t) => GENERIC_NAME.has(t) || SOFT_GENERIC.has(t) || JUNK_WORDS.has(t)));
  }
  return false;
}
__name(isParticular, "isParticular");
function hasLongToken(s, max = 22) {
  return new RegExp(`\\S{${max + 1},}`).test(s ?? "");
}
__name(hasLongToken, "hasLongToken");
function isJunkName(cleaned, original) {
  const s = cleaned.trim();
  if (s.length < 3) return true;
  if (!/\p{L}/u.test(s)) return true;
  if (isParticular(original ?? s)) return true;
  const t = tokens(s);
  return t.length > 0 && t.every((w) => JUNK_WORDS.has(w));
}
__name(isJunkName, "isJunkName");
function identityKeys(p, prefix = "34") {
  return {
    canon: norm(p.title) + "|" + norm(p.area),
    name: nameKey(p.title),
    phone: phoneDigits(p.phone, prefix) || null,
    domain: domainOf(p.website) || null,
    place_id: p.place_id ?? null
  };
}
__name(identityKeys, "identityKeys");

// src/ciudades.ts
var CL_RM = "Regi\xF3n Metropolitana";
var CL_HIGH = [
  ["Santiago", CL_RM, -33.4489, -70.6693],
  ["Providencia", CL_RM, -33.4319, -70.6093],
  ["\xD1u\xF1oa", CL_RM, -33.4569, -70.5976],
  ["Las Condes", CL_RM, -33.4089, -70.5675],
  ["Maip\xFA", CL_RM, -33.5106, -70.7575],
  ["Puente Alto", CL_RM, -33.6117, -70.5758],
  ["La Florida", CL_RM, -33.5228, -70.5983],
  ["Valpara\xEDso", "Regi\xF3n de Valpara\xEDso", -33.0472, -71.6127],
  ["Vi\xF1a del Mar", "Regi\xF3n de Valpara\xEDso", -33.0245, -71.5518],
  ["Concepci\xF3n", "Regi\xF3n del Biob\xEDo", -36.8201, -73.0444],
  ["Temuco", "Regi\xF3n de La Araucan\xEDa", -38.7359, -72.5904],
  ["La Serena", "Regi\xF3n de Coquimbo", -29.9027, -71.2519],
  ["Antofagasta", "Regi\xF3n de Antofagasta", -23.6509, -70.3975],
  ["Iquique", "Regi\xF3n de Tarapac\xE1", -20.2133, -70.1503],
  ["Arica", "Regi\xF3n de Arica y Parinacota", -18.4783, -70.3126],
  ["Rancagua", "Regi\xF3n de O'Higgins", -34.1708, -70.7444],
  ["Talca", "Regi\xF3n del Maule", -35.4264, -71.6554],
  ["Puerto Montt", "Regi\xF3n de Los Lagos", -41.4693, -72.9424],
  ["Punta Arenas", "Regi\xF3n de Magallanes", -53.1638, -70.9171]
];
var CL_MID = [
  ["Talcahuano", "Regi\xF3n del Biob\xEDo", -36.7249, -73.1168],
  ["Coquimbo", "Regi\xF3n de Coquimbo", -29.9533, -71.3436],
  ["Calama", "Regi\xF3n de Antofagasta", -22.4542, -68.9291],
  ["Copiap\xF3", "Regi\xF3n de Atacama", -27.3668, -70.3323],
  ["Chill\xE1n", "Regi\xF3n de \xD1uble", -36.6063, -72.1034],
  ["Los \xC1ngeles", "Regi\xF3n del Biob\xEDo", -37.4697, -72.3537],
  ["Osorno", "Regi\xF3n de Los Lagos", -40.5739, -73.1335],
  ["Valdivia", "Regi\xF3n de Los R\xEDos", -39.8142, -73.2459],
  ["Quillota", "Regi\xF3n de Valpara\xEDso", -32.8833, -71.25],
  ["San Antonio", "Regi\xF3n de Valpara\xEDso", -33.5933, -71.6128]
];
var MX_HIGH = [
  ["Ciudad de M\xE9xico", "Ciudad de M\xE9xico", 19.4326, -99.1332],
  ["Guadalajara", "Jalisco", 20.6597, -103.3496],
  ["Zapopan", "Jalisco", 20.7214, -103.3918],
  ["Monterrey", "Nuevo Le\xF3n", 25.6866, -100.3161],
  ["San Pedro Garza Garc\xEDa", "Nuevo Le\xF3n", 25.65, -100.4024],
  ["Puebla", "Puebla", 19.0414, -98.2063],
  ["Tijuana", "Baja California", 32.5149, -117.0382],
  ["Mexicali", "Baja California", 32.6245, -115.4523],
  ["Le\xF3n", "Guanajuato", 21.125, -101.686],
  ["Quer\xE9taro", "Quer\xE9taro", 20.5888, -100.3899],
  ["M\xE9rida", "Yucat\xE1n", 20.9674, -89.5926],
  ["Canc\xFAn", "Quintana Roo", 21.1619, -86.8515],
  ["Playa del Carmen", "Quintana Roo", 20.6296, -87.0739],
  ["Oaxaca", "Oaxaca", 17.0732, -96.7266],
  ["Morelia", "Michoac\xE1n", 19.706, -101.195],
  ["San Luis Potos\xED", "San Luis Potos\xED", 22.1565, -100.9855],
  ["Aguascalientes", "Aguascalientes", 21.8853, -102.2916],
  ["Chihuahua", "Chihuahua", 28.6353, -106.0889],
  ["Hermosillo", "Sonora", 29.0729, -110.9559],
  ["Culiac\xE1n", "Sinaloa", 24.8091, -107.394],
  ["Veracruz", "Veracruz", 19.1738, -96.1342],
  ["Xalapa", "Veracruz", 19.5438, -96.9102],
  ["Toluca", "Estado de M\xE9xico", 19.2826, -99.6557],
  ["Cuernavaca", "Morelos", 18.9242, -99.2216],
  ["Saltillo", "Coahuila", 25.4232, -100.9926],
  ["Villahermosa", "Tabasco", 17.9892, -92.9475],
  ["Tuxtla Guti\xE9rrez", "Chiapas", 16.7528, -93.1152],
  ["La Paz", "Baja California Sur", 24.1426, -110.3128],
  ["Durango", "Durango", 24.0277, -104.6532],
  ["Tampico", "Tamaulipas", 22.2331, -97.861],
  ["Mazatl\xE1n", "Sinaloa", 23.2494, -106.4111],
  ["Puerto Vallarta", "Jalisco", 20.6534, -105.2253],
  ["Ciudad Ju\xE1rez", "Chihuahua", 31.6904, -106.4245]
];
var MX_MID = [
  ["Naucalpan", "Estado de M\xE9xico", 19.4785, -99.2396],
  ["Ecatepec", "Estado de M\xE9xico", 19.601, -99.05],
  ["Tlalnepantla", "Estado de M\xE9xico", 19.54, -99.195],
  ["Tepic", "Nayarit", 21.5042, -104.8946],
  ["Colima", "Colima", 19.2433, -103.725],
  ["Zacatecas", "Zacatecas", 22.7709, -102.5832],
  ["Pachuca", "Hidalgo", 20.1011, -98.7591],
  ["Tlaxcala", "Tlaxcala", 19.3139, -98.2404],
  ["Campeche", "Campeche", 19.8301, -90.5349],
  ["Chetumal", "Quintana Roo", 18.5001, -88.2961],
  ["Tapachula", "Chiapas", 14.9051, -92.2627],
  ["Acapulco", "Guerrero", 16.8531, -99.8237],
  ["Celaya", "Guanajuato", 20.5235, -100.8157],
  ["Irapuato", "Guanajuato", 20.6767, -101.3563],
  ["Reynosa", "Tamaulipas", 26.0508, -98.2979],
  ["Ensenada", "Baja California", 31.8667, -116.596],
  ["San Jos\xE9 del Cabo", "Baja California Sur", 23.0614, -109.6977],
  ["Tulum", "Quintana Roo", 20.2114, -87.4654]
];
var CO_HIGH = [
  ["Bogot\xE1", "Bogot\xE1 D.C.", 4.711, -74.0721],
  ["Medell\xEDn", "Antioquia", 6.2442, -75.5812],
  ["Cali", "Valle del Cauca", 3.4516, -76.532],
  ["Barranquilla", "Atl\xE1ntico", 10.9685, -74.7813],
  ["Cartagena", "Bol\xEDvar", 10.391, -75.4794],
  ["Bucaramanga", "Santander", 7.1193, -73.1227],
  ["C\xFAcuta", "Norte de Santander", 7.8939, -72.5078],
  ["Pereira", "Risaralda", 4.8133, -75.6961],
  ["Manizales", "Caldas", 5.0703, -75.5138],
  ["Armenia", "Quind\xEDo", 4.5339, -75.6811],
  ["Ibagu\xE9", "Tolima", 4.4389, -75.2322],
  ["Santa Marta", "Magdalena", 11.2408, -74.199],
  ["Villavicencio", "Meta", 4.142, -73.6266],
  ["Pasto", "Nari\xF1o", 1.2136, -77.2811],
  ["Popay\xE1n", "Cauca", 2.4448, -76.6147],
  ["Neiva", "Huila", 2.9273, -75.2819],
  ["Monter\xEDa", "C\xF3rdoba", 8.7479, -75.8814],
  ["Valledupar", "Cesar", 10.4631, -73.2532],
  ["Sincelejo", "Sucre", 9.3047, -75.3978],
  ["Tunja", "Boyac\xE1", 5.5353, -73.3678],
  ["Envigado", "Antioquia", 6.1759, -75.5917],
  ["Itag\xFC\xED", "Antioquia", 6.1846, -75.5991],
  ["Ch\xEDa", "Cundinamarca", 4.8586, -74.0586],
  ["Soacha", "Cundinamarca", 4.5794, -74.2169]
];
var CO_MID = [
  ["Palmira", "Valle del Cauca", 3.5394, -76.3036],
  ["Bello", "Antioquia", 6.3373, -75.5579],
  ["Rionegro", "Antioquia", 6.1553, -75.3742],
  ["Riohacha", "La Guajira", 11.5444, -72.9072],
  ["Florencia", "Caquet\xE1", 1.6144, -75.6062],
  ["Yopal", "Casanare", 5.3378, -72.3959],
  ["Quibd\xF3", "Choc\xF3", 5.6947, -76.6583],
  ["San Andr\xE9s", "San Andr\xE9s y Providencia", 12.5847, -81.7006],
  ["Sogamoso", "Boyac\xE1", 5.7145, -72.9339],
  ["Girardot", "Cundinamarca", 4.3032, -74.8034]
];

// src/pais.ts
var toCities = /* @__PURE__ */ __name((hi, mid) => [
  ...hi.map(([name, provincia, lat, lon]) => ({ name, provincia, prio: "alta", lat, lon })),
  ...mid.map(([name, provincia, lat, lon]) => ({ name, provincia, prio: "media", lat, lon }))
], "toCities");
var AR_HIGH = [
  ["Ciudad de Buenos Aires", "CABA", -34.6037, -58.3816],
  ["La Plata", "Buenos Aires", -34.9215, -57.9545],
  ["Mar del Plata", "Buenos Aires", -38.0055, -57.5426],
  ["Bah\xEDa Blanca", "Buenos Aires", -38.7183, -62.2661],
  ["Quilmes", "Buenos Aires", -34.7242, -58.2526],
  ["Lomas de Zamora", "Buenos Aires", -34.7609, -58.4008],
  ["Lan\xFAs", "Buenos Aires", -34.7003, -58.3919],
  ["Mor\xF3n", "Buenos Aires", -34.6534, -58.6198],
  ["Ramos Mej\xEDa", "Buenos Aires", -34.6411, -58.5647],
  ["Tigre", "Buenos Aires", -34.426, -58.5796],
  ["San Isidro", "Buenos Aires", -34.4708, -58.5286],
  ["Vicente L\xF3pez", "Buenos Aires", -34.5262, -58.4739],
  ["Pilar", "Buenos Aires", -34.4587, -58.9142],
  ["C\xF3rdoba", "C\xF3rdoba", -31.4201, -64.1888],
  ["Rosario", "Santa Fe", -32.9442, -60.6505],
  ["Santa Fe", "Santa Fe", -31.6333, -60.7],
  ["Paran\xE1", "Entre R\xEDos", -31.7333, -60.5333],
  ["Mendoza", "Mendoza", -32.8895, -68.8458],
  ["San Juan", "San Juan", -31.5375, -68.5364],
  ["San Luis", "San Luis", -33.295, -66.3356],
  ["Tucum\xE1n", "Tucum\xE1n", -26.8083, -65.2176],
  ["Salta", "Salta", -24.7821, -65.4232],
  ["Jujuy", "Jujuy", -24.1858, -65.2995],
  ["Santiago del Estero", "Santiago del Estero", -27.7951, -64.2615],
  ["Catamarca", "Catamarca", -28.4696, -65.7852],
  ["La Rioja", "La Rioja", -29.4131, -66.8558],
  ["Neuqu\xE9n", "Neuqu\xE9n", -38.9516, -68.0591],
  ["Bariloche", "R\xEDo Negro", -41.1335, -71.3103],
  ["Comodoro Rivadavia", "Chubut", -45.8641, -67.4966],
  ["Trelew", "Chubut", -43.2489, -65.3051],
  ["Ushuaia", "Tierra del Fuego", -54.8019, -68.303],
  ["R\xEDo Gallegos", "Santa Cruz", -51.623, -69.2168],
  ["Resistencia", "Chaco", -27.4606, -58.9839],
  ["Corrientes", "Corrientes", -27.4692, -58.8306],
  ["Posadas", "Misiones", -27.3671, -55.8961],
  ["Formosa", "Formosa", -26.1775, -58.1781],
  ["Santa Rosa", "La Pampa", -36.6167, -64.2833],
  ["Viedma", "R\xEDo Negro", -40.8135, -62.9967]
];
var AR_MID = [
  ["R\xEDo Cuarto", "C\xF3rdoba", -33.1232, -64.3493],
  ["Villa Carlos Paz", "C\xF3rdoba", -31.4241, -64.4978],
  ["Villa Mar\xEDa", "C\xF3rdoba", -32.4075, -63.2402],
  ["San Rafael", "Mendoza", -34.6177, -68.3301],
  ["Concordia", "Entre R\xEDos", -31.3929, -58.0209],
  ["Gualeguaych\xFA", "Entre R\xEDos", -33.0094, -58.5172],
  ["Olavarr\xEDa", "Buenos Aires", -36.8927, -60.3225],
  ["Tandil", "Buenos Aires", -37.3217, -59.1332],
  ["Jun\xEDn", "Buenos Aires", -34.5847, -60.9431],
  ["Pergamino", "Buenos Aires", -33.8895, -60.5736],
  ["Mercedes", "Buenos Aires", -34.6515, -59.4307],
  ["Luj\xE1n", "Buenos Aires", -34.5703, -59.105],
  ["Campana", "Buenos Aires", -34.1645, -58.9592],
  ["Z\xE1rate", "Buenos Aires", -34.0981, -59.0242],
  ["Necochea", "Buenos Aires", -38.5545, -58.7396],
  ["R\xEDo Grande", "Tierra del Fuego", -53.7877, -67.7095],
  ["Puerto Madryn", "Chubut", -42.7692, -65.0385],
  ["El Bols\xF3n", "R\xEDo Negro", -41.9627, -71.5326],
  ["San Mart\xEDn de los Andes", "Neuqu\xE9n", -40.1573, -71.3534]
];
var PAISES = {
  ES: {
    code: "ES",
    hl: "es",
    gl: "es",
    phonePrefix: "34",
    country: "Espana",
    queries: {
      growshops: ["growshop {ciudad}"],
      cbd_shops: ["tienda CBD {ciudad}"],
      asociaciones: ["asociacion cannabica club social cannabis {ciudad}"]
    },
    cities: [],
    // ES rota por AREAS en index.ts
    fuente: "",
    maxSearchesPerRun: 1e3,
    maxSearchesPerDay: 1e5,
    nameOnlyDedupe: false,
    scopedByPais: false
  },
  AR: {
    code: "AR",
    hl: "es",
    gl: "ar",
    phonePrefix: "54",
    country: "Argentina",
    queries: {
      growshops: ["growshop {ciudad}", "tienda de cultivo {ciudad}"],
      cbd_shops: ["tienda CBD {ciudad}", "aceite CBD {ciudad}"],
      asociaciones: ["club cann\xE1bico {ciudad}", "asociaci\xF3n civil cannabis {ciudad}", "club de cultivo {ciudad}"]
    },
    cities: [
      ...AR_HIGH.map(([name, provincia, lat, lon]) => ({ name, provincia, prio: "alta", lat, lon })),
      ...AR_MID.map(([name, provincia, lat, lon]) => ({ name, provincia, prio: "media", lat, lon }))
    ],
    fuente: "web_ar_2026",
    maxSearchesPerRun: 60,
    maxSearchesPerDay: 250,
    nameOnlyDedupe: true,
    scopedByPais: true,
    geo: {
      latMin: -55.2,
      latMax: -21.7,
      lonMin: -73.7,
      lonMax: -53.5,
      centroid: { lat: -38.42, lon: -63.62 },
      centroidKm: 5,
      maxCityKm: 60,
      countryWords: ["argentina"],
      regions: [
        "buenos aires",
        "catamarca",
        "chaco",
        "chubut",
        "cordoba",
        "corrientes",
        "entre rios",
        "formosa",
        "jujuy",
        "la pampa",
        "la rioja",
        "mendoza",
        "misiones",
        "neuquen",
        "rio negro",
        "salta",
        "san juan",
        "san luis",
        "santa cruz",
        "santa fe",
        "santiago del estero",
        "tierra del fuego",
        "tucuman"
      ],
      regionAliases: ["caba", "capital federal", "ciudad autonoma de buenos aires", "c.a.b.a"],
      tld: "ar"
    }
  },
  // Chile: la caja solapa con Argentina en la cordillera, asi que ademas se exige "Chile", una region chilena o +56.
  CL: {
    code: "CL",
    hl: "es",
    gl: "cl",
    phonePrefix: "56",
    country: "Chile",
    queries: {
      growshops: ["grow shop {ciudad} Chile", "tienda de cultivo {ciudad}"],
      cbd_shops: ["tienda CBD {ciudad}", "aceite CBD {ciudad}"],
      asociaciones: ["club cann\xE1bico {ciudad}", "fundaci\xF3n cannabis {ciudad}", "corporaci\xF3n cannabis {ciudad}"]
    },
    cities: toCities(CL_HIGH, CL_MID),
    fuente: "web_cl_2026",
    maxSearchesPerRun: 60,
    maxSearchesPerDay: 250,
    nameOnlyDedupe: true,
    scopedByPais: true,
    geo: {
      latMin: -56,
      latMax: -17.4,
      lonMin: -75.8,
      lonMax: -66,
      centroid: { lat: -35.68, lon: -71.54 },
      centroidKm: 5,
      maxCityKm: 60,
      countryWords: ["chile"],
      regions: PRUEBA_REGION_CL,
      regionAliases: PRUEBA_ALIAS_CL,
      cityProof: true,
      postalProof: /(^|\D)\d{7}(\D|$)/,
      // codigo postal chileno de 7 digitos (el argentino tiene 4 u 8 caracteres)
      tld: "cl"
    }
  },
  // Mexico: la caja solapa con EE. UU., Guatemala y Belice; se exige "Mexico", un estado o +52.
  MX: {
    code: "MX",
    hl: "es",
    gl: "mx",
    phonePrefix: "52",
    country: "M\xE9xico",
    queries: {
      growshops: ["grow shop {ciudad}", "tienda de cultivo {ciudad}"],
      cbd_shops: ["tienda CBD {ciudad}", "aceite CBD {ciudad}"],
      asociaciones: ["club cann\xE1bico {ciudad}", "asociaci\xF3n civil cannabis {ciudad}", "club de cultivo {ciudad}"]
    },
    cities: toCities(MX_HIGH, MX_MID),
    fuente: "web_mx_2026",
    maxSearchesPerRun: 60,
    maxSearchesPerDay: 250,
    nameOnlyDedupe: true,
    scopedByPais: true,
    geo: {
      latMin: 14.5,
      latMax: 32.75,
      lonMin: -118.5,
      lonMax: -86.7,
      centroid: { lat: 23.63, lon: -102.55 },
      centroidKm: 5,
      maxCityKm: 60,
      countryWords: ["mexico"],
      regions: PRUEBA_REGION_MX,
      regionAliases: PRUEBA_ALIAS_MX,
      cityProof: true,
      tld: "mx"
    }
  },
  // Colombia: la caja solapa con Venezuela, Ecuador, Peru, Brasil y Panama; se exige "Colombia", un departamento o +57.
  CO: {
    code: "CO",
    hl: "es",
    gl: "co",
    phonePrefix: "57",
    country: "Colombia",
    queries: {
      growshops: ["grow shop {ciudad}", "tienda de cultivo {ciudad}"],
      cbd_shops: ["tienda CBD {ciudad}", "aceite CBD {ciudad}"],
      asociaciones: ["club cann\xE1bico {ciudad}", "fundaci\xF3n cannabis {ciudad}", "corporaci\xF3n cannabis {ciudad}"]
    },
    cities: toCities(CO_HIGH, CO_MID),
    fuente: "web_co_2026",
    maxSearchesPerRun: 60,
    maxSearchesPerDay: 250,
    nameOnlyDedupe: true,
    scopedByPais: true,
    geo: {
      latMin: -4.3,
      latMax: 13.6,
      lonMin: -82,
      lonMax: -66.8,
      centroid: { lat: 4.57, lon: -74.3 },
      centroidKm: 5,
      maxCityKm: 60,
      countryWords: ["colombia"],
      regions: PRUEBA_REGION_CO,
      regionAliases: PRUEBA_ALIAS_CO,
      cityProof: true,
      cityProofNoRegion: true,
      tld: "co"
    }
  }
};
var EXTRA_PLACES = {
  escobar: { lat: -34.3486, lon: -58.7908 },
  "lomas del mirador": { lat: -34.6667, lon: -58.5333 }
};
function getPais(code) {
  const c = PAISES[(code ?? "ES").toUpperCase()];
  if (!c) throw new Error(`Pais no soportado: ${code}`);
  return c;
}
__name(getPais, "getPais");
var DRY_ENRICH_ROWS = 10;
var ENRICH_DEFAULT = { ES: 8, AR: 8, CL: 12, MX: 10, CO: 10 };
var DISCOVER_DEFAULT = { AR: 2, CL: 3, MX: 3, CO: 3 };
var enrichBatch = /* @__PURE__ */ __name((env2, code) => parseInt(env2[`${code}_ENRICH_BATCH`] || "", 10) || ENRICH_DEFAULT[code] || 10, "enrichBatch");
var discoverCities = /* @__PURE__ */ __name((env2, code) => parseInt(env2[`${code}_DISCOVER_CITIES`] || "", 10) || DISCOVER_DEFAULT[code] || 3, "discoverCities");

// src/geo.ts
function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
__name(haversineKm, "haversineKm");
function inBounds(g, lat, lon) {
  return lat >= g.latMin && lat <= g.latMax && lon >= g.lonMin && lon <= g.lonMax;
}
__name(inBounds, "inBounds");
function nearCentroid(g, lat, lon) {
  return haversineKm({ lat, lon }, g.centroid) <= g.centroidKm;
}
__name(nearCentroid, "nearCentroid");
function addressInCountry(g, address) {
  const a = normWords(address).replace(/[^a-z0-9. ]+/g, " ");
  const has = /* @__PURE__ */ __name((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/\./g, "\\.")}([^a-z0-9]|$)`).test(a), "has");
  return g.countryWords.some(has) || g.regions.some(has) || g.regionAliases.some(has) || !!g.postalProof?.test(a);
}
__name(addressInCountry, "addressInCountry");
function foreignPhone(cfg, raw) {
  const s = (raw ?? "").trim();
  if (!s) return false;
  const digits = s.replace(/\D/g, "");
  if (!digits) return false;
  if (s.startsWith("+") || digits.startsWith("00")) {
    const d = digits.replace(/^00/, "");
    return !d.startsWith(cfg.phonePrefix);
  }
  if (cfg.phonePrefix === "54") return !parseArPhone(s) && digits.length >= 11;
  if (hasPhonePlan(cfg.phonePrefix)) return !parsePhone(cfg.phonePrefix, s) && digits.length >= 11;
  return false;
}
__name(foreignPhone, "foreignPhone");
var hostOf = /* @__PURE__ */ __name((u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}, "hostOf");
function lastSegmentIsPlace(cfg, address) {
  const segs = address.split(",").map((x) => x.trim().replace(/^[A-Za-z]?\d{4,7}[A-Za-z]{0,3}\s+/, "")).filter(Boolean);
  const cityKeys = cfg.cities.map((c) => norm(c.name));
  const isCity = /* @__PURE__ */ __name((raw) => {
    const k = norm(raw);
    return !!k && cityKeys.some((c) => k === c || c.length >= 5 && k.startsWith(c));
  }, "isCity");
  const last = segs[segs.length - 1] ?? "";
  if (isCity(last) || isCity(segs[segs.length - 2] ?? "")) return true;
  if (cfg.geo?.cityProofNoRegion) return false;
  const region = normalizeProvincia(last);
  return !!region && cfg.cities.some((c) => c.provincia === region);
}
__name(lastSegmentIsPlace, "lastSegmentIsPlace");
function foreignReason(cfg, m) {
  const g = cfg.geo;
  if (!g) return null;
  const gps = m.gps_coordinates;
  if (gps && !inBounds(g, gps.latitude, gps.longitude)) return "coordenadas_fuera_del_pais";
  if (m.address && !addressInCountry(g, m.address) && !(g.cityProof && gps && lastSegmentIsPlace(cfg, m.address))) return "direccion_sin_pais";
  if (foreignPhone(cfg, m.phone)) return "telefono_extranjero";
  const proof = !!gps || !!m.address || !!m.phone || !!g.tld && hostOf(m.website).endsWith(`.${g.tld}`);
  return proof ? null : "sin_pruebas_de_pais";
}
__name(foreignReason, "foreignReason");
function cityRef(cfg, row) {
  const key = norm(row.ciudad);
  if (key) {
    const c = cfg.cities.find((x) => norm(x.name) === key || key === "caba" && norm(x.name) === "ciudaddebuenosaires");
    if (c?.lat !== void 0 && c.lon !== void 0) return { lat: c.lat, lon: c.lon };
    const extra = Object.entries(EXTRA_PLACES).find(([k]) => norm(k) === key);
    if (extra) return extra[1];
  }
  const g = cfg.geo;
  if (row.geo_aproximado === true && typeof row.lat === "number" && typeof row.lon === "number" && !(g && nearCentroid(g, row.lat, row.lon))) {
    return { lat: row.lat, lon: row.lon };
  }
  return null;
}
__name(cityRef, "cityRef");
function coordsRejection(cfg, m, ref2, needsRef) {
  const g = cfg.geo;
  const gps = m.gps_coordinates;
  if (!gps) return "sin_coordenadas";
  if (!hasStreetAddress(m.address)) return "sin_direccion_fisica";
  if (!g) return null;
  if (!inBounds(g, gps.latitude, gps.longitude)) return "coordenadas_fuera_del_pais";
  if (nearCentroid(g, gps.latitude, gps.longitude)) return "centroide_del_pais";
  if (needsRef) {
    if (!ref2) return "sin_referencia_de_ciudad";
    if (haversineKm({ lat: gps.latitude, lon: gps.longitude }, ref2) > g.maxCityKm) return "lejos_de_la_ciudad";
  }
  return null;
}
__name(coordsRejection, "coordsRejection");
var CABA_ALIASES = /* @__PURE__ */ new Set(["caba", "capitalfederal", "ciudadautonomadebuenosaires", "ciudadautonoma", "cdadautonomadebuenosaires", "ciudaddebuenosaires", "cabaargentina"]);
var isCabaAlias = /* @__PURE__ */ __name((s) => CABA_ALIASES.has(norm(s)), "isCabaAlias");
var CABA_CITY = "Ciudad de Buenos Aires";
function canonCity(c) {
  return isCabaAlias(c ?? "") ? CABA_CITY : (c ?? "").trim();
}
__name(canonCity, "canonCity");
function sameCity(a, b) {
  const x = norm(canonCity(a)), y = norm(canonCity(b));
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 5 && l.includes(s);
}
__name(sameCity, "sameCity");
var COUNTRY_SEGS = /* @__PURE__ */ new Set(["argentina", "chile", "mexico", "colombia"]);
function addressSegments(address) {
  let segs = (address ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (segs.length && COUNTRY_SEGS.has(norm(segs[segs.length - 1]))) segs.pop();
  let cabaHint = false;
  segs = segs.map((x) => {
    const m = x.match(/^([A-Za-z])?\d{4,7}[A-Za-z]{0,3}\s+(.*)$/);
    if (!m) return x;
    if (m[1]?.toUpperCase() === "C" && norm(m[2]) === "buenosaires") cabaHint = true;
    return m[2];
  });
  return { segs, cabaHint };
}
__name(addressSegments, "addressSegments");
function hasStreetAddress(address) {
  const { segs } = addressSegments(address);
  return segs.some((x) => /\d/.test(x) || /\b(av|avda|avenida|calle|ruta|pasaje|pje|psje|bv|bulevar|diagonal|camino|carrera|paseo|calzada|blvd|carretera)\b/i.test(x));
}
__name(hasStreetAddress, "hasStreetAddress");
var provinceOf = /* @__PURE__ */ __name((seg) => {
  const p = normalizeProvincia(seg);
  return p && REGIONES_CONOCIDAS.has(p) ? p : null;
}, "provinceOf");
function parseAddressPlace(cfg, address) {
  const { segs, cabaHint } = addressSegments(address);
  let ciudad = null, provincia = null;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (isCabaAlias(seg) || cabaHint && norm(seg) === "buenosaires") return { ciudad: CABA_CITY, provincia: "CABA" };
    if (/\d/.test(seg)) break;
    if (!provincia && i === segs.length - 1 && provinceOf(seg)) {
      provincia = provinceOf(seg);
      continue;
    }
    ciudad = seg;
    break;
  }
  if (!ciudad && provincia) ciudad = cfg.cities.find((c) => norm(c.name) === norm(provincia))?.name ?? null;
  if (ciudad) {
    const known = cfg.cities.find((c) => norm(c.name) === norm(ciudad));
    if (known) {
      ciudad = known.name;
      provincia ??= known.provincia;
    }
  }
  return { ciudad, provincia };
}
__name(parseAddressPlace, "parseAddressPlace");
function provinceCompatible(a, b) {
  const x = norm(normalizeProvincia(a)), y = norm(normalizeProvincia(b));
  if (!x || !y || x === y) return true;
  const bsas = /* @__PURE__ */ new Set(["caba", "buenosaires"]);
  return bsas.has(x) && bsas.has(y);
}
__name(provinceCompatible, "provinceCompatible");

// src/config.ts
function nameField(cfg) {
  return cfg.nameField || "nombre";
}
__name(nameField, "nameField");
function webField(cfg) {
  return cfg.webField || "web";
}
__name(webField, "webField");
function localityField(cfg) {
  return cfg.localityField || "ciudad";
}
__name(localityField, "localityField");
var ENTITY_CONFIGS = {
  growshops: {
    table: "growshops",
    label: "growshop (tienda de cultivo de cannabis)",
    selectColumns: [
      "id",
      "nombre",
      "direccion",
      "cp",
      "ciudad",
      "provincia",
      "ccaa",
      "web",
      "telefono",
      "email",
      "instagram",
      "facebook",
      "horario",
      "descripcion",
      "descripcion_tldr",
      "logo_url"
    ],
    enrichFields: [
      { name: "web", hint: "URL del sitio web oficial de la tienda (dominio propio, no una red social)." },
      { name: "telefono", hint: "Telefono de contacto en formato espanol (ej. +34 600 000 000 o 600000000)." },
      { name: "email", hint: "Email de contacto publico." },
      { name: "instagram", hint: "URL completa del perfil de Instagram oficial." },
      { name: "facebook", hint: "URL completa de la pagina de Facebook oficial." },
      { name: "horario", hint: "Horario de apertura en texto legible (ej. 'L-V 10:00-14:00 y 17:00-20:30, S 10:00-14:00')." },
      { name: "descripcion", hint: "1-2 frases factuales sobre la tienda basadas SOLO en el contexto aportado. Sin marketing inventado. null si no hay base." },
      { name: "descripcion_tldr", hint: "Resumen AEO de 2-3 frases, factual, destacando ubicacion, especialidad y servicios, compuesto a partir de los datos de la ficha (nombre, ciudad, direccion) y del contexto web. No inventes horarios ni precios concretos. Devuelve null solo si no hay ni nombre ni ciudad." }
    ]
  },
  cbd_shops: {
    table: "cbd_shops",
    label: "tienda de CBD (productos de cannabidiol al consumidor)",
    selectColumns: [
      "id",
      "nombre",
      "direccion",
      "cp",
      "ciudad",
      "provincia",
      "ccaa",
      "web",
      "telefono",
      "email",
      "instagram",
      "facebook",
      "horario",
      "descripcion",
      "descripcion_tldr",
      "logo_url"
    ],
    enrichFields: [
      { name: "web", hint: "URL del sitio web oficial de la tienda (dominio propio, no una red social)." },
      { name: "telefono", hint: "Telefono de contacto en formato espanol." },
      { name: "email", hint: "Email de contacto publico." },
      { name: "instagram", hint: "URL completa del perfil de Instagram oficial." },
      { name: "facebook", hint: "URL completa de la pagina de Facebook oficial." },
      { name: "horario", hint: "Horario de apertura en texto legible." },
      { name: "descripcion", hint: "1-2 frases factuales sobre la tienda de CBD basadas SOLO en el contexto aportado. Sin inventar. null si no hay base." },
      { name: "descripcion_tldr", hint: "Resumen AEO de 2-3 frases, factual, destacando ubicacion, especialidad y servicios de la tienda de CBD, compuesto a partir de los datos de la ficha (nombre, ciudad, direccion) y del contexto web. No inventes horarios ni precios. Devuelve null solo si no hay ni nombre ni ciudad." }
    ]
  },
  asociaciones: {
    table: "asociaciones",
    label: "asociacion / club social de cannabis (CSC)",
    selectColumns: [
      "id",
      "nombre",
      "direccion",
      "cp",
      "ciudad",
      "provincia",
      "ccaa",
      "web",
      "telefono",
      "email",
      "instagram",
      "horario",
      "descripcion",
      "descripcion_tldr",
      "logo_url"
    ],
    enrichFields: [
      { name: "web", hint: "URL del sitio web oficial del club (dominio propio, no una red social)." },
      { name: "telefono", hint: "Telefono de contacto en formato espanol." },
      { name: "email", hint: "Email de contacto publico." },
      { name: "instagram", hint: "URL completa del perfil de Instagram oficial." },
      { name: "horario", hint: "Horario de apertura en texto legible." },
      { name: "descripcion", hint: "1-2 frases factuales sobre el club basadas SOLO en el contexto aportado. Sin inventar. null si no hay base." },
      { name: "descripcion_tldr", hint: "Resumen AEO de 2-3 frases, factual, destacando ubicacion y caracter del club, compuesto a partir de los datos de la ficha (nombre, ciudad) y del contexto web. No inventes horarios, cuotas ni requisitos concretos. Devuelve null solo si no hay ni nombre ni ciudad." }
    ]
  },
  breeders: {
    table: "breeders",
    label: "breeder / banco de semillas de cannabis (marca)",
    nameField: "breeder_name",
    webField: "website",
    localityField: "pais_origen",
    queryKeywords: "banco de semillas seedbank breeder cannabis",
    selectColumns: [
      "id",
      "breeder_name",
      "pais_origen",
      "website",
      "instagram",
      "descripcion",
      "descripcion_tldr",
      "logo_url"
    ],
    enrichFields: [
      { name: "website", hint: "URL del sitio web oficial del banco de semillas (dominio propio, no una red social ni una tienda que lo revende)." },
      { name: "instagram", hint: "URL completa del perfil de Instagram oficial del breeder." },
      { name: "pais_origen", hint: "Pais de origen del breeder (ej. 'Espana', 'Paises Bajos'). null si no aparece." },
      { name: "descripcion", hint: "2-3 frases factuales sobre el breeder (historia, especialidad, geneticas conocidas) basadas SOLO en el contexto aportado. Sin inventar. null si no hay base." },
      { name: "descripcion_tldr", hint: "Resumen AEO de 2-3 frases, factual, destacando origen, trayectoria y geneticas destacadas del breeder, compuesto a partir de los datos de la ficha (nombre, pais) y del contexto web. No inventes premios ni fechas concretas. Devuelve null solo si no hay ni nombre." }
    ]
  },
  variedades: {
    table: "variedades",
    label: "variedad / genetica de cannabis (strain)",
    queryKeywords: "variedad cannabis strain genetica semilla",
    logo: false,
    // las variedades no tienen logo; las fotos son fase aparte
    extraFilter: "&image_url=not.is.null",
    // solo las que se publican (con foto)
    selectColumns: [
      "id",
      "nombre",
      "genetica",
      "tipo",
      "descripcion",
      "descripcion_tldr",
      "terpenos"
    ],
    enrichFields: [
      { name: "descripcion", hint: "2-3 frases factuales sobre la variedad (tipo, genetica/linaje, efecto y perfil general) basadas SOLO en el contexto aportado y datos_ficha. Sin inventar cifras de THC/CBD ni premios. null si no hay base." },
      { name: "descripcion_tldr", hint: "Resumen AEO de 2-3 frases, factual, destacando genetica, tipo y caracter de la variedad, compuesto a partir de datos_ficha (nombre, genetica, descripcion) y del contexto web. No inventes cifras concretas de THC/CBD ni dias de floracion. Devuelve null solo si no hay ni nombre." },
      { name: "terpenos", hint: "Perfil de terpenos/aromas dominantes en texto (ej. 'mirceno, limoneno; aromas citricos y a pino') SOLO si aparece claramente en el contexto. null si no hay base. No inventes." }
    ]
  }
};

// src/logo.ts
function domainOf2(url) {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
__name(domainOf2, "domainOf");
async function imageOk(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 7e3);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return false;
    const len = parseInt(res.headers.get("content-length") || "0", 10);
    if (len && len < 512) return false;
    return true;
  } catch {
    return false;
  }
}
__name(imageOk, "imageOk");
function absolutize(src, base) {
  try {
    return new URL(src, base.startsWith("http") ? base : `https://${base}`).toString();
  } catch {
    return null;
  }
}
__name(absolutize, "absolutize");
async function ogImage(web) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8e3);
    const res = await fetch(web.startsWith("http") ? web : `https://${web}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "CannabicultorDirectoryBot/0.1 (+https://cannabicultor.com)" }
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 6e4);
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]+href=["']([^"']+)["']/i
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const abs = absolutize(m[1], web);
        if (abs) return abs;
      }
    }
    return null;
  } catch {
    return null;
  }
}
__name(ogImage, "ogImage");
async function resolveLogo(web) {
  const domain2 = domainOf2(web);
  if (!domain2) return null;
  const clearbit = `https://logo.clearbit.com/${domain2}`;
  if (await imageOk(clearbit)) {
    return { value: clearbit, confidence: 0.7, source_url: clearbit };
  }
  const og = await ogImage(web);
  if (og && await imageOk(og)) {
    return { value: og, confidence: 0.6, source_url: og };
  }
  return null;
}
__name(resolveLogo, "resolveLogo");

// src/enrich-pais.ts
var MIN_MATCH = 0.8;
var AUTO_APPLY_MIN = 0.9;
var AGENT = "enrich_ar_v1";
var MIN_CONFIDENCE = 0.35;
var TABLES_PAIS = ["growshops", "asociaciones", "cbd_shops"];
var NO_WEB = /(facebook|instagram|linktr\.ee|mercadolibre|tiktok|wa\.me|whatsapp|google\.)/i;
function planFill(row, m, table3, cfg, homeInstagram) {
  const f = {};
  const skipped = [];
  const web = m.website && !NO_WEB.test(domainOf(m.website)) ? m.website.split("?")[0] : null;
  if (isEmpty(row.web) && web) f.web = web;
  if (isEmpty(row.instagram)) {
    const ig = instagramUrl(m.website && /instagram\.com/i.test(m.website) ? m.website : homeInstagram);
    if (ig) f.instagram = ig;
    else if (homeInstagram || m.website && /instagram\.com/i.test(m.website)) skipped.push("instagram:cuenta_generica");
  }
  if (isEmpty(row.telefono) && m.phone) f.telefono = normalizePhoneFor(cfg.phonePrefix, m.phone);
  if (isEmpty(row.direccion) && m.address) f.direccion = m.address;
  let geoReal = false;
  const geo = m.gps_coordinates;
  if (geo && (isEmpty(row.lat) || isEmpty(row.lon) || row.geo_aproximado === true)) {
    const why = coordsRejection(cfg, m, cityRef(cfg, row), !isEmpty(row.ciudad));
    if (why) skipped.push(`coordenadas:${why}`);
    else {
      f.lat = geo.latitude;
      f.lon = geo.longitude;
      geoReal = true;
    }
  }
  const h = horarioFrom(m.operating_hours);
  if (isEmpty(row.horario) && h) f.horario = h;
  if (table3 !== "asociaciones") {
    const g = mapsUrl(m.place_id);
    if (isEmpty(row.google_maps_url) && g) f.google_maps_url = g;
  }
  if (isEmpty(row.media_resenas) && typeof m.rating === "number") f.media_resenas = m.rating;
  if (isEmpty(row.num_resenas) && typeof m.reviews === "number") f.num_resenas = m.reviews;
  return { fields: f, geoReal, skipped };
}
__name(planFill, "planFill");
function planNormalize(row, cfg) {
  const p = {};
  if (row.pais !== cfg.code) p.pais = cfg.code;
  if (!isEmpty(row.telefono)) {
    const n = normalizePhoneFor(cfg.phonePrefix, row.telefono);
    if (n && n !== row.telefono && phoneDigits(n, cfg.phonePrefix) === phoneDigits(row.telefono, cfg.phonePrefix)) p.telefono = n;
  }
  const prov = normalizeProvincia(row.provincia);
  if (prov && prov !== row.provincia) p.provincia = prov;
  const provFinal = p.provincia ?? row.provincia;
  if (isEmpty(row.slug_provincia) && !isEmpty(provFinal)) p.slug_provincia = slugify(provFinal);
  if (isEmpty(row.slug_ciudad) && !isEmpty(row.ciudad)) p.slug_ciudad = slugify(row.ciudad);
  return p;
}
__name(planNormalize, "planNormalize");
var MAX_REJECTED_LOG = 3;
var NEAR_CONF_MAX = 0.6;
var EXACT_NAME = 0.9;
function cityVerdict(cfg, row, m, sim) {
  const place = parseAddressPlace(cfg, m.address);
  const rowProv = normalizeProvincia(row.provincia);
  const provDiffer = /* @__PURE__ */ __name((a, b) => !provinceCompatible(a, b), "provDiffer");
  if (!isEmpty(row.ciudad)) {
    if (place.ciudad) return sameCity(row.ciudad, place.ciudad) ? null : "ciudad_incoherente";
    if (place.provincia && rowProv && provDiffer(place.provincia, rowProv)) return "provincia_incoherente";
    if (sim >= EXACT_NAME) return null;
    const ref2 = cityRef(cfg, row), g = cfg.geo, gps = m.gps_coordinates;
    return ref2 && g && gps && haversineKm({ lat: gps.latitude, lon: gps.longitude }, ref2) <= g.maxCityKm ? null : "ciudad_no_verificable";
  }
  if (place.provincia && rowProv && provDiffer(place.provincia, rowProv)) return "provincia_incoherente";
  return null;
}
__name(cityVerdict, "cityVerdict");
function sharedDistinctive(cfg, row, m) {
  const place = parseAddressPlace(cfg, m.address);
  const skip = new Set(
    [row.ciudad, row.provincia, place.ciudad, place.provincia].flatMap((x) => normWords(x).split(/[^a-z0-9]+/).filter(Boolean))
  );
  const A = coreTokens(row.nombre).filter((t) => !skip.has(t)), B = coreTokens(m.title).filter((t) => !skip.has(t));
  return A.filter((t) => B.includes(t));
}
__name(sharedDistinctive, "sharedDistinctive");
function pickMatch(row, results, cfg) {
  let best = null;
  let near = null;
  const rejected = [];
  for (const m of results) {
    let sim = nameSimilarity(row.nombre, m.title);
    const rej = /* @__PURE__ */ __name((reason) => rejected.push({ title: m.title, reason, address: m.address ?? null, sim: Math.round(sim * 100) / 100 }), "rej");
    const foreign = foreignReason(cfg, m);
    if (foreign) {
      rej(foreign);
      continue;
    }
    let conf = sim;
    const rd = domainOf(row.web), md = domainOf(m.website);
    if (rd && md && rd === md) conf = Math.max(conf, 0.95);
    if (conf < MIN_MATCH) {
      if (sharedDistinctive(cfg, row, m).length && !cityVerdict(cfg, row, m, conf)) {
        const nc = Math.round(Math.min(NEAR_CONF_MAX, 0.3 + 0.3 * conf) * 100) / 100;
        if (!near || conf > near.sim) near = { m, conf: nc, near: true, sim: conf };
      } else rej("nombre_distinto");
      continue;
    }
    const why = cityVerdict(cfg, row, m, conf);
    if (why) {
      rej(why);
      continue;
    }
    if (!best || conf > best.conf) best = { m, conf };
  }
  rejected.sort((a, b) => b.sim - a.sim);
  return { best: best ?? (near ? { m: near.m, conf: near.conf, near: true } : null), rejected: rejected.slice(0, MAX_REJECTED_LOG) };
}
__name(pickMatch, "pickMatch");
function priority(r) {
  return (isEmpty(r.ciudad) ? 0 : 4) + (isEmpty(r.web) ? 2 : 0) + (isEmpty(r.instagram) ? 1 : 0);
}
__name(priority, "priority");
var TABLE_ORDER = ["growshops", "cbd_shops", "asociaciones"];
function selectBatch(perTable, limit) {
  const queues = perTable.map(({ table: table3, rows }) => ({
    table: table3,
    rows: [...rows].sort((a, b) => priority(b) - priority(a) || a.id - b.id)
  }));
  const out = [];
  while (out.length < limit && queues.some((q) => q.rows.length)) {
    for (const q of queues) {
      const row = q.rows.shift();
      if (row && out.length < limit) out.push({ table: q.table, row });
    }
  }
  return out;
}
__name(selectBatch, "selectBatch");
async function fillFromMaps(env2, cfg, table3, row, m, conf, opts) {
  const locked = await lockedFields(env2, table3, row.id);
  const homeUrl = row.web || (m.website && !NO_WEB.test(domainOf(m.website)) ? m.website : null);
  const homeIg = isEmpty(row.instagram) && homeUrl ? findInstagram(await fetchHomepageHtml(homeUrl), row.nombre) : null;
  const plan = planFill(row, m, table3, cfg, homeIg);
  for (const k of Object.keys(plan.fields)) if (locked.has(k)) delete plan.fields[k];
  const names = Object.keys(plan.fields);
  const c = Math.round(conf * 100) / 100;
  if (names.length === 0) return { action: "sin_huecos", fields: {}, proposals: 0, skipped: plan.skipped };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (conf >= Math.max(opts.autoMin, AUTO_APPLY_MIN)) {
    if (!opts.dry) {
      const patch = { ...plan.fields, updated_at: now };
      if (plan.geoReal && plan.fields.lat !== void 0) patch.geo_aproximado = false;
      const srcs = Array.isArray(row.verification_sources) ? row.verification_sources : [];
      patch.verification_sources = [...srcs, {
        source: "google_maps",
        via: placesKey(env2) && String(env2.MAPS_PROVIDER || "").toLowerCase() !== "serpapi" ? "google_places" : "serpapi",
        agent: AGENT,
        place_id: m.place_id ?? null,
        fields: names,
        confidence: c,
        at: now
      }];
      Object.assign(patch, planNormalize({ ...row, ...plan.fields }, cfg));
      await restPatch(env2, `${table3}?id=eq.${row.id}`, patch);
    }
    return { action: "aplicar", fields: plan.fields, proposals: 0, skipped: plan.skipped };
  }
  let proposals = 0;
  if (!opts.dry) {
    const pending = await pendingFields(env2, table3, row.id);
    const props = names.filter((n) => !pending.has(n)).map((n) => ({
      entity_table: table3,
      entity_id: row.id,
      field_name: n,
      current_value: null,
      proposed_value: String(plan.fields[n]),
      source_url: mapsUrl(m.place_id),
      confidence: c,
      evidence: { query: opts.query, place_id: m.place_id ?? null, title: m.title, ...opts.near ? { near_match: true } : {}, geo_real: plan.geoReal && (n === "lat" || n === "lon") },
      agent: AGENT
    }));
    await restPost(env2, "field_proposals", props, "return=minimal,resolution=ignore-duplicates");
    proposals = props.length;
  }
  return { action: "revision", fields: plan.fields, proposals, skipped: plan.skipped };
}
__name(fillFromMaps, "fillFromMaps");
async function enrichPais(env2, cfg, budget, opts) {
  const sum = { pais: cfg.code, dry: opts.dry, scanned: 0, applied: 0, proposals: 0, items: [], errors: [] };
  const autoMin = parseFloat(env2.AUTO_APPROVE_MIN || "0.85");
  const cutoff = new Date(Date.now() - parseInt(env2.REATTEMPT_DAYS || "30", 10) * 864e5).toISOString();
  const tables = (opts.tables ?? (env2.ENTITY_TABLES || "").split(",").map((s) => s.trim())).filter((t) => TABLES_PAIS.includes(t));
  const batch = selectBatch(
    await Promise.all(TABLE_ORDER.filter((t) => tables.includes(t)).map(async (table3) => ({
      table: table3,
      rows: await restGet(
        env2,
        `${table3}?select=*&pais=eq.${cfg.code}&or=(enrich_attempted_at.is.null,enrich_attempted_at.lt.${cutoff})&limit=1000`
      )
    }))),
    opts.limit
  );
  for (const { table: table3, row } of batch) {
    sum.scanned++;
    const place = row.ciudad || row.provincia || "";
    const query = `${row.nombre} ${place} ${cfg.country}`.replace(/\s+/g, " ").trim();
    const item = { table: table3, id: row.id, nombre: row.nombre, query, match: null, conf: 0, action: "sin_coincidencia", fields: {} };
    try {
      if (!budget.take()) {
        item.action = "sin_presupuesto";
        sum.items.push(item);
        break;
      }
      const { best: match, rejected } = pickMatch(row, await serpMaps(env2, query, cfg, { ll: cityRef(cfg, row), level: "enterprise" }), cfg);
      item.rejected = rejected;
      let applied = false;
      if (match) {
        item.match = match.m.title;
        item.conf = Math.round(match.conf * 100) / 100;
        const r = await fillFromMaps(env2, cfg, table3, row, match.m, match.conf, { autoMin, dry: opts.dry, query, near: match.near });
        item.near = !!match.near;
        item.action = r.action;
        item.fields = r.fields;
        item.skipped = r.skipped;
        if (r.action === "aplicar") {
          sum.applied++;
          applied = true;
        }
        sum.proposals += r.proposals;
      }
      if (!opts.dry && ENTITY_CONFIGS[table3]?.logo !== false && isEmpty(row.logo_url)) {
        const logoWeb = row.web || (match?.m?.website && !NO_WEB.test(domainOf(match.m.website)) ? match.m.website : null);
        if (logoWeb) {
          const [lk, pd] = await Promise.all([lockedFields(env2, table3, row.id), pendingFields(env2, table3, row.id)]);
          if (!lk.has("logo_url") && !pd.has("logo_url")) {
            const logo = await resolveLogo(logoWeb);
            if (logo && logo.confidence >= MIN_CONFIDENCE) {
              await restPost(env2, "field_proposals", [{
                entity_table: table3,
                entity_id: row.id,
                field_name: "logo_url",
                current_value: null,
                proposed_value: logo.value,
                source_url: logo.source_url,
                confidence: logo.confidence,
                evidence: { source: "logo_resolver", web: logoWeb },
                agent: AGENT
              }], "return=minimal,resolution=ignore-duplicates");
            }
          }
        }
      }
      if (!opts.dry) {
        const fmt = applied ? {} : planNormalize(row, cfg);
        await restPatch(env2, `${table3}?id=eq.${row.id}`, { ...fmt, enrich_attempted_at: (/* @__PURE__ */ new Date()).toISOString() });
      }
    } catch (err) {
      if (err?.budget) {
        item.action = "sin_presupuesto_mensual";
        sum.items.push(item);
        break;
      }
      sum.errors.push(`${table3}#${row.id}: ${String(err?.message ?? err)}`);
    }
    sum.items.push(item);
  }
  await commitBudget(env2, budget);
  return sum;
}
__name(enrichPais, "enrichPais");

// src/discover.ts
var KEYWORD = {
  growshops: "growshop",
  // barrido grow (puede arrastrar CBD -> se reclasifica)
  cbd_shops: "tienda CBD",
  // barrido CBD
  asociaciones: "asociacion cannabica club social cannabis"
};
var GROW_RE = /grow|cultivo|semilla|sustrato|hidropon|fertiliz/;
var CBD_RE = /\bcbd\b|cannabidiol|cannabidi/;
function classify(title2, _type, sweep) {
  if (sweep === "asociaciones") return { vertical: "asociaciones", needsReview: false };
  const name = normWords(title2);
  const isGrow = GROW_RE.test(name);
  const isCbd = CBD_RE.test(name);
  if (isGrow) return { vertical: "growshops", needsReview: false };
  if (isCbd) return { vertical: "cbd_shops", needsReview: false };
  return { vertical: sweep === "cbd_shops" ? "cbd_shops" : "growshops", needsReview: true };
}
__name(classify, "classify");
async function loadExisting(env2, table3, area) {
  const rows = await restGet(
    env2,
    `${table3}?select=nombre,web,telefono&ciudad=ilike.*${encodeURIComponent(area)}*&limit=3000`
  );
  return {
    names: new Set(rows.map((r) => norm(r.nombre))),
    phones: new Set(rows.map((r) => phoneDigits(r.telefono)).filter(Boolean)),
    domains: new Set(rows.map((r) => domainOf(r.web)).filter(Boolean))
  };
}
__name(loadExisting, "loadExisting");
async function discoverArea(env2, sweep, area, opts = {}) {
  const cfg = getPais(opts.pais);
  if (cfg.code === "ES") return discoverAreaLegacy(env2, sweep, area);
  return discoverAreaPais(env2, cfg, sweep, area, opts);
}
__name(discoverArea, "discoverArea");
var PAIS_TABLES = ["growshops", "asociaciones", "cbd_shops"];
var V_ASOC = /\b(club|asociaci\w*|ong|fundaci\w*|corporaci\w*|cooperativa|colectivo|social club)\b/;
var V_GROW = /grow|cultivo|semilla|sustrato|hidropon|fertiliz|indoor|distribuidora|insumos/;
var V_CBD = /\bcbd\b|cannabidiol|aceite|suplement\w*|productos naturales/;
var V_WEAK = /vivero|tabaquer\w*|dietetic\w*|herbolar\w*|jardiner\w*/;
var T_ASOC = /club|asociaci|organizaci|fundaci|corporaci|sin fines/;
var T_GROW = /grow|cultivo|jardin|vivero|hidropon|agr[ií]cola|art[ií]culos de jardiner/;
var T_CBD = /diet[eé]tica|herbolar|suplement|productos naturales|farmacia|salud/;
function classifyAR(title2, tipo) {
  const n = normWords(title2), t = normWords(tipo);
  const pick = /* @__PURE__ */ __name((a, g, c) => [a && "asociaciones", g && "growshops", c && "cbd_shops"].filter(Boolean), "pick");
  if (V_WEAK.test(n) && !V_GROW.test(n) && !V_ASOC.test(n) && !/\bcbd\b|cannabidiol/.test(n)) return { vertical: "revisar", needsReview: true };
  const byName = pick(V_ASOC.test(n), V_GROW.test(n), V_CBD.test(n));
  const byType = pick(T_ASOC.test(t), T_GROW.test(t), T_CBD.test(t));
  let vertical = "";
  if (byName.length) {
    vertical = ["asociaciones", "growshops", "cbd_shops"].find((v) => byName.includes(v));
    if (byType.length && !byType.includes(vertical)) return { vertical: "revisar", needsReview: true };
  } else if (byType.length === 1) vertical = byType[0];
  else return { vertical: "revisar", needsReview: true };
  return { vertical, needsReview: false };
}
__name(classifyAR, "classifyAR");
var newRunIndex = /* @__PURE__ */ __name(() => ({ entries: [], built: false }), "newRunIndex");
function entryFromRow(table3, r, prefix) {
  return {
    source: "row",
    table: table3,
    id: r.id,
    nombre: r.nombre,
    skey: dedupeKey(r.nombre),
    tk: nameTokens(r.nombre),
    ciudad: norm(r.ciudad),
    provincia: norm(normalizeProvincia(r.provincia)),
    phone: phoneDigits(r.telefono, prefix),
    domain: domainOf(r.web),
    place_id: "",
    canon: norm(r.nombre) + "|" + norm(r.ciudad),
    fuente: r.fuente,
    row: r
  };
}
__name(entryFromRow, "entryFromRow");
async function buildRunIndex(env2, cfg, run) {
  if (run.built) return;
  for (const t of PAIS_TABLES) {
    const rows = await restGet(env2, `${t}?select=*&pais=eq.${cfg.code}&limit=5000`);
    for (const r of rows) run.entries.push(entryFromRow(t, r, cfg.phonePrefix));
  }
  const queued = await restGet(
    env2,
    `directory_candidates?select=id,entity_table,candidate,identity_keys,status&candidate->>pais=eq.${cfg.code}&status=in.(pending_review,approved,rejected)&limit=5000`
  );
  for (const q of queued) {
    const k = q.identity_keys ?? {}, c = q.candidate ?? {};
    run.entries.push({
      source: "queued",
      table: q.entity_table,
      id: q.id,
      nombre: c.nombre ?? "",
      skey: dedupeKey(c.nombre),
      tk: nameTokens(c.nombre),
      ciudad: norm(c.ciudad),
      provincia: norm(normalizeProvincia(c.provincia)),
      phone: k.phone ?? "",
      domain: k.domain ?? "",
      place_id: k.place_id ?? "",
      canon: k.canon ?? ""
    });
  }
  run.built = true;
}
__name(buildRunIndex, "buildRunIndex");
function sameArea(e, p) {
  const area = norm(p.area);
  if (!e.ciudad) return provinceCompatible(e.provincia, p.provincia);
  if (e.ciudad === area) return true;
  return !!p.address && norm(p.address).includes(e.ciudad);
}
__name(sameArea, "sameArea");
var TRIGRAM_STRONG = 0.6;
var TRIGRAM_WEAK = 0.4;
function findDuplicate(entries, p) {
  let best = null;
  const take = /* @__PURE__ */ __name((entry, level, by, sim) => {
    const rank = (level === "strong" ? 10 : 0) + sim;
    if (!best || rank > best.rank) best = { entry, level, by, sim, rank };
  }, "take");
  for (const e of entries) {
    if (p.place_id && e.place_id === p.place_id) {
      take(e, "strong", "place_id", 1);
      continue;
    }
    if (p.phone && e.phone === p.phone) {
      take(e, "strong", "phone", 1);
      continue;
    }
    if (p.domain && e.domain === p.domain) {
      take(e, "strong", "domain", 1);
      continue;
    }
    if (p.canon && e.canon === p.canon) {
      take(e, "strong", "canon", 1);
      continue;
    }
    if (!sameArea(e, p)) continue;
    if (e.skey && e.skey === p.skey) {
      take(e, "strong", "name", 1);
      continue;
    }
    const tri = trigramSim(e.tk, p.tk);
    if (tri >= TRIGRAM_STRONG) take(e, "strong", "trigram", tri);
    else if (tri >= TRIGRAM_WEAK) take(e, "weak", "trigram", tri);
    else if (tokenSubset(e.nombre, p.nombre)) take(e, "weak", "trigram", Math.max(tri, 0.5));
  }
  return best;
}
__name(findDuplicate, "findDuplicate");
var DUP_CONF = { place_id: 0.95, phone: 0.95, domain: 0.95, canon: 0.95, name: 0.85, trigram: 0.85 };
async function discoverAreaPais(env2, cfg, sweep, area, opts) {
  const templates = cfg.queries[sweep];
  if (!templates) throw new Error(`Barrido no soportado: ${sweep}`);
  const dry = !!opts.dry;
  const autoMin = opts.autoMin ?? 0.85;
  const summary = {
    sweep,
    area,
    found: 0,
    duplicates: 0,
    candidatesCreated: 0,
    byVertical: {},
    errors: [],
    dry,
    wouldCreate: [],
    enrichedExisting: 0,
    searches: 0,
    capped: false,
    discarded: { junk: 0, foreign: 0, samples: [] },
    flaggedDuplicates: 0
  };
  const areaRef = cityRef(cfg, { ciudad: area });
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of templates) {
    if (opts.budget && !opts.budget.take()) {
      summary.capped = true;
      break;
    }
    let query = t.replace("{ciudad}", area);
    if (cfg.geo && !normWords(query).includes(normWords(cfg.country))) query += ` ${cfg.country}`;
    summary.searches++;
    for (const r of await serpMaps(env2, query, cfg, { ll: areaRef })) {
      const k = r.place_id || norm(r.title);
      if (seen.has(k)) continue;
      seen.add(k);
      results.push({ ...r, _query: query });
    }
  }
  summary.found = results.length;
  if (results.length === 0) return summary;
  const run = opts.run ??= newRunIndex();
  await buildRunIndex(env2, cfg, run);
  const sweepProvincia = normalizeProvincia(opts.provincia);
  const rows = [];
  const rowEntries = [];
  for (const raw of results) {
    try {
      const title2 = cleanName(raw.title);
      if (isJunkName(title2, raw.title)) {
        summary.discarded.junk++;
        summary.discarded.samples.push(`${raw.title}: basura`);
        continue;
      }
      const foreign = foreignReason(cfg, raw);
      if (foreign) {
        summary.discarded.foreign++;
        summary.discarded.samples.push(`${raw.title}: ${foreign} [${raw.address ?? "sin direccion"}]`);
        continue;
      }
      const r = { ...raw, title: title2 };
      const place = parseAddressPlace(cfg, r.address);
      const ciudad = place.ciudad ?? area;
      const provincia = normalizeProvincia(
        place.provincia ?? cfg.cities.find((c) => norm(c.name) === norm(ciudad))?.provincia ?? (place.ciudad ? null : sweepProvincia)
      );
      const keys = identityKeys({ title: title2, area: ciudad, phone: r.phone, website: r.website, place_id: r.place_id }, cfg.phonePrefix);
      const probe = {
        nombre: title2,
        skey: dedupeKey(title2),
        tk: nameTokens(title2),
        area: ciudad,
        provincia,
        address: r.address,
        phone: keys.phone ?? "",
        domain: keys.domain ?? "",
        place_id: keys.place_id ?? "",
        canon: keys.canon
      };
      const dup = findDuplicate(run.entries, probe);
      if (dup && dup.level === "strong") {
        summary.duplicates++;
        const e = dup.entry;
        const solid = dup.by !== "name" && dup.by !== "trigram";
        if (e.source === "row" && e.fuente === cfg.fuente && e.row && (solid || nameSimilarity(e.nombre, title2) >= 0.8)) {
          const res = await fillFromMaps(env2, cfg, e.table, e.row, r, DUP_CONF[dup.by], { autoMin, dry, query: r._query });
          if (res.action === "aplicar" || res.action === "revision") summary.enrichedExisting++;
          if (!dry) {
            if (res.action === "aplicar") Object.assign(e.row, res.fields);
            await restPatch(env2, `${e.table}?id=eq.${e.id}`, { enrich_attempted_at: (/* @__PURE__ */ new Date()).toISOString() });
          }
        }
        continue;
      }
      const cls = classifyAR(title2, r.type);
      const longToken = hasLongToken(title2);
      if (longToken) cls.needsReview = true;
      const entityTable = cls.vertical === "revisar" ? sweep === "asociaciones" ? "asociaciones" : sweep === "cbd_shops" ? "cbd_shops" : "growshops" : cls.vertical;
      const geoWhy = coordsRejection(cfg, r, cityRef(cfg, { ciudad }) ?? areaRef, true);
      const lat = geoWhy ? null : r.gps_coordinates.latitude, lon = geoWhy ? null : r.gps_coordinates.longitude;
      const flagged = dup && dup.level === "weak" ? dup : null;
      if (flagged) summary.flaggedDuplicates++;
      const entry = {
        source: "run",
        table: entityTable,
        nombre: title2,
        skey: probe.skey,
        tk: probe.tk,
        ciudad: norm(ciudad),
        provincia: norm(provincia),
        phone: probe.phone,
        domain: probe.domain,
        place_id: probe.place_id,
        canon: keys.canon
      };
      run.entries.push(entry);
      rowEntries.push(entry);
      summary.byVertical[entityTable] = (summary.byVertical[entityTable] ?? 0) + 1;
      summary.wouldCreate.push({ nombre: title2, vertical: cls.vertical });
      rows.push({
        entity_table: entityTable,
        candidate: {
          nombre: title2,
          direccion: r.address ?? null,
          ciudad,
          provincia,
          pais: cfg.code,
          ciudad_barrido: area,
          telefono: normalizePhoneFor(cfg.phonePrefix, r.phone),
          web: r.website ?? null,
          lat,
          lon,
          geo_aproximado: false,
          geo_descartado: geoWhy,
          google_maps_url: mapsUrl(r.place_id),
          horario: horarioFrom(r.operating_hours),
          rating: r.rating ?? null,
          num_resenas: r.reviews ?? null,
          tipo_maps: r.type ?? null,
          suggested_vertical: cls.vertical,
          needs_review: cls.needsReview,
          ...longToken ? { review_reason: "usuario_instagram_en_nombre" } : {}
        },
        evidence: { engine: "google_maps", source: "serpapi", query: r._query, place_id: r.place_id ?? null, pais: cfg.code },
        identity_keys: keys,
        // Todo lo descubierto en AR entra SIEMPRE en pending_review: sin autoaprobacion, sea cual sea la confianza.
        status: "pending_review",
        // Siempre las mismas claves (PostgREST exige lotes homogeneos).
        duplicate_entity_id: flagged && flagged.entry.source === "row" ? flagged.entry.id : null,
        duplicate_reason: flagged ? `${flagged.by === "trigram" ? "nombre_similar" : flagged.by} ${flagged.sim.toFixed(2)} \xB7 ${flagged.entry.source === "row" ? `ficha existente ${flagged.entry.table}#${flagged.entry.id}` : `candidato ${flagged.entry.source}`} "${flagged.entry.nombre}"` : null
      });
    } catch (err) {
      summary.errors.push(`${raw.title}: ${String(err?.message ?? err)}`);
    }
  }
  if (rows.length && !dry) {
    const w = await restPostResilient(env2, "directory_candidates", rows, "return=minimal");
    summary.candidatesCreated = w.written;
    if (w.batchRetried) summary.batchRetried = true;
    if (w.failed) {
      summary.writeFailed = { count: w.failed, firstError: w.firstError ?? "error desconocido" };
      summary.errors.push(`escritura: ${w.failed} candidato(s) perdidos: ${w.firstError}`);
      const lost = new Set(w.failedIdx.map((i) => rowEntries[i]));
      run.entries = run.entries.filter((e) => !lost.has(e));
    }
  }
  return summary;
}
__name(discoverAreaPais, "discoverAreaPais");
async function discoverAreaLegacy(env2, sweep, area) {
  const keyword = KEYWORD[sweep];
  if (!keyword) throw new Error(`Barrido no soportado: ${sweep}`);
  const summary = {
    sweep,
    area,
    found: 0,
    duplicates: 0,
    candidatesCreated: 0,
    byVertical: {},
    errors: []
  };
  const results = await serpMaps(env2, `${keyword} ${area}`, getPais("ES"));
  summary.found = results.length;
  if (results.length === 0) return summary;
  const verticals = sweep === "asociaciones" ? ["asociaciones"] : ["growshops", "cbd_shops"];
  const existing = {};
  for (const v of verticals) existing[v] = await loadExisting(env2, v, area);
  const queued = await restGet(
    env2,
    `directory_candidates?select=entity_table,identity_keys&entity_table=in.(${verticals.join(",")})&status=in.(pending_review,approved)&limit=5000`
  );
  const queuedCanon = new Set(queued.map((r) => r.entity_table + "|" + (r.identity_keys?.canon ?? "")));
  const rows = [];
  for (const r of results) {
    const { vertical, needsReview } = classify(r.title, r.type, sweep);
    const canon = norm(r.title) + "|" + norm(area);
    const phone = phoneDigits(r.phone);
    const domain2 = domainOf(r.website);
    const idx = existing[vertical];
    const isDup = idx.names.has(norm(r.title)) || phone && idx.phones.has(phone) || domain2 && idx.domains.has(domain2) || queuedCanon.has(vertical + "|" + canon);
    if (isDup) {
      summary.duplicates++;
      continue;
    }
    queuedCanon.add(vertical + "|" + canon);
    summary.byVertical[vertical] = (summary.byVertical[vertical] ?? 0) + 1;
    rows.push({
      entity_table: vertical,
      candidate: {
        nombre: r.title,
        direccion: r.address ?? null,
        ciudad: area,
        provincia: null,
        telefono: r.phone ?? null,
        web: r.website ?? null,
        lat: r.gps_coordinates?.latitude ?? null,
        lon: r.gps_coordinates?.longitude ?? null,
        rating: r.rating ?? null,
        num_resenas: r.reviews ?? null,
        tipo_maps: r.type ?? null,
        suggested_vertical: needsReview ? "revisar" : vertical,
        needs_review: needsReview
      },
      evidence: { engine: "google_maps", source: "serpapi", query: `${keyword} ${area}`, place_id: r.place_id ?? null },
      identity_keys: { canon, phone: phone || null, domain: domain2 || null, place_id: r.place_id ?? null },
      status: "pending_review"
    });
  }
  if (rows.length) {
    await restPost(env2, "directory_candidates", rows, "return=minimal");
    summary.candidatesCreated = rows.length;
  }
  return summary;
}
__name(discoverAreaLegacy, "discoverAreaLegacy");

// src/extract.ts
var DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
async function extractFields(env2, cfg, entity, ctx, onlyFields) {
  const fieldSpec = cfg.enrichFields.filter((f) => onlyFields.includes(f.name)).map((f) => `- "${f.name}": ${f.hint}`).join("\n");
  const system = [
    "Eres un extractor de datos para un directorio de negocios de cannabis en Espana.",
    "Devuelves UNICAMENTE JSON valido, sin texto adicional.",
    "Para cada campo pedido devuelves un objeto {value, confidence, source_url}.",
    "- value: el dato extraido como string, o null si NO aparece en el contexto.",
    "- confidence: numero 0..1 segun lo seguro que estes de que el dato corresponde a ESTE negocio concreto.",
    "- source_url: la URL del contexto de donde sale el dato, o null.",
    "REGLA CRITICA: si el dato no esta claramente en el contexto o en datos_ficha, devuelve value=null. Nunca inventes ni adivines.",
    "Para campos de resumen (descripcion, descripcion_tldr) SI puedes redactar/componer a partir de datos_ficha (sobre todo su 'descripcion') y del contexto_web; usa source_url del contexto si aplica, o null. No introduzcas hechos nuevos que no esten en esos datos.",
    "Verifica que el negocio del contexto coincide en nombre y ciudad con el que se pide; si dudas, baja la confidence."
  ].join("\n");
  const user = {
    negocio: {
      tipo: cfg.label,
      nombre: entity[nameField(cfg)],
      ciudad: entity[localityField(cfg)],
      provincia: entity.provincia,
      direccion: entity.direccion
    },
    campos_a_extraer: fieldSpec,
    // Datos que la ficha YA tiene (fuente fiable). Sirven para componer resumenes
    // como descripcion_tldr sin depender solo de la busqueda web.
    datos_ficha: {
      descripcion: entity.descripcion || null,
      web: entity[webField(cfg)] || null,
      instagram: entity.instagram || null,
      genetica: entity.genetica || null,
      tipo: entity.tipo || null
    },
    contexto_web: {
      knowledge_graph: ctx.knowledgeGraph,
      resultados: ctx.organic,
      home_oficial: ctx.homepage
    },
    formato_salida: "Objeto JSON con una clave por cada campo pedido, cada una {value, confidence, source_url}."
  };
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env2.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ]
    })
  });
  if (!res.ok) {
    throw new Error(`DeepSeek -> ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const out = {};
  for (const f of onlyFields) {
    const v = parsed[f];
    if (v && typeof v === "object") {
      out[f] = {
        value: typeof v.value === "string" && v.value.trim() ? v.value.trim() : null,
        confidence: typeof v.confidence === "number" ? Math.max(0, Math.min(1, v.confidence)) : 0,
        source_url: typeof v.source_url === "string" ? v.source_url : null
      };
    }
  }
  return out;
}
__name(extractFields, "extractFields");

// src/enrich.ts
var MIN_CONFIDENCE2 = 0.35;
function isEmpty2(v) {
  return v === null || v === void 0 || typeof v === "string" && v.trim() === "";
}
__name(isEmpty2, "isEmpty");
function buildQuery(cfg, e) {
  const bits = [e[nameField(cfg)], e.direccion, e[localityField(cfg)], e.provincia].filter(Boolean);
  const kw = cfg.queryKeywords || (cfg.table === "asociaciones" ? "asociacion cannabica club" : cfg.table === "cbd_shops" ? "tienda cbd" : "growshop");
  return `${bits.join(" ")} ${kw}`.trim();
}
__name(buildQuery, "buildQuery");
async function enrichTable(env2, tableKey, limit) {
  const cfg = ENTITY_CONFIGS[tableKey];
  if (!cfg) throw new Error(`Tabla no configurada: ${tableKey}`);
  const summary = { table: tableKey, scanned: 0, proposalsCreated: 0, errors: [] };
  const reattemptDays = parseInt(env2.REATTEMPT_DAYS || "30", 10);
  const cutoff = new Date(Date.now() - reattemptDays * 864e5).toISOString();
  const gapCols = cfg.enrichFields.map((f) => `${f.name}.is.null`).join(",");
  const select = cfg.selectColumns.join(",");
  const filter = `select=${select}&and=(or(${gapCols}),or(enrich_attempted_at.is.null,enrich_attempted_at.lt.${cutoff}))` + (cfg.extraFilter || "") + `&order=enrich_attempted_at.asc.nullsfirst&limit=${limit}`;
  const rows = await restGet(env2, `${cfg.table}?${filter}`);
  for (const e of rows) {
    summary.scanned++;
    try {
      const emptyFields = cfg.enrichFields.map((f) => f.name).filter((name) => isEmpty2(e[name]));
      const [locked, pending] = await Promise.all([
        lockedFields(env2, cfg.table, e.id),
        pendingFields(env2, cfg.table, e.id)
      ]);
      const targetFields = emptyFields.filter((f) => !locked.has(f) && !pending.has(f));
      const wantLogo = cfg.logo !== false && isEmpty2(e.logo_url) && !locked.has("logo_url") && !pending.has("logo_url");
      if (targetFields.length === 0 && !wantLogo) {
        await markAttempted(env2, cfg.table, e.id);
        continue;
      }
      const query = buildQuery(cfg, e);
      const ctx = await serpSearch(env2, query);
      const ownWeb = e[webField(cfg)];
      const homeUrl = typeof ownWeb === "string" && ownWeb || ctx.knowledgeGraph?.website || ctx.organic[0]?.link || null;
      if (homeUrl) ctx.homepage = await fetchHomepage(homeUrl);
      const proposals = [];
      if (targetFields.length) {
        const extraction = await extractFields(env2, cfg, e, ctx, targetFields);
        for (const field of targetFields) {
          const ex = extraction[field];
          if (!ex || ex.value === null || ex.confidence < MIN_CONFIDENCE2) continue;
          proposals.push({
            entity_table: cfg.table,
            entity_id: e.id,
            field_name: field,
            current_value: isEmpty2(e[field]) ? null : String(e[field]),
            proposed_value: ex.value,
            source_url: ex.source_url,
            confidence: ex.confidence,
            evidence: { query, source_url: ex.source_url, kg: !!ctx.knowledgeGraph },
            agent: "enrich_v1"
          });
        }
      }
      if (wantLogo) {
        const logoWeb = typeof ownWeb === "string" && ownWeb || ctx.knowledgeGraph?.website || null;
        if (logoWeb) {
          const logo = await resolveLogo(logoWeb);
          if (logo && logo.confidence >= MIN_CONFIDENCE2) {
            proposals.push({
              entity_table: cfg.table,
              entity_id: e.id,
              field_name: "logo_url",
              current_value: null,
              proposed_value: logo.value,
              source_url: logo.source_url,
              confidence: logo.confidence,
              evidence: { source: "logo_resolver", web: logoWeb },
              agent: "enrich_v1"
            });
          }
        }
      }
      if (proposals.length) {
        await restPost(env2, "field_proposals", proposals, "return=minimal,resolution=ignore-duplicates");
        summary.proposalsCreated += proposals.length;
      }
      await markAttempted(env2, cfg.table, e.id);
    } catch (err) {
      if (err?.budget) {
        summary.errors.push({ id: e.id, error: "presupuesto mensual" });
        break;
      }
      summary.errors.push({ id: e.id, error: String(err?.message ?? err) });
    }
  }
  return summary;
}
__name(enrichTable, "enrichTable");
async function markAttempted(env2, table3, id) {
  await restPatch(env2, `${table3}?id=eq.${id}`, { enrich_attempted_at: (/* @__PURE__ */ new Date()).toISOString() });
}
__name(markAttempted, "markAttempted");

// src/metrics.ts
function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}
__name(utcDateStr, "utcDateStr");
function last7Days() {
  const now = /* @__PURE__ */ new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(utcDateStr(new Date(todayUTC - i * 864e5)));
  }
  return days;
}
__name(last7Days, "last7Days");
async function fetchAllRows(env2, table3, select, filter) {
  const pageSize = 1e3;
  const out = [];
  for (let page = 0; page < 20; page++) {
    const offset = page * pageSize;
    const rows = await restGet(
      env2,
      `${table3}?select=${select}&${filter}&order=${select}.asc&limit=${pageSize}&offset=${offset}`
    );
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
__name(fetchAllRows, "fetchAllRows");
function countByDay(rows, field, days) {
  const counts = {};
  for (const d of days) counts[d] = 0;
  for (const r of rows) {
    const v = r[field];
    const dia = v ? v.slice(0, 10) : "";
    if (dia in counts) counts[dia]++;
  }
  return counts;
}
__name(countByDay, "countByDay");
function cumulativeByDay(rows, days) {
  const regDates = rows.map((r) => r.fecha_registro).filter(Boolean).map((v) => v.slice(0, 10)).sort();
  const counts = {};
  let idx = 0;
  for (const day of days) {
    while (idx < regDates.length && regDates[idx] <= day) idx++;
    counts[day] = idx;
  }
  return counts;
}
__name(cumulativeByDay, "cumulativeByDay");
async function getMetrics7d(env2) {
  const days = last7Days();
  const startISO = `${days[0]}T00:00:00Z`;
  const [pvRows, consultaRows, userRows] = await Promise.all([
    fetchAllRows(env2, "page_views", "created_at", `created_at=gte.${startISO}`),
    fetchAllRows(env2, "ia_consultas", "created_at", `created_at=gte.${startISO}`),
    fetchAllRows(env2, "Usuarios", "fecha_registro", `fecha_registro=not.is.null`)
  ]);
  const pv = countByDay(pvRows, "created_at", days);
  const iq = countByDay(consultaRows, "created_at", days);
  const usuarios = cumulativeByDay(userRows, days);
  return days.map((dia) => ({
    dia,
    page_views: pv[dia] ?? 0,
    consultas: iq[dia] ?? 0,
    usuarios_total: usuarios[dia] ?? 0
  }));
}
__name(getMetrics7d, "getMetrics7d");

// src/publish.ts
var ALLOWED_TABLES = /* @__PURE__ */ new Set(["growshops", "asociaciones", "cbd_shops", "breeders", "variedades"]);
async function getProposal(env2, id) {
  const rows = await restGet(env2, `field_proposals?id=eq.${id}&limit=1`);
  return rows[0] ?? null;
}
__name(getProposal, "getProposal");
async function applyProposal(env2, id) {
  const p = await getProposal(env2, id);
  if (!p) return { ok: false, message: "propuesta no encontrada" };
  if (p.status === "publicado") return { ok: true, message: "ya estaba publicada" };
  if (!ALLOWED_TABLES.has(p.entity_table)) return { ok: false, message: `tabla no permitida: ${p.entity_table}` };
  const locked = await lockedFields(env2, p.entity_table, p.entity_id);
  if (locked.has(p.field_name)) {
    await restPatch(env2, `field_proposals?id=eq.${id}`, {
      status: "rechazado",
      reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: false, message: `campo bloqueado (field_locks): ${p.field_name} \u2014 propuesta rechazada` };
  }
  const patch = {};
  if (p.agent === "enrich_ar_v1" && (p.field_name === "lat" || p.field_name === "lon")) return applyGeoPair(env2, p);
  if (p.agent === "enrich_ar_v1") {
    const cur = (await restGet(env2, `${p.entity_table}?select=${p.field_name},geo_aproximado&id=eq.${p.entity_id}&limit=1`))[0];
    const geoField = p.field_name === "lat" || p.field_name === "lon";
    const empty = cur?.[p.field_name] === null || cur?.[p.field_name] === void 0 || cur?.[p.field_name] === "";
    if (cur && !empty && !(geoField && cur.geo_aproximado === true)) {
      await restPatch(env2, `field_proposals?id=eq.${id}`, { status: "rechazado", reviewed_at: (/* @__PURE__ */ new Date()).toISOString() });
      return { ok: false, message: `campo ya con dato: ${p.field_name} \u2014 propuesta rechazada` };
    }
  }
  patch[p.field_name] = p.proposed_value;
  patch["updated_at"] = (/* @__PURE__ */ new Date()).toISOString();
  await restPatch(env2, `${p.entity_table}?id=eq.${p.entity_id}`, patch);
  await restPatch(env2, `field_proposals?id=eq.${id}`, {
    status: "publicado",
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return { ok: true, message: `aplicado: ${p.entity_table}.${p.field_name}` };
}
__name(applyProposal, "applyProposal");
async function geoSibling(env2, p, status = "pendiente") {
  const other = p.field_name === "lat" ? "lon" : "lat";
  const rows = await restGet(
    env2,
    `field_proposals?entity_table=eq.${p.entity_table}&entity_id=eq.${p.entity_id}&field_name=eq.${other}&agent=eq.enrich_ar_v1&status=eq.${status}&order=created_at.desc&limit=1`
  );
  return rows[0] ?? null;
}
__name(geoSibling, "geoSibling");
var GEO_CENTROID_KM = 2;
async function rejectPair(env2, ids, message) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const i of ids) await restPatch(env2, `field_proposals?id=eq.${i}`, { status: "rechazado", reviewed_at: now });
  return { ok: false, message };
}
__name(rejectPair, "rejectPair");
async function applyGeoPair(env2, p) {
  const sib = await geoSibling(env2, p);
  if (!sib) return rejectPair(env2, [p.id], `lat y lon van juntas: falta la propuesta pendiente de ${p.field_name === "lat" ? "lon" : "lat"} \u2014 no se aplica a medias`);
  const lat = Number((p.field_name === "lat" ? p : sib).proposed_value);
  const lon = Number((p.field_name === "lon" ? p : sib).proposed_value);
  const ids = [p.id, sib.id];
  const cur = (await restGet(env2, `${p.entity_table}?select=lat,lon,geo_aproximado,ciudad,pais&id=eq.${p.entity_id}&limit=1`))[0];
  if (!cur) return rejectPair(env2, ids, "ficha no encontrada");
  const cfg = getPais(cur.pais ?? "AR");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || cfg.geo && !inBounds(cfg.geo, lat, lon)) return rejectPair(env2, ids, "coordenadas invalidas o fuera del pais \u2014 propuestas rechazadas");
  const locked = await lockedFields(env2, p.entity_table, p.entity_id);
  if (locked.has("lat") || locked.has("lon")) return rejectPair(env2, ids, "coordenadas bloqueadas (field_locks) \u2014 propuestas rechazadas");
  const empty = cur.lat === null || cur.lat === void 0 || cur.lon === null || cur.lon === void 0;
  const ref2 = cityRef(cfg, cur);
  const atCentroid = !!ref2 && typeof cur.lat === "number" && typeof cur.lon === "number" && haversineKm({ lat: cur.lat, lon: cur.lon }, ref2) <= GEO_CENTROID_KM;
  if (!(empty || cur.geo_aproximado === true || atCentroid)) return rejectPair(env2, ids, "coordenadas ya con dato real \u2014 propuestas rechazadas");
  await restPatch(env2, `${p.entity_table}?id=eq.${p.entity_id}`, { lat, lon, geo_aproximado: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const i of ids) await restPatch(env2, `field_proposals?id=eq.${i}`, { status: "publicado", reviewed_at: now });
  return { ok: true, message: `aplicado: ${p.entity_table}.lat+lon` };
}
__name(applyGeoPair, "applyGeoPair");
async function rejectProposal(env2, id) {
  const p = await getProposal(env2, id);
  if (!p) return { ok: false, message: "propuesta no encontrada" };
  await restPatch(env2, `field_proposals?id=eq.${id}`, {
    status: "rechazado",
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (p.agent === "enrich_ar_v1" && (p.field_name === "lat" || p.field_name === "lon")) {
    const sib = await geoSibling(env2, p);
    if (sib) await restPatch(env2, `field_proposals?id=eq.${sib.id}`, { status: "rechazado", reviewed_at: (/* @__PURE__ */ new Date()).toISOString() });
  }
  return { ok: true, message: "rechazada" };
}
__name(rejectProposal, "rejectProposal");
async function autoApproveHighConfidence(env2, threshold) {
  const rows = await restGet(
    env2,
    `field_proposals?select=id&status=eq.pendiente&confidence=gte.${threshold}&order=confidence.desc&limit=500`
  );
  let applied = 0;
  let skipped = 0;
  for (const r of rows) {
    const res = await applyProposal(env2, r.id);
    if (res.ok) applied++;
    else skipped++;
  }
  return { applied, skipped };
}
__name(autoApproveHighConfidence, "autoApproveHighConfidence");
function slugify2(s) {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
__name(slugify2, "slugify");
async function uniqueSlug(env2, table3, base) {
  let slug2 = base || "negocio";
  for (let i = 0; i < 20; i++) {
    const hit = await restGet(env2, `${table3}?select=id&slug=eq.${encodeURIComponent(slug2)}&limit=1`);
    if (hit.length === 0) return slug2;
    slug2 = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
__name(uniqueSlug, "uniqueSlug");
async function listCandidates(env2, status = "pending_review", pais) {
  const f = pais === "ES" ? "&candidate->>pais=is.null" : pais ? `&candidate->>pais=eq.${encodeURIComponent(pais)}` : "";
  return restGet(
    env2,
    `directory_candidates?status=eq.${status}${f}&order=discovered_at.desc&limit=2000`
  );
}
__name(listCandidates, "listCandidates");
async function candidateCounts(env2) {
  const rows = await restGet(
    env2,
    `directory_candidates?select=pais:candidate->>pais&status=eq.pending_review&limit=20000`
  );
  const out = {};
  for (const r of rows) out[r.pais ?? "ES"] = (out[r.pais ?? "ES"] ?? 0) + 1;
  return out;
}
__name(candidateCounts, "candidateCounts");
var BULK_MAX = 25;
async function bulkCandidates(env2, items, action) {
  if (items.length > BULK_MAX) return { ok: false, results: [{ id: "", ok: false, message: `maximo ${BULK_MAX} por lote` }] };
  const results = [];
  for (const it of items) {
    try {
      const r = action === "approve" ? await importCandidate(env2, it.id, it.target) : await rejectCandidate(env2, it.id);
      results.push({ id: it.id, ...r });
    } catch (err) {
      results.push({ id: it.id, ok: false, message: String(err?.message ?? err) });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
__name(bulkCandidates, "bulkCandidates");
var PAIS_TABLES2 = ["growshops", "asociaciones", "cbd_shops"];
var CLAIM_STALE_MS = 5 * 6e4;
function buildInsertRow(entityTable, c, slug2) {
  const d = c.candidate ?? {};
  const pais = String(d.pais);
  const hasGeo = Number.isFinite(d.lat) && Number.isFinite(d.lon);
  const row = {
    slug: slug2,
    nombre: d.nombre,
    direccion: d.direccion,
    ciudad: d.ciudad,
    provincia: d.provincia,
    slug_ciudad: d.ciudad ? slugify2(d.ciudad) : void 0,
    slug_provincia: d.provincia ? slugify2(d.provincia) : void 0,
    ...hasGeo ? { lat: d.lat, lon: d.lon } : {},
    telefono: d.telefono,
    web: d.web,
    horario: d.horario,
    media_resenas: typeof d.rating === "number" ? d.rating : void 0,
    num_resenas: Number.isFinite(d.num_resenas) ? d.num_resenas : 0,
    fuente: `directory_agent_${pais.toLowerCase()}`,
    fuente_url: c.evidence?.query,
    verification_sources: [{ source: "google_maps", via: "serpapi", place_id: c.evidence?.place_id ?? null }],
    pais,
    verificado: false,
    activo: true,
    indexable: false,
    geo_aproximado: false,
    editorial_status: "borrador"
  };
  if (entityTable !== "asociaciones") row.google_maps_url = d.google_maps_url;
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== void 0));
}
__name(buildInsertRow, "buildInsertRow");
async function findExistingFicha(env2, c) {
  const d = c.candidate ?? {};
  const pais = String(d.pais);
  const placeId = c.evidence?.place_id;
  if (placeId) {
    const cs = encodeURIComponent(JSON.stringify([{ place_id: placeId }]));
    for (const t of PAIS_TABLES2) {
      const hit = await restGet(env2, `${t}?select=id,slug&pais=eq.${pais}&verification_sources=cs.${cs}&limit=1`);
      if (hit[0]) return { table: t, id: hit[0].id, slug: hit[0].slug, by: "place_id" };
    }
  }
  const base = `${pais.toLowerCase()}-${slugify2(d.nombre)}-${slugify2(d.ciudad)}`;
  for (const t of PAIS_TABLES2) {
    const rows = await restGet(
      env2,
      `${t}?select=id,slug,nombre,ciudad&pais=eq.${pais}&slug=like.${encodeURIComponent(base)}*&limit=20`
    );
    const hit = rows.find((r) => norm(r.nombre) === norm(d.nombre) && norm(r.ciudad) === norm(d.ciudad));
    if (hit) return { table: t, id: hit.id, slug: hit.slug, by: "nombre_ciudad" };
  }
  return null;
}
__name(findExistingFicha, "findExistingFicha");
async function importCandidatePais(env2, c, entityTable) {
  const id = c.id;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stale = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const claimed = await restPatchReturning(
    env2,
    `directory_candidates?id=eq.${id}&status=eq.pending_review&or=(reviewed_at.is.null,reviewed_at.lt.${stale})`,
    { reviewed_at: now }
  );
  if (claimed.length === 0) {
    const cur = (await restGet(env2, `directory_candidates?select=status&id=eq.${id}&limit=1`))[0];
    if (cur?.status === "approved") return { ok: true, message: "ya estaba aprobado" };
    return { ok: false, message: cur?.status === "pending_review" ? "ya se esta aprobando (otra peticion en curso)" : `candidato no pendiente (${cur?.status ?? "no encontrado"})` };
  }
  try {
    const existing = await findExistingFicha(env2, c);
    let created;
    let message;
    if (existing) {
      created = existing;
      message = `ya existia ${existing.table} #${existing.id} (${existing.by}): no se inserta, candidato aprobado`;
    } else {
      const d = c.candidate ?? {};
      const slug2 = await uniqueSlug(env2, entityTable, `${String(d.pais).toLowerCase()}-${slugify2(d.nombre)}-${slugify2(d.ciudad)}`);
      const ins = await restInsertReturning(env2, entityTable, buildInsertRow(entityTable, c, slug2));
      created = { table: entityTable, id: ins.id, slug: slug2 };
      message = `creado ${entityTable} #${ins.id} (${slug2})`;
    }
    await restPatch(env2, `directory_candidates?id=eq.${id}`, {
      status: "approved",
      evidence: { ...c.evidence ?? {}, created_entity_id: created.id, created_table: created.table },
      reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: true, message };
  } catch (err) {
    await restPatch(env2, `directory_candidates?id=eq.${id}&status=eq.pending_review`, { reviewed_at: null }).catch(() => {
    });
    return { ok: false, message: String(err?.message ?? err) };
  }
}
__name(importCandidatePais, "importCandidatePais");
async function importCandidate(env2, id, target) {
  const rows = await restGet(env2, `directory_candidates?id=eq.${id}&limit=1`);
  const c = rows[0];
  if (!c) return { ok: false, message: "candidato no encontrado" };
  if (c.status === "approved") return { ok: true, message: "ya estaba aprobado" };
  const entityTable = target && ALLOWED_TABLES.has(target) ? target : c.entity_table;
  if (!ALLOWED_TABLES.has(entityTable)) return { ok: false, message: `tabla no permitida: ${entityTable}` };
  if (c.candidate?.pais) return importCandidatePais(env2, c, entityTable);
  const d = c.candidate ?? {};
  const slug2 = await uniqueSlug(env2, entityTable, `${slugify2(d.nombre)}-${slugify2(d.ciudad)}`);
  const row = {
    slug: slug2,
    nombre: d.nombre,
    direccion: d.direccion ?? null,
    ciudad: d.ciudad ?? null,
    provincia: d.provincia ?? null,
    lat: d.lat ?? null,
    lon: d.lon ?? null,
    telefono: d.telefono ?? null,
    web: d.web ?? null,
    fuente: "discover",
    fuente_url: c.evidence?.query ?? null,
    editorial_status: "borrador",
    // no indexado hasta curar
    verification_sources: [{ source: "google_maps", via: "serpapi", place_id: c.evidence?.place_id ?? null }]
  };
  const created = await restInsertReturning(env2, entityTable, row);
  await restPatch(env2, `directory_candidates?id=eq.${id}`, { status: "approved", duplicate_entity_id: created.id, reviewed_at: (/* @__PURE__ */ new Date()).toISOString() });
  return { ok: true, message: `creado ${entityTable} #${created.id} (${slug2})` };
}
__name(importCandidate, "importCandidate");
async function rejectCandidate(env2, id) {
  await restPatch(env2, `directory_candidates?id=eq.${id}`, {
    status: "rejected",
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return { ok: true, message: "descartado" };
}
__name(rejectCandidate, "rejectCandidate");
async function listProposals(env2, status) {
  const props = await restGet(
    env2,
    `field_proposals?status=eq.${status}&order=entity_table,entity_id,field_name&limit=500`
  );
  if (props.length === 0) return [];
  const byTable = {};
  for (const p of props) (byTable[p.entity_table] ??= /* @__PURE__ */ new Set()).add(p.entity_id);
  const NAME_ALIAS = { breeders: "nombre:breeder_name", variedades: "nombre" };
  const CITY_ALIAS = { breeders: "ciudad:pais_origen", variedades: "ciudad:tipo" };
  const names = {};
  for (const [table3, ids] of Object.entries(byTable)) {
    const idList = [...ids].join(",");
    const nameSel = NAME_ALIAS[table3] || "nombre";
    const citySel = CITY_ALIAS[table3] || "ciudad";
    const rows = await restGet(
      env2,
      `${table3}?select=id,${nameSel},${citySel}&id=in.(${idList})`
    );
    for (const r of rows) names[`${table3}:${r.id}`] = { nombre: r.nombre, ciudad: r.ciudad };
  }
  return props.map((p) => ({
    ...p,
    entity_name: names[`${p.entity_table}:${p.entity_id}`]?.nombre ?? `#${p.entity_id}`,
    entity_city: names[`${p.entity_table}:${p.entity_id}`]?.ciudad ?? ""
  }));
}
__name(listProposals, "listProposals");

// src/review.ts
function reviewHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisi\xF3n \u2014 Cannabicultor</title>
<style>
  :root{ --bg:#f6f7f8; --card:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb;
         --accent:#00ab8e; --add:#e7f7f1; --old:#fdecec; --ok:#0a7d5a; --no:#b42318; --warn:#b45309; }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#0f1113; --card:#181b1e; --fg:#e8eaed; --muted:#9aa0a6; --line:#2a2f34;
           --add:#0e2a22; --old:#2a1414; }
  }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 18px}
  header h1{font-size:16px;margin:0 0 8px;font-weight:650}
  .tabs{display:flex;gap:6px}
  .tab{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;
    padding:5px 14px;cursor:pointer;font:inherit}
  .tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  main{max-width:1000px;margin:0 auto;padding:18px}
  .biz{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 16px;overflow:hidden}
  .biz h2{font-size:15px;margin:0;padding:12px 16px;border-bottom:1px solid var(--line)}
  .biz h2 small{color:var(--muted);font-weight:400}
  .row{display:grid;grid-template-columns:120px 1fr auto;gap:12px;align-items:start;
    padding:12px 16px;border-bottom:1px solid var(--line)}
  .row:last-child{border-bottom:0}
  .field{font-weight:600;text-transform:capitalize}
  .conf{display:block;font-size:12px;color:var(--muted);font-weight:400;margin-top:2px}
  .vals{min-width:0}
  .old{background:var(--old);border-radius:6px;padding:3px 7px;font-size:13px;color:var(--muted);
    text-decoration:line-through;display:inline-block;margin-bottom:4px;word-break:break-word}
  .new{background:var(--add);border-radius:6px;padding:4px 8px;display:inline-block;word-break:break-word}
  .src{display:block;font-size:12px;margin-top:5px} .src a{color:var(--accent)}
  .meta{font-size:13px;color:var(--muted);margin:2px 0}
  .badge{display:inline-block;font-size:11px;border-radius:6px;padding:1px 7px;margin-left:6px}
  .badge.warn{background:#fde9d3;color:var(--warn)} .badge.cbd{background:#e7f7f1;color:var(--ok)}
  .acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  select{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:5px 8px}
  button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);
    border-radius:8px;padding:6px 12px;cursor:pointer}
  button.ok{border-color:var(--ok);color:var(--ok)} button.ok:hover{background:var(--ok);color:#fff}
  button.no{border-color:var(--no);color:var(--no)} button.no:hover{background:var(--no);color:#fff}
  .bulk{margin-top:8px}
  .empty{text-align:center;color:var(--muted);padding:60px 20px}
  .gone{opacity:.35;pointer-events:none}
  .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
  .chipbtn{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 12px;cursor:pointer}
  .chipbtn.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  .badge.pais{background:#e6ecff;color:#2a4bbd} .badge.dup{background:#fde2e2;color:var(--no)}
  .dupbox{background:var(--old);border-radius:8px;padding:6px 10px;font-size:13px;margin-top:6px}
  .sel{margin-right:8px;vertical-align:middle}
  .vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
  .vcard{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
  .vimg{aspect-ratio:4/3;background:var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px}
  .vimg img{width:100%;height:100%;object-fit:contain;background:#fff}
  .vbody{padding:12px 14px;display:flex;flex-direction:column;gap:5px;flex:1}
  .vn{font-weight:700;font-size:15px} .vbody label{font-size:12px;color:var(--muted);margin-top:4px}
  .vbody input{font:inherit;width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
  .bulkbar{position:sticky;top:96px;z-index:4;background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:8px 12px;margin:0 0 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
</style>
</head>
<body>
<header>
  <a id="backDash" href="#" style="display:inline-block;color:var(--muted);text-decoration:none;font-size:14px;margin-bottom:6px">\u2039 Dashboard</a>
  <h1>Revisi\xF3n \u2014 Cannabicultor</h1>
  <div class="tabs">
    <button class="tab on" data-t="prop" id="tab-prop">Datos por aprobar (<span id="cprop">\u2026</span>)</button>
    <button class="tab" data-t="cand" id="tab-cand">Negocios nuevos (<span id="ccand">\u2026</span>)</button>
    <button class="tab" data-t="fotos" id="tab-fotos">Fotos de variedades (<span id="cfotos">\u2026</span>)</button>
  </div>
  <div class="bulk" id="bulkWrap">
    <button class="ok" id="approveHigh">Aprobar datos \u2265 0.85</button>
    <button class="ok" id="approveAll">Aprobar todo</button>
  </div>
</header>
<main id="app"><div class="empty">Cargando\u2026</div></main>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
const app = document.getElementById('app');
let tab = 'prop';
let props = [], cands = [], counts = {};
let fotos = [], fotosTotal = 0, fEstado = 'pendiente', fOrigen = '';
const flt = {pais:'', vertical:'', provincia:'', dup:false};
const sel = new Set();
const VERTICALES = ['growshops','cbd_shops','asociaciones'];

function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function api(path){ const r=await fetch(path+(path.includes('?')?'&':'?')+'token='+encodeURIComponent(token));
  if(!r.ok) throw new Error(r.status); return r.json(); }
async function post(path, body){ const r=await fetch(path+'?token='+encodeURIComponent(token),
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {ok:r.ok, data:await r.json().catch(()=>({}))}; }

async function loadAll(){
  try{
    const [p,c,n]=await Promise.all([api('/api/proposals?status=pendiente'),api('/api/candidates?status=pending_review'),api('/api/candidates-counts')]);
    props=p.proposals||[]; cands=c.candidates||[]; counts=n.counts||{};
    document.getElementById('cprop').textContent=props.length;
    document.getElementById('ccand').textContent=cands.length;
    loadFotos(true);
    render();
  }catch(e){ app.innerHTML='<div class="empty">Error '+e.message+' \u2014 \xBFtoken correcto?</div>'; }
}

function render(){
  document.getElementById('bulkWrap').style.display = tab==='prop'?'block':'none';
  if(tab==='prop') return renderProps();
  if(tab==='fotos') return renderFotos();
  return renderCands();
}

function renderProps(){
  if(!props.length){ app.innerHTML='<div class="empty">\u2714 No hay datos pendientes de aprobar.</div>'; return; }
  const g={}; for(const p of props){(g[p.entity_table+':'+p.entity_id]??=[]).push(p);}
  let h='';
  for(const k in g){ const arr=g[k], f=arr[0];
    h+='<div class="biz"><h2>'+esc(f.entity_name)+' <small>\xB7 '+esc(f.entity_city)+' \xB7 '+f.entity_table+'</small></h2>';
    for(const p of arr){
      h+='<div class="row" id="p-'+p.id+'"><div><span class="field">'+esc(p.field_name)+'</span>'+
        '<span class="conf">conf '+(p.confidence??0).toFixed(2)+'</span></div><div class="vals">'+
        (p.current_value?'<span class="old">'+esc(p.current_value)+'</span><br>':'')+
        '<span class="new">'+esc(p.proposed_value)+'</span>'+
        (p.source_url?'<span class="src">\u{1F517} <a href="'+esc(p.source_url)+'" target="_blank" rel="noopener">fuente</a></span>':'')+
        '</div><div class="acts"><button class="ok" onclick="actProp(\\''+p.id+'\\',\\'approve\\')">\u2713</button>'+
        '<button class="no" onclick="actProp(\\''+p.id+'\\',\\'reject\\')">\u2717</button></div></div>';
    }
    h+='</div>';
  }
  app.innerHTML=h;
}

const paisOf=c=>(c.candidate&&c.candidate.pais)||'ES';
function filtered(){
  return cands.filter(c=>{ const d=c.candidate||{};
    if(flt.pais && paisOf(c)!==flt.pais) return false;
    if(flt.vertical && c.entity_table!==flt.vertical) return false;
    if(flt.provincia && (d.provincia||'\u2014')!==flt.provincia) return false;
    if(flt.dup && !c.duplicate_reason) return false;
    return true; });
}
function mapsLink(c){ const d=c.candidate||{}; if(d.google_maps_url) return d.google_maps_url;
  const pid=(c.evidence||{}).place_id; return pid?'https://www.google.com/maps/place/?q=place_id:'+pid:''; }

function renderCands(){
  document.getElementById('ccand').textContent=cands.length;
  if(!cands.length){ app.innerHTML='<div class="empty">\u2714 No hay negocios nuevos por revisar.</div>'; return; }
  const paises=[...new Set(['AR','ES',...Object.keys(counts)])];
  const provs=[...new Set(cands.filter(c=>!flt.pais||paisOf(c)===flt.pais).map(c=>(c.candidate||{}).provincia||'\u2014'))].sort();
  let h='<div class="filters">'+
    '<button class="chipbtn'+(flt.pais===''?' on':'')+'" onclick="setF(\\'pais\\',\\'\\')">Todos ('+cands.length+')</button>'+
    paises.map(p=>'<button class="chipbtn'+(flt.pais===p?' on':'')+'" onclick="setF(\\'pais\\',\\''+p+'\\')">'+p+' ('+(counts[p]||0)+')</button>').join('')+
    '<select onchange="setF(\\'vertical\\',this.value)"><option value="">vertical: todos</option>'+
      VERTICALES.map(v=>'<option value="'+v+'"'+(flt.vertical===v?' selected':'')+'>'+v+'</option>').join('')+'</select>'+
    '<select onchange="setF(\\'provincia\\',this.value)"><option value="">provincia: todas</option>'+
      provs.map(p=>'<option'+(flt.provincia===p?' selected':'')+'>'+esc(p)+'</option>').join('')+'</select>'+
    '<label><input type="checkbox" '+(flt.dup?'checked ':'')+'onchange="setF(\\'dup\\',this.checked)"> solo posibles duplicados</label></div>';
  const list=filtered();
  const nSel=list.filter(c=>sel.has(c.id)).length;
  h+='<div class="bulkbar"><label><input type="checkbox" id="selAll" '+(list.length&&nSel===list.length?'checked ':'')+'onchange="selAll(this.checked)"> todos los visibles ('+list.length+')</label>'+
     '<span class="meta">'+nSel+' seleccionados</span>'+
     '<button class="ok" onclick="bulkCand(\\'approve\\')"'+(nSel?'':' disabled')+'>Importar seleccionados</button>'+
     '<button class="no" onclick="bulkCand(\\'reject\\')"'+(nSel?'':' disabled')+'>Rechazar seleccionados</button></div>';
  if(!list.length) h+='<div class="empty">Ning\xFAn candidato con estos filtros.</div>';
  for(const c of list){ const d=c.candidate||{}, ev=c.evidence||{}, ml=mapsLink(c);
    const opts=VERTICALES.map(v=>'<option value="'+v+'"'+(v===c.entity_table?' selected':'')+'>'+v+'</option>').join('');
    h+='<div class="biz" id="c-'+c.id+'"><h2><input class="sel" type="checkbox" '+(sel.has(c.id)?'checked ':'')+'onchange="togSel(\\''+c.id+'\\',this.checked)">'+
      esc(d.nombre)+' <small>\xB7 '+esc([d.ciudad,d.provincia].filter(Boolean).join(', '))+'</small>'+
      '<span class="badge pais">'+esc(paisOf(c))+'</span>'+
      (d.needs_review?'<span class="badge warn">revisar vertical</span>':'')+
      (c.duplicate_reason?'<span class="badge dup">posible duplicado</span>':'')+'</h2><div class="row">'+
      '<div><span class="field">Ficha</span></div><div class="vals">'+
        (d.direccion?'<div class="meta">\u{1F4CD} '+esc(d.direccion)+'</div>':'')+
        (d.telefono?'<div class="meta">\u{1F4DE} '+esc(d.telefono)+'</div>':'')+
        (d.web?'<div class="meta">\u{1F310} <a href="'+esc(d.web)+'" target="_blank" rel="noopener">'+esc(d.web)+'</a></div>':'')+
        (d.num_resenas?'<div class="meta">\u2B50 '+esc(d.rating||'')+' ('+esc(d.num_resenas)+' rese\xF1as Google)</div>':'')+
        (ev.query?'<div class="meta">\u{1F50E} consulta: '+esc(ev.query)+'</div>':'')+
        (ml?'<div class="meta">\u{1F5FA}\uFE0F <a href="'+esc(ml)+'" target="_blank" rel="noopener">Google Maps</a></div>':'')+
        (c.duplicate_reason?'<div class="dupbox">\u26A0 '+esc(c.duplicate_reason)+(c.duplicate_entity_id?' (ficha #'+esc(c.duplicate_entity_id)+')':'')+'</div>':'')+
      '</div><div class="acts"><select id="sel-'+c.id+'">'+opts+'</select>'+
        '<button class="ok" onclick="actCand(\\''+c.id+'\\',\\'approve\\')">Importar</button>'+
        '<button class="no" onclick="actCand(\\''+c.id+'\\',\\'reject\\')">\u2717</button></div></div></div>';
  }
  app.innerHTML=h;
}
function setF(k,v){ flt[k]=v; if(k==='pais') flt.provincia=''; renderCands(); }
function togSel(id,on){ on?sel.add(id):sel.delete(id); renderCands(); }
function selAll(on){ for(const c of filtered()) on?sel.add(c.id):sel.delete(c.id); renderCands(); }
function dropCand(ids){ const s=new Set(ids); cands=cands.filter(c=>!s.has(c.id)); ids.forEach(i=>sel.delete(i));
  api('/api/candidates-counts').then(n=>{counts=n.counts||{}; renderCands();}).catch(()=>renderCands()); }

let busyCand=false; const inflight=new Set(); // evita reenviar la misma seleccion mientras el lote sigue en curso
async function bulkCand(action){
  if(busyCand) return;
  const items=filtered().filter(c=>sel.has(c.id)).map(c=>({id:c.id,target:(document.getElementById('sel-'+c.id)||{}).value||c.entity_table}));
  if(!items.length) return;
  const dups=filtered().filter(c=>sel.has(c.id)&&c.duplicate_reason).length;
  if(!confirm((action==='approve'?'Importar ':'Rechazar ')+items.length+' candidatos'+(action==='approve'&&dups?' (incluye '+dups+' posibles duplicados)':'')+'?')) return;
  busyCand=true; document.querySelectorAll('.bulkbar button').forEach(b=>b.disabled=true);
  const failed=[];
  try{
  for(let i=0;i<items.length;i+=25){
    const chunk=items.slice(i,i+25);
    const {data}=await post('/api/cand-act-bulk',{action,items:chunk});
    const res=data.results||[];
    const okIds=res.filter(r=>r.ok).map(r=>r.id); dropCand(okIds);
    res.filter(r=>!r.ok).forEach(r=>failed.push(r.message));
    if(!res.length) failed.push(data.message||'error');
  }
  } finally { busyCand=false; renderCands(); }
  if(failed.length) alert(failed.length+' con error:\\n'+failed.slice(0,5).join('\\n'));
}

async function actCand(id, action){
  if(busyCand||inflight.has(id)) return; inflight.add(id);
  try{ await actCand1(id, action); } finally { inflight.delete(id); }
}
async function actCand1(id, action){
  const el=document.getElementById('c-'+id); if(el) el.classList.add('gone');
  const target=(document.getElementById('sel-'+id)||{}).value;
  const {ok,data}=await post('/api/cand-act',{id,action,target});
  if(!ok||!data.ok){ if(el) el.classList.remove('gone'); alert('Error: '+(data.message||'')); return; }
  dropCand([id]);
}

async function actProp(id, action){
  const el=document.getElementById('p-'+id); if(el) el.classList.add('gone');
  const {ok,data}=await post('/api/act',{id,action});
  if(!ok||!data.ok){ if(el) el.classList.remove('gone'); alert('Error: '+(data.message||'')); return; }
  props=props.filter(p=>p.id!==id); document.getElementById('cprop').textContent=props.length; renderProps();
}

document.getElementById('approveHigh').onclick=async()=>{
  const high=props.filter(p=>(p.confidence??0)>=0.85);
  if(!high.length){ alert('No hay datos con confianza \u2265 0.85'); return; }
  if(!confirm('Aprobar y publicar '+high.length+' datos de confianza alta?')) return;
  for(const p of high){ await actProp(p.id,'approve'); }
};

document.getElementById('approveAll').onclick=async()=>{
  const all=props.slice();
  if(!all.length){ alert('No hay datos pendientes'); return; }
  if(!confirm('Aprobar y publicar TODOS los '+all.length+' datos pendientes (incluidos los de confianza baja)?')) return;
  for(const p of all){ await actProp(p.id,'approve'); }
};

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 Fotos de variedades: aprobar candidatas del buscador y fotos subidas por usuarios \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadFotos(reset){
  try{
    const r=await api('/api/fotos-var?estado='+fEstado+'&origen='+encodeURIComponent(fOrigen)+'&limite=24&offset='+(reset?0:fotos.length));
    fotos = reset ? r.items : fotos.concat(r.items); fotosTotal = r.total;
    document.getElementById('cfotos').textContent = r.conteo ? r.conteo.pendiente : fotosTotal;
    window.fotosConteo = r.conteo || {};
    if(tab==='fotos') renderFotos();
  }catch(e){ document.getElementById('cfotos').textContent='\u2014'; window.fotosError = e.message; if(tab==='fotos') renderFotos(); }
}
function cardFoto(f){
  const tag = f.origen==='usuario' ? '<span class="badge warn">Subida de usuario</span>' : '<span class="badge cbd">Candidata</span>';
  const sc = f.score!=null ? '<span class="badge pais">confianza '+Math.round(f.score*100)+'%</span>' : '';
  const orig = f.landing_url ? '<a href="'+esc(f.landing_url)+'" target="_blank" rel="noopener noreferrer">ver en origen \u2197</a>' : (f.usuario_email?esc(f.usuario_email):'');
  let h = '<div class="vcard" id="vf-'+f.id+'"><div class="vimg">'+(f.vista?'<a href="'+esc(f.vista)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" referrerpolicy="no-referrer" src="'+esc(f.vista)+'" alt=""></a>':'sin vista previa')+'</div><div class="vbody">'+
    '<div class="vn">'+esc(f.variedad_nombre||('Variedad #'+f.variedad_id))+'</div>'+
    '<div class="meta">'+esc(f.breeder_nombre||'(criador desconocido)')+(f.variedad_tiene_foto?' \xB7 <b style="color:var(--no)">ya tiene foto</b>':'')+'</div>'+
    '<div>'+tag+sc+'</div><div class="meta">'+orig+'</div>';
  if (fEstado==='pendiente') {
    h += '<label>Licencia / permiso</label><input id="fl-'+f.id+'" value="'+esc(f.licencia||'')+'" placeholder="permiso-criador, cc0, by, by-sa\u2026">'+
      '<label>Autor / cr\xE9dito</label><input id="fa-'+f.id+'" value="'+esc(f.autor||'')+'" placeholder="qui\xE9n hizo la foto">'+
      '<div class="acts" style="justify-content:flex-start;margin-top:8px"><button class="ok" onclick="aprobarFoto('+f.id+')">Aprobar</button><button class="no" onclick="rechazarFoto('+f.id+')">Rechazar</button></div>';
  } else {
    h += '<div class="meta">Licencia: '+esc(f.licencia||'\u2014')+(f.autor?' \xB7 '+esc(f.autor):'')+(f.motivo_rechazo?'<br>Motivo: '+esc(f.motivo_rechazo):'')+(f.public_path?'<br>Publicada: '+esc(f.public_path):'')+'</div>';
  }
  return h+'</div></div>';
}
function renderFotos(){
  if(window.fotosError){ app.innerHTML='<div class="empty">Error '+esc(window.fotosError)+' \u2014 \xBFhas aplicado sql/variedad_fotos.sql en Supabase?</div>'; return; }
  const c = window.fotosConteo||{};
  let h = '<div class="filters">'+
    ['pendiente','aprobada','rechazada'].map(e=>'<button class="chipbtn'+(fEstado===e?' on':'')+'" onclick="setFEstado(&quot;'+e+'&quot;)">'+({pendiente:'Por aprobar',aprobada:'Aprobadas',rechazada:'Rechazadas'}[e])+' ('+(c[e]!=null?c[e]:'\u2026')+')</button>').join('')+
    '<select onchange="setFOrigen(this.value)"><option value="">Todo el origen</option><option value="candidata"'+(fOrigen==='candidata'?' selected':'')+'>Candidatas</option><option value="usuario"'+(fOrigen==='usuario'?' selected':'')+'>Subidas de usuarios</option></select>'+
    (fEstado==='pendiente'?'<button class="ok" onclick="aprobarLoteFotos()">Aprobar visibles con licencia</button><button class="ok" style="background:var(--ok);color:#fff" onclick="aprobarTodasFotos()">Aprobar TODAS ('+(c.pendiente!=null?c.pendiente:fotosTotal)+')</button>':'')+'</div>';
  if(fEstado==='pendiente') h += '<div class="meta" style="margin:0 0 12px">Candidatas del buscador (webs de criadores, licencias abiertas) y fotos que suben los usuarios. <b>Nada se publica hasta que aprietas Aprobar.</b> Al aprobar, la imagen se copia a tu almacenamiento con su cr\xE9dito; no se enlaza la web de origen.</div>';
  if(!fotos.length) h += '<div class="empty">\u2714 Nada por aqu\xED.</div>';
  else h += '<div class="vgrid">'+fotos.map(cardFoto).join('')+'</div>'+(fotos.length<fotosTotal?'<div style="text-align:center;margin:16px"><button onclick="loadFotos(false)">Cargar m\xE1s</button></div>':'');
  app.innerHTML = h;
}
// Aprobar TODAS las pendientes (tambi\xE9n las que no est\xE1n en pantalla). Lo hace el navegador de una en una
// (cada aprobaci\xF3n descarga y sube una imagen: 460 seguidas no caben en una sola petici\xF3n del Worker),
// con progreso y bot\xF3n de parar. Se salta las fichas que ya tienen foto y las que no traen licencia.
async function aprobarTodasFotos(){
  const total=(window.fotosConteo&&window.fotosConteo.pendiente)||fotosTotal;
  if(!confirm('Vas a aprobar y PUBLICAR TODAS las fotos pendientes ('+total+'), tambi\xE9n las que no ves en pantalla. Se publican con la licencia y el cr\xE9dito que traen. Tendr\xE1s que dejar esta pesta\xF1a abierta mientras trabaja (puedes pararlo). \xBFSeguro?')) return;
  let barra=document.getElementById('fprog');
  if(!barra){ barra=document.createElement('div'); barra.id='fprog';
    barra.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:12px;padding:12px 16px;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:20;display:flex;gap:14px;align-items:center;max-width:92vw';
    document.body.appendChild(barra); }
  window.fotosParar=false;
  const pintar=(txt,parable)=>{ barra.innerHTML='<span>'+txt+'</span>'+(parable?'<button class="no" onclick="window.fotosParar=true">Parar</button>':'<button onclick="document.getElementById(&quot;fprog&quot;).remove()">Cerrar</button>'); };
  pintar('Preparando la lista\u2026',false);
  // 1) todas las pendientes (por p\xE1ginas de 100, respetando el filtro de origen)
  let todas=[];
  try{ for(let off=0;;off+=100){ const r=await api('/api/fotos-var?estado=pendiente&origen='+encodeURIComponent(fOrigen)+'&limite=100&offset='+off); todas=todas.concat(r.items); if(r.items.length<100) break; } }
  catch(e){ pintar('Error al listar: '+esc(e.message),false); return; }
  // 2) una sola foto por variedad (la de m\xE1s confianza, que ya viene primero): al aprobarla, las dem\xE1s de esa variedad se rechazan solas
  const vistas=new Set(); const cola=[]; let saltadas=0;
  for(const f of todas){ if(f.variedad_tiene_foto||!f.licencia||f.licencia==='desconocida'||vistas.has(f.variedad_id)){ saltadas++; continue; } vistas.add(f.variedad_id); cola.push(f); }
  let hechas=0, ko=0; const errores=[];
  // 3) en paralelo de 3 en 3 (variedades distintas, sin carreras)
  async function trabajador(){
    while(cola.length && !window.fotosParar){
      const f=cola.shift();
      try{ const r=await post('/api/fotos-var-act',{id:f.id,accion:'aprobar',licencia:f.licencia,autor:f.autor||undefined});
        if(!r.ok||!r.data.ok) throw new Error(r.data.message||'Error'); hechas++; }
      catch(e){ ko++; if(errores.length<5) errores.push((f.variedad_nombre||f.variedad_id)+': '+e.message); }
      pintar('Aprobando\u2026 '+(hechas+ko)+' de '+(hechas+ko+cola.length)+' \xB7 '+hechas+' publicadas'+(ko?' \xB7 '+ko+' con error':''),true);
    }
  }
  await Promise.all([trabajador(),trabajador(),trabajador()]);
  pintar((window.fotosParar?'Parado. ':'Terminado. ')+hechas+' fotos publicadas'+(ko?' \xB7 '+ko+' con error ('+esc(errores.join(' | '))+')':'')+(saltadas?' \xB7 '+saltadas+' saltadas (ya ten\xEDan foto, sin licencia o repetidas de la misma variedad)':'')+'.',false);
  loadFotos(true);
}
function setFEstado(e){ fEstado=e; loadFotos(true); }
function setFOrigen(o){ fOrigen=o; loadFotos(true); }
async function actFoto(body){
  const el=document.getElementById('vf-'+body.id); if(el) el.classList.add('gone');
  const r=await post('/api/fotos-var-act', body);
  if(!r.ok || !r.data.ok){ if(el) el.classList.remove('gone'); throw new Error(r.data.message||'Error'); }
  fotos = fotos.filter(f=>f.id!==body.id); fotosTotal--;
  if(window.fotosConteo && window.fotosConteo.pendiente) window.fotosConteo.pendiente--;
  document.getElementById('cfotos').textContent = window.fotosConteo?window.fotosConteo.pendiente:fotos.length;
}
async function aprobarFoto(id){
  const lic=document.getElementById('fl-'+id).value.trim();
  if(!lic||lic==='desconocida'){ alert('Indica la licencia o el permiso antes de aprobar'); return; }
  try{ await actFoto({id, accion:'aprobar', licencia:lic, autor:document.getElementById('fa-'+id).value.trim()||undefined}); renderFotos(); }catch(e){ alert(e.message); }
}
async function rechazarFoto(id){
  const m=prompt('Motivo del rechazo (opcional):',''); if(m===null) return;
  try{ await actFoto({id, accion:'rechazar', motivo:m}); renderFotos(); }catch(e){ alert(e.message); }
}
async function aprobarLoteFotos(){
  const ids=fotos.filter(f=>{ const l=document.getElementById('fl-'+f.id); return l && l.value.trim() && l.value.trim()!=='desconocida'; }).map(f=>f.id);
  if(!ids.length){ alert('No hay tarjetas con licencia para aprobar'); return; }
  if(!confirm('Vas a aprobar y PUBLICAR '+ids.length+' fotos. Revisa antes que son de la variedad correcta. \xBFContinuar?')) return;
  let ok=0, ko=0;
  for(const id of ids){ try{ await actFoto({id, accion:'aprobar', licencia:document.getElementById('fl-'+id).value.trim(), autor:document.getElementById('fa-'+id).value.trim()||undefined}); ok++; }catch(e){ ko++; } }
  alert('Aprobadas '+ok+(ko?' \xB7 con error '+ko:'')); renderFotos();
}

document.getElementById('backDash').href='/dashboard?token='+encodeURIComponent(token);

for(const b of document.querySelectorAll('.tab')){
  b.onclick=()=>{ tab=b.dataset.t;
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===b)); render(); };
}
if(new URLSearchParams(location.search).get('tab')==='fotos'){ tab='fotos'; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.t==='fotos')); }
loadAll();
<\/script>
</body>
</html>`;
}
__name(reviewHtml, "reviewHtml");

// src/fotos-variedades.ts
var BUCKET_PENDIENTES = "variedades-pendientes";
var BUCKET_PUBLICO = "variedades";
var MAX_DESCARGA = 8e6;
var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
var slug = /* @__PURE__ */ __name((s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/gi, "n").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), "slug");
var encPath = /* @__PURE__ */ __name((p) => p.split("/").map(encodeURIComponent).join("/"), "encPath");
var svc = /* @__PURE__ */ __name((env2, extra = {}) => ({
  apikey: env2.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env2.SUPABASE_SERVICE_KEY}`,
  ...extra
}), "svc");
function detectarMime(u8) {
  if (u8.length > 12 && u8[0] === 255 && u8[1] === 216 && u8[2] === 255) return "image/jpeg";
  if (u8.length > 12 && u8[0] === 137 && u8[1] === 80 && u8[2] === 78 && u8[3] === 71) return "image/png";
  if (u8.length > 12 && String.fromCharCode(...u8.subarray(0, 4)) === "RIFF" && String.fromCharCode(...u8.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}
__name(detectarMime, "detectarMime");
async function sha256Hex(bytes) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function rest(env2, path, init = {}) {
  const { count: count3, ...rest2 } = init;
  const res = await fetch(`${env2.SUPABASE_URL}/rest/v1/${path}`, {
    ...rest2,
    headers: svc(env2, { "Content-Type": "application/json", ...count3 ? { Prefer: "count=exact" } : {}, ...rest2.headers || {} })
  });
  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }
  const m = String(res.headers.get("content-range") || "").match(/\/(\d+)$/);
  return { ok: res.ok, status: res.status, data, count: m ? parseInt(m[1], 10) : null };
}
__name(rest, "rest");
async function storagePut(env2, bucket, path, bytes, mime) {
  const res = await fetch(`${env2.SUPABASE_URL}/storage/v1/object/${bucket}/${encPath(path)}`, {
    method: "POST",
    headers: svc(env2, { "Content-Type": mime, "x-upsert": "true", "cache-control": "max-age=31536000" }),
    body: bytes
  });
  if (!res.ok) throw new Error(`storage put ${bucket}/${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
__name(storagePut, "storagePut");
async function storageGet(env2, bucket, path) {
  const res = await fetch(`${env2.SUPABASE_URL}/storage/v1/object/${bucket}/${encPath(path)}`, { headers: svc(env2) });
  if (!res.ok) throw new Error(`storage get ${bucket}/${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
__name(storageGet, "storageGet");
async function storageDelete(env2, bucket, paths) {
  await fetch(`${env2.SUPABASE_URL}/storage/v1/object/${bucket}`, { method: "DELETE", headers: svc(env2, { "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths }) }).catch(() => {
  });
}
__name(storageDelete, "storageDelete");
async function urlFirmada(env2, bucket, path, segundos = 3600) {
  const res = await fetch(`${env2.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encPath(path)}`, {
    method: "POST",
    headers: svc(env2, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: segundos })
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const u = j?.signedURL || j?.signedUrl;
  return u ? `${env2.SUPABASE_URL}/storage/v1${u.startsWith("/") ? "" : "/"}${u}` : null;
}
__name(urlFirmada, "urlFirmada");
function urlDescargable(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return false;
    const h = x.hostname.toLowerCase();
    return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":"));
  } catch {
    return false;
  }
}
__name(urlDescargable, "urlDescargable");
async function descargarCandidata(u) {
  if (!urlDescargable(u)) throw new Error("URL de origen no permitida");
  const res = await fetch(u, { headers: { "User-Agent": "cannabicultor-photo-finder/0.1 (+https://www.cannabicultor.com)" }, redirect: "follow", signal: AbortSignal.timeout(25e3) });
  if (!res.ok) throw new Error(`descarga ${res.status}`);
  if (parseInt(res.headers.get("content-length") || "0", 10) > MAX_DESCARGA) throw new Error("imagen demasiado grande");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_DESCARGA) throw new Error("imagen demasiado grande");
  return buf;
}
__name(descargarCandidata, "descargarCandidata");
function creditoFoto(f, breederNombre) {
  const autor = f.autor || breederNombre || "autor desconocido";
  if (f.licencia === "permiso-criador") return `Foto: ${autor}, con permiso del criador`;
  if (f.licencia === "propia-usuario") return "Foto enviada por un usuario de Cannabicultor";
  const lic = String(f.licencia || "").toUpperCase().replace("CC0", "CC0 1.0");
  return `Foto: ${autor} \xB7 ${lic.startsWith("CC") ? lic : `CC ${lic}`}`.slice(0, 200);
}
__name(creditoFoto, "creditoFoto");
async function fotosVarConteo(env2) {
  const c = /* @__PURE__ */ __name(async (e) => (await rest(env2, `variedad_fotos?estado=eq.${e}&select=id`, { headers: { Range: "0-0" }, count: true })).count ?? 0, "c");
  const [pendiente, aprobada, rechazada] = await Promise.all([c("pendiente"), c("aprobada"), c("rechazada")]);
  return { pendiente, aprobada, rechazada };
}
__name(fotosVarConteo, "fotosVarConteo");
async function fotosVarList(env2, estado = "pendiente", origen = "", limite = 24, offset = 0) {
  estado = ["pendiente", "aprobada", "rechazada"].includes(estado) ? estado : "pendiente";
  const filtroOrigen = ["usuario", "candidata"].includes(origen) ? `&origen=eq.${origen}` : "";
  limite = Math.min(Math.max(limite || 24, 1), 100);
  offset = Math.max(offset || 0, 0);
  const r = await rest(env2, `variedad_fotos?estado=eq.${estado}${filtroOrigen}&select=*&order=score.desc.nullslast,created_at.asc&limit=${limite}&offset=${offset}`, { count: true });
  const filas = Array.isArray(r.data) ? r.data : [];
  const ids = [...new Set(filas.map((f) => f.variedad_id))];
  const vs = ids.length ? (await rest(env2, `variedades?id=in.(${ids.join(",")})&select=id,nombre,breeder_id,image_url`)).data || [] : [];
  const bids = [...new Set(vs.map((v) => v.breeder_id).filter(Boolean))];
  const bs = bids.length ? (await rest(env2, `breeders?id=in.(${bids.join(",")})&select=id,breeder_name`)).data || [] : [];
  const vm = new Map(vs.map((v) => [v.id, v]));
  const bm = new Map(bs.map((b) => [b.id, b]));
  const items = await Promise.all(filas.map(async (f) => {
    const v = vm.get(f.variedad_id) || {};
    const b = bm.get(v.breeder_id) || {};
    const vista = f.storage_path ? await urlFirmada(env2, BUCKET_PENDIENTES, f.storage_path) : f.source_url;
    return { ...f, variedad_nombre: v.nombre || null, variedad_tiene_foto: !!v.image_url, breeder_nombre: b.breeder_name || null, vista };
  }));
  return { items, total: r.count ?? items.length };
}
__name(fotosVarList, "fotosVarList");
async function fotosVarAct(env2, b) {
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return { ok: false, message: "id inv\xE1lido" };
  const f = (await rest(env2, `variedad_fotos?id=eq.${id}&select=*&limit=1`)).data?.[0];
  if (!f) return { ok: false, message: "No encontrada" };
  if (f.estado !== "pendiente") return { ok: false, message: `Ya est\xE1 ${f.estado}` };
  const ahora = (/* @__PURE__ */ new Date()).toISOString();
  if (b.accion === "rechazar") {
    const motivo = String(b.motivo || "").trim().slice(0, 300) || null;
    const u2 = await rest(env2, `variedad_fotos?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "rechazada", motivo_rechazo: motivo, revisado_por: "admin", revisado_at: ahora }) });
    if (!u2.ok) return { ok: false, message: "No se pudo rechazar" };
    if (f.storage_path) await storageDelete(env2, BUCKET_PENDIENTES, [f.storage_path]);
    return { ok: true };
  }
  if (b.accion !== "aprobar") return { ok: false, message: "Acci\xF3n no v\xE1lida" };
  const licencia = String(b.licencia || f.licencia || "").trim();
  if (!licencia || licencia === "desconocida") return { ok: false, message: "Indica la licencia o el permiso antes de aprobar" };
  f.licencia = licencia;
  if (b.autor) f.autor = String(b.autor).trim().slice(0, 120);
  const v = (await rest(env2, `variedades?id=eq.${f.variedad_id}&select=id,nombre,breeder_id,image_url&limit=1`)).data?.[0];
  if (!v) return { ok: false, message: "Variedad no encontrada" };
  const br = v.breeder_id ? (await rest(env2, `breeders?id=eq.${v.breeder_id}&select=breeder_name&limit=1`)).data?.[0] : null;
  let bytes;
  try {
    bytes = f.storage_path ? await storageGet(env2, BUCKET_PENDIENTES, f.storage_path) : await descargarCandidata(f.source_url);
  } catch (e) {
    return { ok: false, message: `No se pudo obtener la imagen: ${e.message}` };
  }
  const mime = detectarMime(bytes);
  if (!mime) return { ok: false, message: "El archivo no es una imagen v\xE1lida" };
  if (bytes.length > MAX_DESCARGA) return { ok: false, message: "Imagen demasiado grande" };
  const sha = await sha256Hex(bytes);
  const rutaPublica = `${slug(br?.breeder_name) || "sin-criador"}/${slug(v.nombre) || "variedad"}-${v.id}.${EXT[mime]}`;
  try {
    await storagePut(env2, BUCKET_PUBLICO, rutaPublica, bytes, mime);
  } catch (e) {
    return { ok: false, message: `No se pudo publicar la imagen: ${e.message}` };
  }
  const urlPublica = `${env2.SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLICO}/${encPath(rutaPublica)}`;
  const credito = creditoFoto(f, br?.breeder_name);
  const u = await rest(env2, `variedad_fotos?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado: "aprobada", public_path: rutaPublica, licencia, autor: f.autor || null, sha256: sha, nota_permiso: b.nota_permiso || f.nota_permiso || null, revisado_por: "admin", revisado_at: ahora })
  });
  if (!u.ok) return { ok: false, message: "Imagen publicada pero no se pudo marcar como aprobada" };
  let fichaActualizada = false;
  if (!v.image_url) {
    const p = await rest(env2, `variedades?id=eq.${v.id}&image_url=is.null`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ image_url: urlPublica, foto_credito: credito }) });
    fichaActualizada = p.ok;
  }
  await rest(env2, `variedad_fotos?variedad_id=eq.${v.id}&estado=eq.pendiente&id=neq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "rechazada", motivo_rechazo: "La variedad ya tiene una foto aprobada", revisado_por: "admin", revisado_at: ahora }) });
  if (f.storage_path) await storageDelete(env2, BUCKET_PENDIENTES, [f.storage_path]);
  return { ok: true, url: urlPublica, credito, ficha_actualizada: fichaActualizada };
}
__name(fotosVarAct, "fotosVarAct");

// src/run-pais.ts
function orderedCities(all) {
  return [...all.filter((c) => c.prio === "alta"), ...all.filter((c) => c.prio === "media")];
}
__name(orderedCities, "orderedCities");
function pickCitiesAt(all, n, start) {
  const ordered = orderedCities(all);
  if (ordered.length === 0) return [];
  const s = (start % ordered.length + ordered.length) % ordered.length;
  return Array.from({ length: Math.min(n, ordered.length) }, (_, i) => ordered[(s + i) % ordered.length]);
}
__name(pickCitiesAt, "pickCitiesAt");
function resolveCity(cfg, name) {
  const key = norm(canonCity(name));
  return cfg.cities.find((c) => norm(c.name) === key) ?? { name: canonCity(name), provincia: "", prio: "alta" };
}
__name(resolveCity, "resolveCity");
async function loadCursor(env2, pais) {
  try {
    const rows = await restGet(env2, `directory_run_state?select=city_cursor&pais=eq.${pais}&limit=1`);
    return rows[0]?.city_cursor ?? 0;
  } catch {
    return 0;
  }
}
__name(loadCursor, "loadCursor");
async function saveCursor(env2, pais, cursor) {
  await restPost(env2, "directory_run_state?on_conflict=pais", [{ pais, city_cursor: cursor, updated_at: (/* @__PURE__ */ new Date()).toISOString() }], "return=minimal,resolution=merge-duplicates");
}
__name(saveCursor, "saveCursor");
async function runPais(env2, o) {
  const cfg = getPais(o.pais);
  resetProviders();
  const budget = await loadBudget(env2, cfg);
  const autoMin = parseFloat(env2.AUTO_APPROVE_MIN || "0.85");
  const result = { pais: cfg.code, modo: o.modo, dry: o.dry, discover: [], cities: [], budget: budget.snapshot() };
  try {
    if (o.modo !== "descubrir") {
      const limit = o.limit ?? (o.dry ? DRY_ENRICH_ROWS : enrichBatch(env2, cfg.code));
      result.enrich = await enrichPais(env2, cfg, budget, { limit, dry: o.dry });
    }
    if (o.modo !== "enriquecer") {
      const n = discoverCities(env2, cfg.code);
      const explicit = (o.cities ?? []).map((x) => x.trim()).filter(Boolean);
      let from = 0, cities;
      if (explicit.length) cities = explicit.map((w) => resolveCity(cfg, w));
      else {
        from = await loadCursor(env2, cfg.code);
        cities = pickCitiesAt(cfg.cities, n, from);
      }
      result.cities = cities.map((c) => c.name);
      const sweeps = o.sweeps ?? Object.keys(cfg.queries);
      const run = newRunIndex();
      let done = 0;
      outer: for (const city of cities) {
        for (const sweep of sweeps) {
          try {
            const d = await discoverArea(env2, sweep, city.name, { pais: cfg.code, dry: o.dry, budget, provincia: city.provincia, autoMin, run });
            result.discover.push(d);
            if (d.capped) break outer;
          } catch (err) {
            result.discover.push({
              sweep,
              area: city.name,
              found: 0,
              duplicates: 0,
              candidatesCreated: 0,
              byVertical: {},
              errors: [String(err?.message ?? err)]
            });
            if (err?.budget) break outer;
          }
        }
        done++;
      }
      if (!explicit.length) {
        const total = orderedCities(cfg.cities).length || 1;
        const next = (from + done) % total;
        let advanced = false;
        if (!o.dry && done > 0) {
          try {
            await saveCursor(env2, cfg.code, next);
            advanced = true;
          } catch (e) {
            console.log("[cursor] no se pudo guardar", String(e));
          }
        }
        result.cursor = { from, next: advanced ? next : from, advanced };
      }
    }
  } finally {
    await commitBudget(env2, budget).catch((e) => console.log("[budget] commit error", String(e)));
    await flushProviders(env2).catch(() => {
    });
    result.budget = budget.snapshot();
    console.log(`[run-pais] ${cfg.code} ${o.modo}${o.dry ? " (dry)" : ""} serp`, JSON.stringify(result.budget));
  }
  return result;
}
__name(runPais, "runPais");

// src/ventas-ui.ts
var _a;
var VENTAS_HTML = String.raw(_a || (_a = __template([`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ventas \u2014 Cannabicultor</title>
<style>
  :root{ --bg:#f6f7f8; --card:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb;
         --accent:#00ab8e; --ok:#0a7d5a; --no:#b42318; --warn:#b45309; --track:#eceef0; }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#0f1113; --card:#181b1e; --fg:#e8eaed; --muted:#9aa0a6; --line:#2a2f34; --track:#23282d; }
  }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 18px}
  header a{color:var(--muted);text-decoration:none;font-size:14px}
  header h1{font-size:16px;margin:4px 0 8px;font-weight:650}
  .tabs,.chips,.tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .tools{margin-top:8px}
  button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);
    border-radius:8px;padding:6px 12px;cursor:pointer;text-decoration:none;display:inline-block}
  .tab,.chip{border-radius:999px;padding:5px 14px}
  .tab.on,.chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  button.ok{border-color:var(--ok);color:var(--ok)} button.ok:hover{background:var(--ok);color:#fff}
  button.no{border-color:var(--no);color:var(--no)} button.no:hover{background:var(--no);color:#fff}
  button:disabled{opacity:.5;cursor:default}
  button:focus-visible,input:focus-visible,textarea:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  main{max-width:880px;margin:0 auto;padding:18px}
  .biz{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 16px;overflow:hidden}
  .biz h2{font-size:15px;margin:0;padding:12px 16px;border-bottom:1px solid var(--line)}
  .biz h2 small{color:var(--muted);font-weight:400}
  .badge{display:inline-block;font-size:11px;border-radius:6px;padding:1px 8px;margin-left:6px;background:var(--track)}
  .badge.a{background:#fde9d3;color:var(--warn)}
  .body{padding:12px 16px}
  .f{margin:0 0 10px}
  .f label{display:block;font-size:12px;color:var(--muted);margin-bottom:2px}
  input[type=text],input[type=email],textarea{width:100%;font:inherit;border:1px solid var(--line);
    background:var(--bg);color:var(--fg);border-radius:8px;padding:7px 9px}
  textarea{resize:vertical;min-height:120px}
  .meta{font-size:13px;color:var(--muted);margin:2px 0} .meta a{color:var(--accent)}
  .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border-radius:8px;padding:8px;font-size:13px;margin:0 0 10px}
  .empty{text-align:center;color:var(--muted);padding:50px 20px}
  .gone{opacity:.35;pointer-events:none}
  .funnel{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .stage{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 12px;font-size:13px}
  .stage b{font-size:16px;margin-right:4px}
  .lead{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line)}
  .lead:last-child{border-bottom:0}
  #status{font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<header>
  <a id="backDash" href="#">\u2039 Dashboard</a>
  <h1>Ventas \u2014 Cannabicultor</h1>
  <div class="tabs">
    <button type="button" class="tab on" data-t="apr">Por aprobar (<span id="capr">\u2026</span>)</button>
    <button type="button" class="tab" data-t="pipe">Pipeline</button>
  </div>
  <div class="tools">
    <button type="button" id="runAgents">Ejecutar agentes ahora</button>
    <span id="status" role="status" aria-live="polite"></span>
  </div>
</header>
<main id="app"><div class="empty">Cargando\u2026</div></main>
<script>
var token = new URLSearchParams(location.search).get('token') || '';
var app = document.getElementById('app');
var statusEl = document.getElementById('status');
var tab = 'apr', filtro = 'todos', aprobaciones = [], leads = [], resumen = null;
var LTIPO = {growshop:'Growshop', cbd_shop:'Tienda CBD', asociacion:'Club/asociaci\xF3n', banco_semillas:'Banco de semillas', distribuidor:'Distribuidor', fabricante:'Fabricante', otro:'Otro'};
var TIPOS = {email_1:'Email 1', email_2:'Email 2 (demo)', seguimiento:'Seguimiento', respuesta:'Respuesta',
  lead_nuevo:'Lead nuevo', propuesta:'Propuesta', precio:'Precio', otro:'Otro'};
var ESTADOS = ['nuevo','email1_enviado','respondio','demo_pendiente','demo_enviado','demo_usado','reunion','piloto','cliente'];
var ETIQUETA = {nuevo:'Nuevos', email1_enviado:'Email 1 enviado', respondio:'Respondieron', demo_pendiente:'Demo por enviar',
  demo_enviado:'Demo enviado', demo_usado:'Demo usado', reunion:'Reuni\xF3n', piloto:'Piloto', cliente:'Cliente'};

function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function q(path){ return path + (path.indexOf('?')>-1?'&':'?') + 'token=' + encodeURIComponent(token); }
function api(path){ return fetch(q(path)).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }); }
function post(path, body){
  return fetch(q(path), {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return {ok:r.ok, data:d}; }); });
}
function say(t){ statusEl.textContent = t || ''; }

function loadAll(){
  return Promise.all([
    api('/api/ventas/aprobaciones?estado=pendiente'),
    api('/api/ventas/pipeline'),
    api('/api/ventas/resumen')
  ]).then(function(r){
    aprobaciones = r[0].aprobaciones || []; leads = r[1].leads || []; resumen = r[2].resumen || {};
    document.getElementById('capr').textContent = aprobaciones.length;
    render();
  }).catch(function(e){ app.innerHTML = '<div class="empty">Error ' + esc(e.message) + ' \u2014 \xBFtoken correcto?</div>'; });
}

function render(){ if(tab==='apr') renderApr(); else renderPipe(); }

function chips(){
  var tipos = {}; aprobaciones.forEach(function(a){ tipos[a.tipo] = (tipos[a.tipo]||0)+1; });
  var h = '<div class="chips" style="margin-bottom:14px">';
  h += '<button type="button" class="chip' + (filtro==='todos'?' on':'') + '" data-f="todos">Todos (' + aprobaciones.length + ')</button>';
  Object.keys(tipos).forEach(function(t){
    h += '<button type="button" class="chip' + (filtro===t?' on':'') + '" data-f="' + esc(t) + '">' + esc(TIPOS[t]||t) + ' (' + tipos[t] + ')</button>';
  });
  return h + '</div>';
}

function cardEmail(a, p){
  var id = esc(a.id);
  return '<div class="f"><label for="para-'+id+'">Para</label><input id="para-'+id+'" type="email" inputmode="email" autocomplete="off" value="'+esc(p.para)+'"></div>' +
    '<div class="f"><label for="asu-'+id+'">Asunto</label><input id="asu-'+id+'" type="text" value="'+esc(p.asunto)+'"></div>' +
    '<div class="f"><label for="cue-'+id+'">Mensaje</label><textarea id="cue-'+id+'" rows="12">'+esc(p.cuerpo)+'</textarea></div>' +
    '<div class="acts"><button type="button" data-a="gmail">Abrir en Gmail</button>' +
    '<button type="button" data-a="copiar">Copiar</button>' +
    '<button type="button" class="ok" data-a="enviado">\u2713 Ya enviado</button>' +
    '<button type="button" class="no" data-a="rechazar">\u2717 Descartar</button></div>';
}

function cardGenerica(a){
  var id = esc(a.id);
  return (a.resumen ? '<p class="meta">'+esc(a.resumen)+'</p>' : '') +
    '<pre>'+esc(JSON.stringify(a.payload||{}, null, 2))+'</pre>' +
    '<div class="f"><label for="nota-'+id+'">Nota (opcional)</label><input id="nota-'+id+'" type="text"></div>' +
    '<div class="acts"><button type="button" class="ok" data-a="aprobar">\u2713 Aprobar</button>' +
    '<button type="button" class="no" data-a="rechazar">\u2717 Rechazar</button></div>';
}

function renderApr(){
  var lista = aprobaciones.filter(function(a){ return filtro==='todos' || a.tipo===filtro; });
  var h = chips();
  if(!lista.length){ app.innerHTML = h + '<div class="empty">\u2714 Nada pendiente de aprobar.</div>'; return; }
  lista.forEach(function(a){
    var p = a.payload || {}, l = a.lead || {};
    var esEmail = (typeof p.asunto === 'string') && (typeof p.cuerpo === 'string');
    h += '<article class="biz" id="a-'+esc(a.id)+'" data-id="'+esc(a.id)+'">' +
      '<h2>'+esc(a.titulo)+' <span class="badge'+(l.tier==='A'?' a':'')+'">Tier '+esc(l.tier||'?')+'</span>' +
      '<span class="badge">'+esc(LTIPO[l.tipo]||'')+'</span>' +
      '<span class="badge">'+esc(TIPOS[a.tipo]||a.tipo)+'</span></h2><div class="body">' +
      (l.web ? '<div class="meta">\u{1F310} <a href="https://'+esc(String(l.web).replace(/^https?:///,''))+'" target="_blank" rel="noopener">'+esc(l.web)+'</a></div>' : '') +
      (l.demo_token ? '<div class="meta">Demo: <a href="https://demo.cannabicultor.com/demo/'+esc(l.demo_token)+'" target="_blank" rel="noopener">abrir</a></div>' : '') +
      (esEmail ? cardEmail(a, p) : cardGenerica(a)) + '</div></article>';
  });
  app.innerHTML = h;
}

function renderPipe(){
  var e = (resumen && resumen.embudo) || {};
  var h = '<div class="funnel">' + ESTADOS.map(function(s){
    return '<div class="stage"><b>'+(e[s]||0)+'</b>'+esc(ETIQUETA[s])+'</div>'; }).join('') + '</div>';
  h += '<p class="meta">'+(resumen.leads_total||0)+' leads en total \xB7 '+(resumen.leads_con_email||0)+' con email</p>';
  if(!leads.length){ app.innerHTML = h + '<div class="empty">Sin leads en pipeline todav\xEDa.</div>'; return; }
  h += '<div class="biz">';
  leads.forEach(function(l){
    h += '<div class="lead"><div><strong>'+esc(l.nombre)+'</strong> <span class="badge'+(l.tier==='A'?' a':'')+'">Tier '+esc(l.tier)+'</span>' +
      '<span class="badge">'+esc(ETIQUETA[l.estado]||l.estado)+'</span>' +
      '<div class="meta">'+esc(l.tipo)+(l.ciudad?' \xB7 '+esc(l.ciudad):'')+(l.email?' \xB7 '+esc(l.email):' \xB7 sin email')+'</div></div>' +
      '<div class="meta">'+(l.demo_token?'<a href="https://demo.cannabicultor.com/demo/'+esc(l.demo_token)+'" target="_blank" rel="noopener">demo</a>':'')+'</div></div>';
  });
  app.innerHTML = h + '</div>';
}

function gmailUrl(id){
  var para = document.getElementById('para-'+id).value.trim();
  var asu = document.getElementById('asu-'+id).value;
  var cue = document.getElementById('cue-'+id).value;
  return 'https://mail.google.com/mail/?authuser=alianzacannabicultores%40gmail.com&view=cm&fs=1&to='+encodeURIComponent(para)+'&su='+encodeURIComponent(asu)+'&body='+encodeURIComponent(cue);
}

function quitar(id){
  aprobaciones = aprobaciones.filter(function(a){ return a.id!==id; });
  document.getElementById('capr').textContent = aprobaciones.length;
  renderApr();
}

async function accion(id, action, boton){
  var art = document.getElementById('a-'+id);
  var cuerpo = {id:id, action:action};
  var para = document.getElementById('para-'+id);
  if(para){
    cuerpo.para = para.value.trim();
    cuerpo.asunto = document.getElementById('asu-'+id).value;
    cuerpo.cuerpo = document.getElementById('cue-'+id).value;
  }
  var nota = document.getElementById('nota-'+id);
  if(nota) cuerpo.nota = nota.value;
  if(action==='rechazar' && !confirm('\xBFDescartar este borrador?')) return;
  if(art) art.classList.add('gone');
  var r = await post('/api/ventas/act', cuerpo);
  if(!r.ok || !r.data.ok){ if(art) art.classList.remove('gone'); say('Error: ' + (r.data.message||'')); return; }
  say(r.data.message);
  quitar(id);
}

app.addEventListener('click', function(ev){
  var chip = ev.target.closest('button[data-f]');
  if(chip){ filtro = chip.dataset.f; renderApr(); return; }
  var b = ev.target.closest('button[data-a]'); if(!b) return;
  var art = b.closest('article'); if(!art) return;
  var id = art.dataset.id, a = b.dataset.a;
  if(a==='gmail'){ window.open(gmailUrl(id), '_blank', 'noopener'); return; }
  if(a==='copiar'){
    var txt = document.getElementById('asu-'+id).value + '

' + document.getElementById('cue-'+id).value;
    navigator.clipboard.writeText(txt).then(function(){ say('Copiado'); }, function(){ say('No se pudo copiar'); });
    return;
  }
  accion(id, a, b);
});

document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click', function(){
    tab = b.dataset.t;
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.toggle('on', x===b); });
    render();
  });
});

document.getElementById('runAgents').addEventListener('click', async function(ev){
  var btn = ev.currentTarget; btn.disabled = true; say('Ejecutando agentes\u2026');
  var r = await post('/api/ventas/run', {agent:'todos'});
  btn.disabled = false;
  if(!r.ok || !r.data.ok){ say('Error: ' + (r.data.message||r.data.error||'')); return; }
  var p = r.data.prospector || {}, d = r.data.redactor || {};
  say('Prospector: ' + (p.emails||0) + ' emails nuevos \xB7 Redactor: ' + (d.borradores||0) + ' borradores' + (d.descartados ? ' (' + d.descartados + ' descartados por el filtro)' : ''));
  loadAll();
});

document.getElementById('backDash').href = '/dashboard?token=' + encodeURIComponent(token);
loadAll();
<\/script>
</body>
</html>`], [`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ventas \u2014 Cannabicultor</title>
<style>
  :root{ --bg:#f6f7f8; --card:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb;
         --accent:#00ab8e; --ok:#0a7d5a; --no:#b42318; --warn:#b45309; --track:#eceef0; }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#0f1113; --card:#181b1e; --fg:#e8eaed; --muted:#9aa0a6; --line:#2a2f34; --track:#23282d; }
  }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 18px}
  header a{color:var(--muted);text-decoration:none;font-size:14px}
  header h1{font-size:16px;margin:4px 0 8px;font-weight:650}
  .tabs,.chips,.tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .tools{margin-top:8px}
  button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);
    border-radius:8px;padding:6px 12px;cursor:pointer;text-decoration:none;display:inline-block}
  .tab,.chip{border-radius:999px;padding:5px 14px}
  .tab.on,.chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  button.ok{border-color:var(--ok);color:var(--ok)} button.ok:hover{background:var(--ok);color:#fff}
  button.no{border-color:var(--no);color:var(--no)} button.no:hover{background:var(--no);color:#fff}
  button:disabled{opacity:.5;cursor:default}
  button:focus-visible,input:focus-visible,textarea:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  main{max-width:880px;margin:0 auto;padding:18px}
  .biz{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 16px;overflow:hidden}
  .biz h2{font-size:15px;margin:0;padding:12px 16px;border-bottom:1px solid var(--line)}
  .biz h2 small{color:var(--muted);font-weight:400}
  .badge{display:inline-block;font-size:11px;border-radius:6px;padding:1px 8px;margin-left:6px;background:var(--track)}
  .badge.a{background:#fde9d3;color:var(--warn)}
  .body{padding:12px 16px}
  .f{margin:0 0 10px}
  .f label{display:block;font-size:12px;color:var(--muted);margin-bottom:2px}
  input[type=text],input[type=email],textarea{width:100%;font:inherit;border:1px solid var(--line);
    background:var(--bg);color:var(--fg);border-radius:8px;padding:7px 9px}
  textarea{resize:vertical;min-height:120px}
  .meta{font-size:13px;color:var(--muted);margin:2px 0} .meta a{color:var(--accent)}
  .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border-radius:8px;padding:8px;font-size:13px;margin:0 0 10px}
  .empty{text-align:center;color:var(--muted);padding:50px 20px}
  .gone{opacity:.35;pointer-events:none}
  .funnel{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .stage{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 12px;font-size:13px}
  .stage b{font-size:16px;margin-right:4px}
  .lead{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line)}
  .lead:last-child{border-bottom:0}
  #status{font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<header>
  <a id="backDash" href="#">\u2039 Dashboard</a>
  <h1>Ventas \u2014 Cannabicultor</h1>
  <div class="tabs">
    <button type="button" class="tab on" data-t="apr">Por aprobar (<span id="capr">\u2026</span>)</button>
    <button type="button" class="tab" data-t="pipe">Pipeline</button>
  </div>
  <div class="tools">
    <button type="button" id="runAgents">Ejecutar agentes ahora</button>
    <span id="status" role="status" aria-live="polite"></span>
  </div>
</header>
<main id="app"><div class="empty">Cargando\u2026</div></main>
<script>
var token = new URLSearchParams(location.search).get('token') || '';
var app = document.getElementById('app');
var statusEl = document.getElementById('status');
var tab = 'apr', filtro = 'todos', aprobaciones = [], leads = [], resumen = null;
var LTIPO = {growshop:'Growshop', cbd_shop:'Tienda CBD', asociacion:'Club/asociaci\xF3n', banco_semillas:'Banco de semillas', distribuidor:'Distribuidor', fabricante:'Fabricante', otro:'Otro'};
var TIPOS = {email_1:'Email 1', email_2:'Email 2 (demo)', seguimiento:'Seguimiento', respuesta:'Respuesta',
  lead_nuevo:'Lead nuevo', propuesta:'Propuesta', precio:'Precio', otro:'Otro'};
var ESTADOS = ['nuevo','email1_enviado','respondio','demo_pendiente','demo_enviado','demo_usado','reunion','piloto','cliente'];
var ETIQUETA = {nuevo:'Nuevos', email1_enviado:'Email 1 enviado', respondio:'Respondieron', demo_pendiente:'Demo por enviar',
  demo_enviado:'Demo enviado', demo_usado:'Demo usado', reunion:'Reuni\xF3n', piloto:'Piloto', cliente:'Cliente'};

function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function q(path){ return path + (path.indexOf('?')>-1?'&':'?') + 'token=' + encodeURIComponent(token); }
function api(path){ return fetch(q(path)).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }); }
function post(path, body){
  return fetch(q(path), {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return {ok:r.ok, data:d}; }); });
}
function say(t){ statusEl.textContent = t || ''; }

function loadAll(){
  return Promise.all([
    api('/api/ventas/aprobaciones?estado=pendiente'),
    api('/api/ventas/pipeline'),
    api('/api/ventas/resumen')
  ]).then(function(r){
    aprobaciones = r[0].aprobaciones || []; leads = r[1].leads || []; resumen = r[2].resumen || {};
    document.getElementById('capr').textContent = aprobaciones.length;
    render();
  }).catch(function(e){ app.innerHTML = '<div class="empty">Error ' + esc(e.message) + ' \u2014 \xBFtoken correcto?</div>'; });
}

function render(){ if(tab==='apr') renderApr(); else renderPipe(); }

function chips(){
  var tipos = {}; aprobaciones.forEach(function(a){ tipos[a.tipo] = (tipos[a.tipo]||0)+1; });
  var h = '<div class="chips" style="margin-bottom:14px">';
  h += '<button type="button" class="chip' + (filtro==='todos'?' on':'') + '" data-f="todos">Todos (' + aprobaciones.length + ')</button>';
  Object.keys(tipos).forEach(function(t){
    h += '<button type="button" class="chip' + (filtro===t?' on':'') + '" data-f="' + esc(t) + '">' + esc(TIPOS[t]||t) + ' (' + tipos[t] + ')</button>';
  });
  return h + '</div>';
}

function cardEmail(a, p){
  var id = esc(a.id);
  return '<div class="f"><label for="para-'+id+'">Para</label><input id="para-'+id+'" type="email" inputmode="email" autocomplete="off" value="'+esc(p.para)+'"></div>' +
    '<div class="f"><label for="asu-'+id+'">Asunto</label><input id="asu-'+id+'" type="text" value="'+esc(p.asunto)+'"></div>' +
    '<div class="f"><label for="cue-'+id+'">Mensaje</label><textarea id="cue-'+id+'" rows="12">'+esc(p.cuerpo)+'</textarea></div>' +
    '<div class="acts"><button type="button" data-a="gmail">Abrir en Gmail</button>' +
    '<button type="button" data-a="copiar">Copiar</button>' +
    '<button type="button" class="ok" data-a="enviado">\u2713 Ya enviado</button>' +
    '<button type="button" class="no" data-a="rechazar">\u2717 Descartar</button></div>';
}

function cardGenerica(a){
  var id = esc(a.id);
  return (a.resumen ? '<p class="meta">'+esc(a.resumen)+'</p>' : '') +
    '<pre>'+esc(JSON.stringify(a.payload||{}, null, 2))+'</pre>' +
    '<div class="f"><label for="nota-'+id+'">Nota (opcional)</label><input id="nota-'+id+'" type="text"></div>' +
    '<div class="acts"><button type="button" class="ok" data-a="aprobar">\u2713 Aprobar</button>' +
    '<button type="button" class="no" data-a="rechazar">\u2717 Rechazar</button></div>';
}

function renderApr(){
  var lista = aprobaciones.filter(function(a){ return filtro==='todos' || a.tipo===filtro; });
  var h = chips();
  if(!lista.length){ app.innerHTML = h + '<div class="empty">\u2714 Nada pendiente de aprobar.</div>'; return; }
  lista.forEach(function(a){
    var p = a.payload || {}, l = a.lead || {};
    var esEmail = (typeof p.asunto === 'string') && (typeof p.cuerpo === 'string');
    h += '<article class="biz" id="a-'+esc(a.id)+'" data-id="'+esc(a.id)+'">' +
      '<h2>'+esc(a.titulo)+' <span class="badge'+(l.tier==='A'?' a':'')+'">Tier '+esc(l.tier||'?')+'</span>' +
      '<span class="badge">'+esc(LTIPO[l.tipo]||'')+'</span>' +
      '<span class="badge">'+esc(TIPOS[a.tipo]||a.tipo)+'</span></h2><div class="body">' +
      (l.web ? '<div class="meta">\u{1F310} <a href="https://'+esc(String(l.web).replace(/^https?:\\/\\//,''))+'" target="_blank" rel="noopener">'+esc(l.web)+'</a></div>' : '') +
      (l.demo_token ? '<div class="meta">Demo: <a href="https://demo.cannabicultor.com/demo/'+esc(l.demo_token)+'" target="_blank" rel="noopener">abrir</a></div>' : '') +
      (esEmail ? cardEmail(a, p) : cardGenerica(a)) + '</div></article>';
  });
  app.innerHTML = h;
}

function renderPipe(){
  var e = (resumen && resumen.embudo) || {};
  var h = '<div class="funnel">' + ESTADOS.map(function(s){
    return '<div class="stage"><b>'+(e[s]||0)+'</b>'+esc(ETIQUETA[s])+'</div>'; }).join('') + '</div>';
  h += '<p class="meta">'+(resumen.leads_total||0)+' leads en total \xB7 '+(resumen.leads_con_email||0)+' con email</p>';
  if(!leads.length){ app.innerHTML = h + '<div class="empty">Sin leads en pipeline todav\xEDa.</div>'; return; }
  h += '<div class="biz">';
  leads.forEach(function(l){
    h += '<div class="lead"><div><strong>'+esc(l.nombre)+'</strong> <span class="badge'+(l.tier==='A'?' a':'')+'">Tier '+esc(l.tier)+'</span>' +
      '<span class="badge">'+esc(ETIQUETA[l.estado]||l.estado)+'</span>' +
      '<div class="meta">'+esc(l.tipo)+(l.ciudad?' \xB7 '+esc(l.ciudad):'')+(l.email?' \xB7 '+esc(l.email):' \xB7 sin email')+'</div></div>' +
      '<div class="meta">'+(l.demo_token?'<a href="https://demo.cannabicultor.com/demo/'+esc(l.demo_token)+'" target="_blank" rel="noopener">demo</a>':'')+'</div></div>';
  });
  app.innerHTML = h + '</div>';
}

function gmailUrl(id){
  var para = document.getElementById('para-'+id).value.trim();
  var asu = document.getElementById('asu-'+id).value;
  var cue = document.getElementById('cue-'+id).value;
  return 'https://mail.google.com/mail/?authuser=alianzacannabicultores%40gmail.com&view=cm&fs=1&to='+encodeURIComponent(para)+'&su='+encodeURIComponent(asu)+'&body='+encodeURIComponent(cue);
}

function quitar(id){
  aprobaciones = aprobaciones.filter(function(a){ return a.id!==id; });
  document.getElementById('capr').textContent = aprobaciones.length;
  renderApr();
}

async function accion(id, action, boton){
  var art = document.getElementById('a-'+id);
  var cuerpo = {id:id, action:action};
  var para = document.getElementById('para-'+id);
  if(para){
    cuerpo.para = para.value.trim();
    cuerpo.asunto = document.getElementById('asu-'+id).value;
    cuerpo.cuerpo = document.getElementById('cue-'+id).value;
  }
  var nota = document.getElementById('nota-'+id);
  if(nota) cuerpo.nota = nota.value;
  if(action==='rechazar' && !confirm('\xBFDescartar este borrador?')) return;
  if(art) art.classList.add('gone');
  var r = await post('/api/ventas/act', cuerpo);
  if(!r.ok || !r.data.ok){ if(art) art.classList.remove('gone'); say('Error: ' + (r.data.message||'')); return; }
  say(r.data.message);
  quitar(id);
}

app.addEventListener('click', function(ev){
  var chip = ev.target.closest('button[data-f]');
  if(chip){ filtro = chip.dataset.f; renderApr(); return; }
  var b = ev.target.closest('button[data-a]'); if(!b) return;
  var art = b.closest('article'); if(!art) return;
  var id = art.dataset.id, a = b.dataset.a;
  if(a==='gmail'){ window.open(gmailUrl(id), '_blank', 'noopener'); return; }
  if(a==='copiar'){
    var txt = document.getElementById('asu-'+id).value + '\\n\\n' + document.getElementById('cue-'+id).value;
    navigator.clipboard.writeText(txt).then(function(){ say('Copiado'); }, function(){ say('No se pudo copiar'); });
    return;
  }
  accion(id, a, b);
});

document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click', function(){
    tab = b.dataset.t;
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.toggle('on', x===b); });
    render();
  });
});

document.getElementById('runAgents').addEventListener('click', async function(ev){
  var btn = ev.currentTarget; btn.disabled = true; say('Ejecutando agentes\u2026');
  var r = await post('/api/ventas/run', {agent:'todos'});
  btn.disabled = false;
  if(!r.ok || !r.data.ok){ say('Error: ' + (r.data.message||r.data.error||'')); return; }
  var p = r.data.prospector || {}, d = r.data.redactor || {};
  say('Prospector: ' + (p.emails||0) + ' emails nuevos \xB7 Redactor: ' + (d.borradores||0) + ' borradores' + (d.descartados ? ' (' + d.descartados + ' descartados por el filtro)' : ''));
  loadAll();
});

document.getElementById('backDash').href = '/dashboard?token=' + encodeURIComponent(token);
loadAll();
<\/script>
</body>
</html>`])));

// src/ventas.ts
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var BASE = "https://www.cannabicultor.com";
var DEMO_BASE = "https://demo.cannabicultor.com/demo/";
var BENCHMARK_URL = BASE + "/benchmark-ia.html";
var DIRECTORIO_URL = {
  growshop: BASE + "/growshops.html",
  cbd_shop: BASE + "/tiendas-cbd.html",
  asociacion: BASE + "/asociaciones.html",
  banco_semillas: BASE + "/buscador-cannabicultor.html"
};
var FIRMA = "Cannabicultor";
var BAJA = "Si prefieres no recibir m\xE1s mensajes nuestros, resp\xF3ndeme \xABbaja\xBB y no te escribo m\xE1s.";
var DEMO_GENERICO = {
  growshop: "83893cf3a881d076",
  cbd_shop: "40be27583081c3ce",
  asociacion: "a8b27f5a96397803"
};
var TIPOS_CANAL = ["growshop", "cbd_shop", "asociacion"];
var MAX_EMAIL1_PENDIENTES = 15;
var json = /* @__PURE__ */ __name((o, status = 200) => Response.json(o, { status }), "json");
async function handleVentas(req, env2, url, authed) {
  const p = url.pathname;
  if (p === "/ventas") {
    return new Response(VENTAS_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (!p.startsWith("/api/ventas/")) return null;
  if (!authed()) return json({ error: "unauthorized" }, 401);
  try {
    if (p === "/api/ventas/resumen") {
      return json({ ok: true, resumen: await restRpc(env2, "ventas_resumen") });
    }
    if (p === "/api/ventas/aprobaciones") {
      const q = url.searchParams.get("estado") ?? "pendiente";
      const estado = ["pendiente", "aprobado", "rechazado", "enviado"].includes(q) ? q : "pendiente";
      const rows = await restGet(
        env2,
        `ventas_aprobaciones?select=*,lead:ventas_leads(id,nombre,tier,tipo,estado,web,email,demo_token)&estado=eq.${estado}&order=created_at.asc&limit=200`
      );
      return json({ ok: true, aprobaciones: rows });
    }
    if (p === "/api/ventas/pipeline") {
      const rows = await restGet(
        env2,
        "ventas_leads?select=id,nombre,tier,tipo,estado,web,email,ciudad,demo_token,proxima_accion_at,ultimo_contacto_at&estado=neq.descartado&or=(estado.neq.nuevo,tier.eq.A)estado=neq.descartado&or=(estado.neq.nuevo,tier.eq.A)&order=tier.asc,updated_at.desc&limit=300"
      );
      return json({ ok: true, leads: rows });
    }
    if (p === "/api/ventas/act" && req.method === "POST") {
      const res = await actAprobacion(env2, await req.json());
      return json(res, res.ok ? 200 : 400);
    }
    if (p === "/api/ventas/run" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const agent = String(body?.agent ?? "todos");
      const out = {};
      if (agent === "prospector" || agent === "todos") out.prospector = await prospectContacts(env2, 8);
      if (agent === "redactor" || agent === "todos") out.redactor = await draftEmails(env2, 6);
      return json({ ok: true, ...out });
    }
    return json({ ok: false, error: "ruta desconocida" }, 404);
  } catch (err) {
    return json({ ok: false, message: String(err?.message ?? err) }, 500);
  }
}
__name(handleVentas, "handleVentas");
var TRAS_ENVIO = {
  email_1: { estado: "email1_enviado", dias: 4 },
  email_2: { estado: "demo_enviado", dias: 3 },
  seguimiento: { dias: 5 },
  respuesta: { dias: 3 }
};
async function actAprobacion(env2, b) {
  const id = String(b?.id ?? "");
  if (!UUID_RE.test(id)) return { ok: false, message: "id inv\xE1lido" };
  const action = String(b?.action ?? "");
  if (!["aprobar", "rechazar", "enviado"].includes(action)) return { ok: false, message: "acci\xF3n inv\xE1lida" };
  const rows = await restGet(env2, `ventas_aprobaciones?select=*&id=eq.${id}&limit=1`);
  const a = rows[0];
  if (!a) return { ok: false, message: "aprobaci\xF3n no encontrada" };
  if (a.estado === "enviado" || a.estado === "rechazado") return { ok: true, message: "ya estaba cerrada" };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nota = typeof b.nota === "string" && b.nota.trim() ? b.nota.trim().slice(0, 1e3) : null;
  const payload = { ...a.payload ?? {} };
  for (const k of ["para", "asunto", "cuerpo"]) {
    if (typeof b[k] === "string") payload[k] = b[k].slice(0, 8e3);
  }
  if (action === "rechazar") {
    await restPatch(env2, `ventas_aprobaciones?id=eq.${id}`, {
      estado: "rechazado",
      reviewed_at: now,
      nota_revision: nota
    });
    await evento(env2, a.lead_id, "aprobacion_rechazada", { aprobacion_id: id, tipo: a.tipo });
    return { ok: true, message: "descartado" };
  }
  if (action === "aprobar") {
    await restPatch(env2, `ventas_aprobaciones?id=eq.${id}`, {
      estado: "aprobado",
      reviewed_at: now,
      nota_revision: nota,
      payload
    });
    await evento(env2, a.lead_id, "aprobacion_aprobada", { aprobacion_id: id, tipo: a.tipo });
    return { ok: true, message: "aprobado" };
  }
  await restPatch(env2, `ventas_aprobaciones?id=eq.${id}`, {
    estado: "enviado",
    reviewed_at: now,
    sent_at: now,
    nota_revision: nota,
    payload
  });
  const next = TRAS_ENVIO[a.tipo];
  if (a.lead_id && next) {
    const patch = {
      ultimo_contacto_at: now,
      proxima_accion_at: new Date(Date.now() + next.dias * 864e5).toISOString()
    };
    if (next.estado) patch.estado = next.estado;
    await restPatch(env2, `ventas_leads?id=eq.${a.lead_id}`, patch);
  }
  if (a.lead_id && typeof payload.para === "string" && MAIL_OK.test(payload.para.trim())) {
    await restPatch(env2, `ventas_leads?id=eq.${a.lead_id}&email=is.null`, { email: payload.para.trim().toLowerCase() });
  }
  await evento(env2, a.lead_id, "email_enviado", { aprobacion_id: id, tipo: a.tipo });
  return { ok: true, message: "marcado como enviado" };
}
__name(actAprobacion, "actAprobacion");
async function evento(env2, leadId, tipo, detalle) {
  if (!leadId) return;
  await restPost(env2, "ventas_eventos", [{ lead_id: leadId, tipo, detalle }]);
}
__name(evento, "evento");
var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
var EMAIL_MALO = /(\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$)|sentry|wixpress|example\.|noreply|no-reply|@2x|domain\.com|tudominio|tuemail|email\.com$/i;
var LOCAL_BUENO = /^(info|contacto|hola|ventas|comercial|tienda|administracion|atencion|pedidos|hello)$/i;
function normalizarUrl(web) {
  const w = web.trim();
  return /^https?:\/\//i.test(w) ? w : "https://" + w;
}
__name(normalizarUrl, "normalizarUrl");
function host(u) {
  try {
    return new URL(normalizarUrl(u)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
__name(host, "host");
function extraerEmails(html) {
  const found = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase());
  const texto = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  for (const m of texto.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => MAIL_OK.test(e) && !EMAIL_MALO.test(e));
}
__name(extraerEmails, "extraerEmails");
function mejorEmail(emails, webLead) {
  const h = host(webLead);
  let best = null;
  let bestScore = -1;
  for (const e of emails) {
    const [local, dom] = e.split("@");
    let score = 0;
    if (h && (dom === h || dom.endsWith("." + h) || h.endsWith("." + dom))) score += 10;
    if (LOCAL_BUENO.test(local)) score += 5;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}
__name(mejorEmail, "mejorEmail");
function detectarPlataforma(html) {
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "Shopify";
  if (/prestashop/i.test(html)) return "PrestaShop";
  if (/woocommerce/i.test(html)) return "WooCommerce";
  if (/Magento|mage\/cookies/i.test(html)) return "Magento";
  if (/wp-content/i.test(html)) return "WordPress";
  return null;
}
__name(detectarPlataforma, "detectarPlataforma");
function enlacesContacto(html, base) {
  const out = [];
  const h = host(base);
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contact|aviso-legal|legal|quienes|about|sobre/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], normalizarUrl(base));
      if (u.hostname.replace(/^www\./, "").toLowerCase() === h && !out.includes(u.href)) out.push(u.href);
    } catch {
    }
  }
  out.sort((a, b) => Number(/contact/i.test(b)) - Number(/contact/i.test(a)));
  return out.slice(0, 2);
}
__name(enlacesContacto, "enlacesContacto");
async function fetchHtml(u) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8e3);
    const res = await fetch(u, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "CannabicultorBot/0.1 (+https://www.cannabicultor.com/contacto.html)",
        Accept: "text/html"
      }
    });
    clearTimeout(t);
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    return (await res.text()).slice(0, 4e5);
  } catch {
    return null;
  }
}
__name(fetchHtml, "fetchHtml");
async function prospectContacts(env2, limit) {
  const leads = (await porTipo(
    env2,
    "estado=eq.nuevo&email=is.null&web=not.is.null&contacto_intentado_at=is.null",
    "tier.asc,created_at.asc",
    Math.ceil(limit / TIPOS_CANAL.length)
  )).slice(0, limit);
  const res = { escaneados: 0, emails: 0, plataformas: 0 };
  for (const l of leads) {
    res.escaneados++;
    const patch = { contacto_intentado_at: (/* @__PURE__ */ new Date()).toISOString() };
    try {
      const base = normalizarUrl(l.web);
      const home = await fetchHtml(base);
      const paginas = home ? [home] : [];
      if (home) {
        for (const link of enlacesContacto(home, base)) {
          const h = await fetchHtml(link);
          if (h) paginas.push(h);
        }
        if (!l.plataforma) {
          const plat = detectarPlataforma(home);
          if (plat) {
            patch.plataforma = plat;
            res.plataformas++;
          }
        }
      }
      const email = mejorEmail(paginas.flatMap(extraerEmails), l.web);
      if (email) {
        patch.email = email;
        res.emails++;
        await evento(env2, l.id, "contacto_encontrado", { email, fuente: "web" });
      }
    } catch {
    }
    await restPatch(env2, `ventas_leads?id=eq.${l.id}`, patch);
  }
  return res;
}
__name(prospectContacts, "prospectContacts");
var SYSTEM_BASE = [
  "Eres el redactor comercial de Cannabicultor. Escribes emails B2B en espa\xF1ol de Espa\xF1a, tuteando con respeto, breves y sin humo.",
  "Cannabicultor se describe como: inteligencia artificial especializada en cannabis, una capa de inteligencia para el sector. No es solo un directorio.",
  "Reglas: usa SOLO los datos del objeto 'lead' y los 'enlaces' dados; no inventes datos del negocio, cifras ni enlaces.",
  "Sin emojis, sin exclamaciones, sin promesas de precios ni plazos, sin citar a otros clientes.",
  "No incluyas ning\xFAn enlace que no est\xE9 en 'enlaces' (tampoco la web del propio negocio).",
  "El cuerpo NO incluye saludo final, firma ni aviso de baja (se a\xF1aden solos). S\xED puede empezar con un saludo breve (Hola, ...).",
  'Devuelve SOLO un objeto JSON: {"asunto": "...", "cuerpo": "..."}.'
].join("\n");
var INSTRUCCION = {
  email_1: "Primer contacto (m\xE1x. 110 palabras). Objetivo: que verifique o complete su ficha gratuita en el directorio de Cannabicultor. Incluye el enlace 'directorio'. No hables a\xFAn del asesor de IA ni de precios.",
  email_2: "El negocio respondi\xF3 al primer contacto (m\xE1x. 150 palabras). Objetivo: proponerle un asesor de IA gratuito para su web y que pruebe el demo. Explica en 1-2 frases que resuelve dudas de producto y cultivo de sus clientes en su propia web. Aclara que cannabicultor.com no es solo un directorio y que tienen benchmarks propios (enlace 'benchmark') que demuestran su conocimiento de cannabis. Di que tanto el directorio como el asesor son totalmente gratuitos. Si hay enlace 'demo', incl\xFAyelo; si no lo hay, ofr\xE9cete a prepararle uno con su cat\xE1logo sin inventar ning\xFAn enlace.",
  seguimiento: "Recordatorio amable (m\xE1x. 60 palabras) a alguien que no ha respondido. Aporta una pregunta sencilla o un dato \xFAtil; no presiones y reconoce que estar\xE1 ocupado."
};
var CONTEXTO_TIPO = {
  growshop: "El negocio es un growshop (tienda de cultivo). El asesor resuelve dudas de producto y de cultivo de sus clientes en su web.",
  cbd_shop: "El negocio es una tienda de CBD. El asesor resuelve dudas de sus clientes sobre productos y su uso en su web. Sin afirmaciones de salud ni promesas terap\xE9uticas; no menciones nada que no sea informaci\xF3n general y responsable.",
  asociacion: "El destinatario es una asociaci\xF3n o club, entidad privada sin \xE1nimo de lucro. Tono discreto e institucional. No hables de consumo, compra, precios ni promoci\xF3n. El directorio recoge sus datos p\xFAblicos de contacto; el asesor de IA ser\xEDa un recurso informativo para sus socios sobre cultivo responsable y normativa, con fines educativos.",
  banco_semillas: "El negocio es un banco de semillas o breeder. El asesor ayuda a sus clientes a elegir variedad y resolver dudas de cultivo en su web.",
  distribuidor: "El negocio es un distribuidor o mayorista del sector. El asesor puede dar a sus clientes profesionales informaci\xF3n de producto y cultivo."
};
function entrelazarPorTipo(leads) {
  const grupos = /* @__PURE__ */ new Map();
  for (const l of leads) grupos.set(l.tipo, [...grupos.get(l.tipo) ?? [], l]);
  const cols = [...grupos.values()];
  const out = [];
  for (let i = 0; cols.some((c) => i < c.length); i++) for (const c of cols) if (i < c.length) out.push(c[i]);
  return out;
}
__name(entrelazarPorTipo, "entrelazarPorTipo");
async function porTipo(env2, filtro, orden, porCanal) {
  const partes = await Promise.all(
    TIPOS_CANAL.map((t) => restGet(env2, `ventas_leads?select=*&tipo=eq.${t}&${filtro}&order=${orden}&limit=${porCanal}`))
  );
  return entrelazarPorTipo(partes.flat());
}
__name(porTipo, "porTipo");
function urlsPermitidas(cuerpo, permitidas, hostsPermitidos = []) {
  const urls = cuerpo.match(/https?:\/\/[^\s)»"]+/g) ?? [];
  return urls.every(
    (u) => permitidas.some((p) => u.startsWith(p)) || hostsPermitidos.includes(host(u))
  );
}
__name(urlsPermitidas, "urlsPermitidas");
async function deepseekJson(env2, messages) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env2.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env2.VENTAS_MODEL || "deepseek-flash",
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages
    })
  });
  if (!res.ok) throw new Error(`DeepSeek -> ${res.status} ${await res.text()}`);
  const data = await res.json();
  try {
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}
__name(deepseekJson, "deepseekJson");
async function redactar(env2, lead, tipo) {
  const enlaces = {
    directorio: DIRECTORIO_URL[lead.tipo] ?? DIRECTORIO_URL.growshop,
    benchmark: BENCHMARK_URL
  };
  const token = lead.demo_token || DEMO_GENERICO[lead.tipo];
  if (token) enlaces.demo = DEMO_BASE + token;
  const out = await deepseekJson(env2, [
    {
      role: "system",
      content: SYSTEM_BASE + "\n\nContexto: " + (CONTEXTO_TIPO[lead.tipo] ?? CONTEXTO_TIPO.growshop) + "\n\nTarea: " + INSTRUCCION[tipo]
    },
    {
      role: "user",
      content: JSON.stringify({
        lead: {
          nombre: lead.nombre,
          tipo: lead.tipo,
          ciudad: lead.ciudad,
          web: lead.web,
          plataforma: lead.plataforma,
          contacto: lead.contacto_nombre,
          notas: lead.notas
        },
        enlaces
      })
    }
  ]);
  const asunto = typeof out?.asunto === "string" ? out.asunto.trim() : "";
  const cuerpo = typeof out?.cuerpo === "string" ? out.cuerpo.trim() : "";
  if (!asunto || asunto.length > 120 || cuerpo.length < 40 || cuerpo.length > 2500) return null;
  if (!urlsPermitidas(cuerpo, [...Object.values(enlaces), BASE], [host(lead.web ?? "")].filter(Boolean))) return null;
  const cierre = tipo === "email_2" ? "" : "\n\n" + BAJA;
  return {
    asunto,
    cuerpo: `${cuerpo}

Un saludo,
${FIRMA}${cierre}`,
    demo_url: enlaces.demo ?? null
  };
}
__name(redactar, "redactar");
var TITULO = { email_1: "Email 1", email_2: "Email 2 (demo)", seguimiento: "Seguimiento" };
async function draftEmails(env2, limit) {
  const res = { borradores: 0, descartados: 0, saltados_por_cola_llena: 0 };
  if (!env2.DEEPSEEK_API_KEY) return { ...res, error: "falta DEEPSEEK_API_KEY" };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const [calientes, seguir, nuevos] = await Promise.all([
    restGet(env2, "ventas_leads?select=*&estado=in.(respondio,demo_pendiente)&order=tier.asc,updated_at.asc&limit=20"),
    restGet(env2, `ventas_leads?select=*&estado=in.(email1_enviado,demo_enviado)&proxima_accion_at=lte.${now}&limit=20`),
    porTipo(env2, "estado=eq.nuevo&email=not.is.null", "tier.asc,created_at.asc", 10)
  ]);
  const ids = [...new Set([...calientes, ...seguir, ...nuevos].map((l) => l.id))];
  if (!ids.length) return res;
  const previas = await restGet(
    env2,
    `ventas_aprobaciones?select=lead_id,tipo,estado&lead_id=in.(${ids.join(",")})`
  );
  const tiene = /* @__PURE__ */ __name((id, tipo, estado) => previas.some((a) => a.lead_id === id && a.tipo === tipo && (!estado || a.estado === estado)), "tiene");
  const cuenta = /* @__PURE__ */ __name((id, tipo) => previas.filter((a) => a.lead_id === id && a.tipo === tipo).length, "cuenta");
  const email1Pendientes = previas.filter((a) => a.tipo === "email_1" && a.estado === "pendiente").length;
  const cola = [
    ...calientes.filter((l) => !tiene(l.id, "email_2")).map((lead) => ({ lead, tipo: "email_2" })),
    ...seguir.filter((l) => !tiene(l.id, "seguimiento", "pendiente") && cuenta(l.id, "seguimiento") < 2).map((lead) => ({ lead, tipo: "seguimiento" })),
    ...nuevos.filter((l) => !tiene(l.id, "email_1")).map((lead) => ({ lead, tipo: "email_1" }))
  ];
  let email1Cola = email1Pendientes;
  for (const { lead, tipo } of cola) {
    if (res.borradores >= limit) break;
    if (tipo === "email_1") {
      if (email1Cola >= MAX_EMAIL1_PENDIENTES) {
        res.saltados_por_cola_llena++;
        continue;
      }
    }
    try {
      let d = await redactar(env2, lead, tipo);
      if (!d) d = await redactar(env2, lead, tipo);
      if (!d) {
        res.descartados++;
        continue;
      }
      await restPost(env2, "ventas_aprobaciones", [{
        lead_id: lead.id,
        tipo,
        titulo: `${TITULO[tipo]} \u2192 ${lead.nombre}`,
        resumen: `Tier ${lead.tier} \xB7 ${lead.ciudad ?? "sin ciudad"}`,
        payload: { para: lead.email ?? "", asunto: d.asunto, cuerpo: d.cuerpo, demo_url: d.demo_url },
        agente: "redactor_v1"
      }]);
      if (tipo === "email_1") email1Cola++;
      res.borradores++;
    } catch (err) {
      res.descartados++;
      console.log("[ventas] redactor error", lead.nombre, String(err));
    }
  }
  return res;
}
__name(draftEmails, "draftEmails");
async function runVentasAgents(env2) {
  const prospector = await prospectContacts(env2, 6);
  const redactor = await draftEmails(env2, 4);
  console.log("[cron] ventas", JSON.stringify({ prospector, redactor }));
  return { prospector, redactor };
}
__name(runVentasAgents, "runVentasAgents");

// src/index.ts
var AREAS = [
  "Madrid",
  "Barcelona",
  "Valencia",
  "Sevilla",
  "Zaragoza",
  "Malaga",
  "Murcia",
  "Palma",
  "Las Palmas",
  "Bilbao",
  "Alicante",
  "Cordoba",
  "Valladolid",
  "Vigo",
  "Gijon",
  "Granada",
  "A Coruna",
  "Vitoria",
  "Santa Cruz de Tenerife",
  "Pamplona",
  "Almeria",
  "San Sebastian",
  "Santander",
  "Castellon",
  "Burgos",
  "Albacete",
  "Salamanca",
  "Logrono",
  "Badajoz",
  "Huelva",
  "Tarragona",
  "Leon",
  "Cadiz",
  "Jaen",
  "Ourense",
  "Girona",
  "Lleida",
  "Lugo",
  "Caceres",
  "Toledo",
  "Ceuta",
  "Melilla",
  "Guadalajara",
  "Pontevedra",
  "Palencia",
  "Ciudad Real",
  "Zamora",
  "Avila",
  "Cuenca",
  "Huesca",
  "Segovia",
  "Soria",
  "Teruel"
];
var AR_CRON = "30 2 * * *";
var CL_CRON = "30 3 * * *";
var CO_CRON = "30 4 * * *";
var MX_CRON = "30 5 * * *";
async function runEnrich(env2, tablesArg, limitArg) {
  const tables = (tablesArg || env2.ENTITY_TABLES || "growshops,asociaciones").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = limitArg ?? enrichBatch(env2, "ES");
  const results = [];
  for (const table3 of tables) {
    results.push(await enrichTable(env2, table3, limit));
  }
  return results;
}
__name(runEnrich, "runEnrich");
var index_default = {
  // Disparo programado (cron trigger): enriquece una tanda + descubre una zona (rotando).
  async scheduled(event, env2, ctx) {
    const cronPais = event.cron === AR_CRON ? "AR" : event.cron === CL_CRON ? "CL" : event.cron === CO_CRON ? "CO" : event.cron === MX_CRON ? "MX" : null;
    if (cronPais) {
      const tag = `[cron-${cronPais.toLowerCase()}]`;
      const write = env2[`${cronPais}_CRON_WRITE`] === "1";
      const modoCron = cronPais === "CO" || cronPais === "MX" ? "enriquecer" : "ambos";
      ctx.waitUntil(
        runPais(env2, { pais: cronPais, modo: modoCron, dry: !write }).then((r) => console.log(tag, JSON.stringify({ enrich: r.enrich && { scanned: r.enrich.scanned, applied: r.enrich.applied, proposals: r.enrich.proposals, errors: r.enrich.errors.length }, discover: r.discover.map((d) => ({ area: d.area, sweep: d.sweep, created: d.candidatesCreated, dup: d.duplicates, enriched: d.enrichedExisting })), budget: r.budget }))).catch((err) => console.log(`${tag} error`, String(err)))
      );
      return;
    }
    ctx.waitUntil(
      (async () => {
        resetProviders();
        try {
          const enrich = await runEnrich(env2);
          console.log("[cron] enrich", JSON.stringify(enrich));
          const threshold = parseFloat(env2.AUTO_APPROVE_MIN || "0.85");
          if (threshold <= 1) {
            const auto = await autoApproveHighConfidence(env2, threshold);
            console.log("[cron] auto-approve", JSON.stringify(auto));
          }
          const tick = Math.floor(Date.now() / (6 * 36e5));
          const sweeps = ["growshops", "cbd_shops", "asociaciones"];
          const area = AREAS[tick % AREAS.length];
          const sweep = sweeps[tick % sweeps.length];
          try {
            const disc = await discoverArea(env2, sweep, area);
            console.log("[cron] discover", JSON.stringify(disc));
          } catch (err) {
            console.log("[cron] discover error", String(err));
          }
          try {
            await runVentasAgents(env2);
          } catch (err) {
            console.log("[cron] ventas error", String(err));
          }
        } finally {
          await flushProviders(env2).catch(() => {
          });
        }
      })()
    );
  },
  // Disparo manual para pruebas / control.
  async fetch(req, env2) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "directory-agent", phase: "enrich_v1" });
    }
    const authed = /* @__PURE__ */ __name(() => {
      const token = url.searchParams.get("token") ?? req.headers.get("x-trigger-token");
      return !!env2.TRIGGER_TOKEN && token === env2.TRIGGER_TOKEN;
    }, "authed");
    if (url.pathname === "/run-autoapprove") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      const min = parseFloat(url.searchParams.get("min") || env2.AUTO_APPROVE_MIN || "0.85");
      try {
        const result = await autoApproveHighConfidence(env2, min);
        return Response.json({ ok: true, threshold: min, ...result });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/dashboard") {
      return new Response(dashboardHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/dashboard") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const stats = await restRpc(env2, "dashboard_stats");
        return Response.json({ ok: true, stats });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/budget") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({ ok: true, budget: await providerSnapshot(env2) });
    }
    if (url.pathname === "/api/metrics-7d") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const metrics = await getMetrics7d(env2);
        return Response.json({ ok: true, metrics });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/run-discover") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      const sweep = url.searchParams.get("sweep") ?? url.searchParams.get("table") ?? "growshops";
      const area = url.searchParams.get("area");
      if (!area) return Response.json({ error: "falta ?area=" }, { status: 400 });
      resetProviders();
      try {
        const result = await discoverArea(env2, sweep, area);
        return Response.json({ ok: true, result });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      } finally {
        await flushProviders(env2).catch(() => {
        });
      }
    }
    if (url.pathname === "/api/fotos-var") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const q = url.searchParams;
        const lista = await fotosVarList(env2, q.get("estado") || "pendiente", q.get("origen") || "", Number(q.get("limite")) || 24, Number(q.get("offset")) || 0);
        return Response.json({ ok: true, ...lista, conteo: await fotosVarConteo(env2) });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/fotos-var-act" && req.method === "POST") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const r = await fotosVarAct(env2, await req.json());
        return Response.json(r, { status: r.ok ? 200 : 400 });
      } catch (err) {
        return Response.json({ ok: false, message: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/review") {
      return new Response(reviewHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/proposals") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      const status = url.searchParams.get("status") ?? "pendiente";
      try {
        const proposals = await listProposals(env2, status);
        return Response.json({ ok: true, proposals });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/act" && req.method === "POST") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const { id, action } = await req.json();
        const result = action === "approve" ? await applyProposal(env2, id) : await rejectProposal(env2, id);
        return Response.json(result, { status: result.ok ? 200 : 400 });
      } catch (err) {
        return Response.json({ ok: false, message: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/candidates") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const candidates = await listCandidates(env2, url.searchParams.get("status") ?? "pending_review", url.searchParams.get("pais"));
        return Response.json({ ok: true, candidates });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/candidates-counts") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        return Response.json({ ok: true, counts: await candidateCounts(env2) });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/cand-act-bulk" && req.method === "POST") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const { action, items } = await req.json();
        if (!Array.isArray(items) || !["approve", "reject"].includes(action)) return Response.json({ ok: false, message: "peticion invalida" }, { status: 400 });
        const result = await bulkCandidates(env2, items, action);
        return Response.json(result, { status: result.ok ? 200 : 400 });
      } catch (err) {
        return Response.json({ ok: false, message: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/api/cand-act" && req.method === "POST") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      try {
        const { id, action, target } = await req.json();
        const result = action === "approve" ? await importCandidate(env2, id, target) : await rejectCandidate(env2, id);
        return Response.json(result, { status: result.ok ? 200 : 400 });
      } catch (err) {
        return Response.json({ ok: false, message: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/run-pais") {
      if (!authed()) return Response.json({ error: "unauthorized" }, { status: 401 });
      const modo = url.searchParams.get("modo") ?? "ambos";
      if (!["descubrir", "enriquecer", "ambos"].includes(modo)) return Response.json({ error: "modo invalido" }, { status: 400 });
      const dry = url.searchParams.get("dry") !== "0";
      const limit = url.searchParams.get("limit");
      const cities = url.searchParams.get("ciudades") ?? url.searchParams.get("cities");
      try {
        const result = await runPais(env2, {
          pais: (url.searchParams.get("pais") ?? "AR").toUpperCase(),
          modo,
          dry,
          limit: limit ? parseInt(limit, 10) : void 0,
          cities: cities ? cities.split(",").map((c) => c.trim()).filter(Boolean) : void 0
        });
        return Response.json({ ok: true, ...result });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      }
    }
    if (url.pathname === "/run") {
      const token = url.searchParams.get("token") ?? req.headers.get("x-trigger-token");
      if (!env2.TRIGGER_TOKEN || token !== env2.TRIGGER_TOKEN) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const table3 = url.searchParams.get("table") ?? void 0;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : void 0;
      resetProviders();
      try {
        const results = await runEnrich(env2, table3, limit);
        return Response.json({ ok: true, results });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
      } finally {
        await flushProviders(env2).catch(() => {
        });
      }
    }
    const ventasRes = await handleVentas(req, env2, url, authed);
    if (ventasRes) return ventasRes;
    return new Response("Cannabicultor Directory Agent. Endpoints: /health, /run, /run-pais, /ventas", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
