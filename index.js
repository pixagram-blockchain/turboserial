/**
 * TurboSerial v0.3.0 — Full-feature rewrite for raw speed
 *
 * Same API & wire-format type codes as v0.1.0.
 * Architecture: single flat class, no alignment padding, no ensure(),
 * pre-generated ASCII decoders, asm.js-style coercion.
 */
"use strict";

// ── Pre-generated ASCII decoders (0–127 bytes) ───────────────────────
const _ascDec = new Array(128);
for (let n = 0; n < 128; n++) {
  const a = [];
  for (let j = 0; j < n; j++) a.push(`b[o+${j}]`);
  _ascDec[n] = new Function("b", "o", `return String.fromCharCode(${a.join(",")});`);
}

// ── Float32 precision scratch ─────────────────────────────────────────
const _f32 = new Float32Array(1);

// ── Well-known symbols ────────────────────────────────────────────────
const WELLKNOWN_SYMBOLS = new Map();
const WELLKNOWN_BY_NAME = new Map();
for (const n of [
  'asyncIterator','hasInstance','isConcatSpreadable','iterator','match',
  'matchAll','replace','search','species','split','toPrimitive','toStringTag','unscopables'
]) {
  const s = Symbol[n];
  if (s) { WELLKNOWN_SYMBOLS.set(s, n); WELLKNOWN_BY_NAME.set(n, s); }
}

// ── Type constants (identical to v0.1.0) ──────────────────────────────
const T = {
  NULL:0x00,UNDEFINED:0x01,FALSE:0x02,TRUE:0x03,
  INT8:0x10,INT16:0x11,INT32:0x12,UINT32:0x13,FLOAT32:0x14,FLOAT64:0x15,
  NAN:0x16,INFINITY:0x17,NEG_INFINITY:0x18,NEG_ZERO:0x19,VARINT:0x1A,
  BIGINT_POS_SMALL:0x20,BIGINT_NEG_SMALL:0x21,BIGINT_POS_LARGE:0x22,BIGINT_NEG_LARGE:0x23,
  STRING_EMPTY:0x30,STRING_ASCII_TINY:0x31,STRING_ASCII_SHORT:0x32,STRING_ASCII_LONG:0x33,
  STRING_UTF8_TINY:0x34,STRING_UTF8_SHORT:0x35,STRING_UTF8_LONG:0x36,STRING_REF:0x37,
  ARRAY_EMPTY:0x40,ARRAY_DENSE:0x41,ARRAY_SPARSE:0x42,
  ARRAY_PACKED_I8:0x43,ARRAY_PACKED_I16:0x44,ARRAY_PACKED_I32:0x45,
  ARRAY_PACKED_F32:0x46,ARRAY_PACKED_F64:0x47,
  OBJECT_EMPTY:0x50,OBJECT_PLAIN:0x51,OBJECT_LITERAL:0x52,
  OBJECT_CONSTRUCTOR:0x53,OBJECT_WITH_DESCRIPTORS:0x54,OBJECT_WITH_METHODS:0x55,
  UINT8ARRAY:0x60,INT8ARRAY:0x61,UINT8CLAMPEDARRAY:0x62,UINT16ARRAY:0x63,
  INT16ARRAY:0x64,UINT32ARRAY:0x65,INT32ARRAY:0x66,FLOAT32ARRAY:0x67,
  FLOAT64ARRAY:0x68,BIGINT64ARRAY:0x69,BIGUINT64ARRAY:0x6A,DATAVIEW:0x6B,
  ARRAYBUFFER:0x70,BUFFER_REF:0x71,SHAREDARRAYBUFFER:0x72,
  MAP:0x80,SET:0x81,
  DATE:0x90,DATE_INVALID:0x91,
  ERROR:0xA0,EVAL_ERROR:0xA1,RANGE_ERROR:0xA2,REFERENCE_ERROR:0xA3,
  SYNTAX_ERROR:0xA4,TYPE_ERROR:0xA5,URI_ERROR:0xA6,AGGREGATE_ERROR:0xA7,CUSTOM_ERROR:0xA8,
  REGEXP:0xB0,
  BLOB:0xC0,FILE:0xC1,
  REFERENCE:0xD0,CIRCULAR_REF:0xD1,
  SYMBOL:0xE0,SYMBOL_GLOBAL:0xE1,SYMBOL_WELLKNOWN:0xE2,SYMBOL_NO_DESC:0xE3,
  FUNCTION_PLACEHOLDER:0xF0,
};

const GM = 0xF0; // group mask

// ── Lookup tables ─────────────────────────────────────────────────────
const BPE = [];
const TCTOR = [];
{
  const e = [
    [0x60,1,'Uint8Array'],[0x61,1,'Int8Array'],[0x62,1,'Uint8ClampedArray'],
    [0x63,2,'Uint16Array'],[0x64,2,'Int16Array'],[0x65,4,'Uint32Array'],
    [0x66,4,'Int32Array'],[0x67,4,'Float32Array'],[0x68,8,'Float64Array'],
    [0x69,8,'BigInt64Array'],[0x6A,8,'BigUint64Array'],[0x6B,1,'DataView'],
    [0x43,1,null],[0x44,2,null],[0x45,4,null],[0x46,4,null],[0x47,8,null],
  ];
  for (const [t,b,name] of e) {
    BPE[t] = b;
    if (name && globalThis[name]) TCTOR[t] = globalThis[name];
  }
}

const CTOR_MAP = new Map();
{
  const pairs = [
    [Date,T.DATE],[RegExp,T.REGEXP],[Map,T.MAP],[Set,T.SET],[ArrayBuffer,T.ARRAYBUFFER],
  ];
  const ta = ['Uint8Array','Int8Array','Uint8ClampedArray','Uint16Array','Int16Array',
    'Uint32Array','Int32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','DataView'];
  for (const [c,t] of pairs) CTOR_MAP.set(c,t);
  for (let i = 0; i < ta.length; i++) { const c = globalThis[ta[i]]; if (c) CTOR_MAP.set(c, 0x60+i); }
  if (globalThis.SharedArrayBuffer) CTOR_MAP.set(SharedArrayBuffer, T.SHAREDARRAYBUFFER);
}

const ERR_CTORS = {
  [T.ERROR]:Error,[T.EVAL_ERROR]:EvalError,[T.RANGE_ERROR]:RangeError,
  [T.REFERENCE_ERROR]:ReferenceError,[T.SYNTAX_ERROR]:SyntaxError,
  [T.TYPE_ERROR]:TypeError,[T.URI_ERROR]:URIError,
};
const ERR_NAMES = new Map([
  ['Error',T.ERROR],['EvalError',T.EVAL_ERROR],['RangeError',T.RANGE_ERROR],
  ['ReferenceError',T.REFERENCE_ERROR],['SyntaxError',T.SYNTAX_ERROR],
  ['TypeError',T.TYPE_ERROR],['URIError',T.URI_ERROR],['AggregateError',T.AGGREGATE_ERROR],
]);

const MAGIC = 0x54425236; // TBR6

// ── TurboSerial ───────────────────────────────────────────────────────
class TurboSerial {
  constructor(options = {}) {
    this.options = {
      compression: options.compression || false,
      deduplication: options.deduplication !== false,
      shareArrayBuffers: options.shareArrayBuffers !== false,
      simdOptimization: options.simdOptimization !== false,
      detectCircular: options.detectCircular !== false,
      allowFunction: options.allowFunction || false,
      serializeFunctions: options.serializeFunctions || false,
      preservePropertyDescriptors: options.preservePropertyDescriptors !== false,
      sortKeys: options.sortKeys || false,
      memoryPoolSize: options.memoryPoolSize || 65536,
      ...options
    };
    if (!this.options.allowFunction) this.options.serializeFunctions = false;

    const sz = Math.max(this.options.memoryPoolSize, 65536);
    this.buf = new Uint8Array(sz);
    this.dv = new DataView(this.buf.buffer);
    this.pos = 0;
    this.enc = new TextEncoder();
    this.dec = new TextDecoder();
    // Serialize tracking
    this.refs = new Map();
    this.circularRefs = new Set();
    this.strings = new Map();
    this.buffers = new Map();
    // Deserialize state
    this.deserializeRefs = null;
    this.deserializeStrings = null;
    this.deserializeBuffers = null;
    this.buffer = null;
    this.view = null;
  }

  // ── Ensure capacity (grows buffer if needed) ──────────────────────
  _grow(need) {
    const req = this.pos + need;
    if (req <= this.buf.length) return;
    let ns = this.buf.length;
    while (ns < req) ns = ns << 1;
    const nb = new Uint8Array(ns);
    nb.set(this.buf.subarray(0, this.pos));
    this.buf = nb;
    this.dv = new DataView(nb.buffer);
  }

  // ── Public API ────────────────────────────────────────────────────

  serialize(value) {
    this.resetState();
    // Header
    this._grow(5);
    this.dv.setUint32(0, MAGIC, true);
    this.buf[4] = 6;
    this.pos = 5;
    if (this.options.detectCircular) this.detectCircularReferences(value, new WeakSet());
    this.writeValue(value);
    return this.buf.slice(0, this.pos);
  }

  deserialize(input) {
    this.buffer = (input instanceof Uint8Array) ? input : new Uint8Array(input);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    this.pos = 0;
    this.deserializeRefs = [];
    this.deserializeStrings = [];
    this.deserializeBuffers = [];
    const magic = this.view.getUint32(0, true);
    if (magic !== MAGIC) throw new Error("Invalid TurboSerial data");
    if (this.buffer[4] !== 6) throw new Error(`Unsupported version: ${this.buffer[4]}`);
    this.pos = 5;
    return this.readValue();
  }

  resetState() {
    this.pos = 0;
    this.refs.clear();
    this.circularRefs.clear();
    this.strings.clear();
    this.buffers.clear();
  }

  resetMemory(opts = {}) {
    const sz = opts.shrink ? Math.max(this.options.memoryPoolSize || 65536, 256) : this.buf.length;
    this.buf = new Uint8Array(sz);
    this.dv = new DataView(this.buf.buffer);
    this.pos = 0;
    this.refs.clear();
    this.circularRefs.clear();
    this.strings.clear();
    this.buffers.clear();
    if (this.deserializeRefs) { this.deserializeRefs.length = 0; this.deserializeRefs = null; }
    if (this.deserializeStrings) { this.deserializeStrings.length = 0; this.deserializeStrings = null; }
    if (this.deserializeBuffers) { this.deserializeBuffers.length = 0; this.deserializeBuffers = null; }
    return this;
  }

  // ── Circular detection ────────────────────────────────────────────

  detectCircularReferences(value, visited) {
    if (typeof value !== "object" || value === null) return;
    if (visited.has(value)) { this.circularRefs.add(value); return; }
    visited.add(value);
    try {
      if (Array.isArray(value)) {
        for (let i = 0, l = value.length; i < l; i++) {
          if (i in value) this.detectCircularReferences(value[i], visited);
        }
      } else if (value instanceof Map) {
        for (const [k,v] of value) { this.detectCircularReferences(k, visited); this.detectCircularReferences(v, visited); }
      } else if (value instanceof Set) {
        for (const item of value) this.detectCircularReferences(item, visited);
      } else {
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
          try { this.detectCircularReferences(value[keys[i]], visited); } catch(e) {}
        }
      }
    } finally { visited.delete(value); }
  }

  // ── Write: varint ─────────────────────────────────────────────────

  _wV(v) {
    v = v >>> 0;
    const b = this.buf;
    let p = this.pos;
    if (v < 0x80) { b[p] = v; this.pos = p + 1; return; }
    if (v < 0x4000) { b[p] = (v & 0x7F) | 0x80; b[p+1] = v >>> 7; this.pos = p + 2; return; }
    while (v >= 0x80) { b[p++] = (v & 0x7F) | 0x80; v >>>= 7; }
    b[p++] = v;
    this.pos = p;
  }

  // ── Write: main dispatch ──────────────────────────────────────────

  writeValue(value) {
    // Inline primitives
    if (value === null) { this._grow(1); this.buf[this.pos++] = 0x00; return; }
    if (value === undefined) { this._grow(1); this.buf[this.pos++] = 0x01; return; }

    const tp = typeof value;
    if (tp === "boolean") { this._grow(1); this.buf[this.pos++] = value ? 0x03 : 0x02; return; }
    if (tp === "number") { this._wNum(value); return; }
    if (tp === "string") { this._wStrDedup(value); return; }
    if (tp === "bigint") { this._wBigInt(value); return; }

    if (tp === "symbol") {
      this._grow(2);
      const key = Symbol.keyFor(value);
      if (key !== undefined) { this.buf[this.pos++] = T.SYMBOL_GLOBAL; this.writeValue(key); }
      else if (WELLKNOWN_SYMBOLS.has(value)) { this.buf[this.pos++] = T.SYMBOL_WELLKNOWN; this.writeValue(WELLKNOWN_SYMBOLS.get(value)); }
      else if (value.description === undefined) { this.buf[this.pos++] = T.SYMBOL_NO_DESC; }
      else { this.buf[this.pos++] = T.SYMBOL; this.writeValue(value.description); }
      return;
    }

    if (tp === "function") {
      this._grow(1);
      this.buf[this.pos++] = this.options.allowFunction ? T.FUNCTION_PLACEHOLDER : T.UNDEFINED;
      return;
    }

    // ── Object path ──

    // Circular ref
    if (this.options.detectCircular && this.circularRefs.has(value)) {
      const rid = this.refs.get(value);
      if (rid !== undefined) { this._grow(6); this.buf[this.pos++] = T.CIRCULAR_REF; this._wV(rid); return; }
      this.refs.set(value, this.refs.size);
    }
    // Object dedup
    if (this.options.deduplication && !this.circularRefs.has(value)) {
      const rid = this.refs.get(value);
      if (rid !== undefined) { this._grow(6); this.buf[this.pos++] = T.REFERENCE; this._wV(rid); return; }
      this.refs.set(value, this.refs.size);
    }
    // ArrayBuffer sharing
    if (this.options.shareArrayBuffers && value instanceof ArrayBuffer) {
      const bid = this.buffers.get(value);
      if (bid !== undefined) { this._grow(6); this.buf[this.pos++] = T.BUFFER_REF; this._wV(bid); return; }
      this.buffers.set(value, this.buffers.size);
    }

    this._wObj(value);
  }

  // ── Write: string with dedup ──────────────────────────────────────

  _wStrDedup(value) {
    if (this.options.deduplication && value.length > 3) {
      const sid = this.strings.get(value);
      if (sid !== undefined) {
        this._grow(6);
        this.buf[this.pos++] = T.STRING_REF;
        this._wV(sid);
        return;
      }
      this.strings.set(value, this.strings.size);
    }
    this._wStr(value);
  }

  // ── Write: numbers ────────────────────────────────────────────────

  _wNum(v) {
    this._grow(10);
    
    let p = this.pos;
    if (v !== v) { this.buf[p] = T.NAN; this.pos = p+1; return; }
    if (v === Infinity) { this.buf[p] = T.INFINITY; this.pos = p+1; return; }
    if (v === -Infinity) { this.buf[p] = T.NEG_INFINITY; this.pos = p+1; return; }
    if (v === 0 && (1/v) < 0) { this.buf[p] = T.NEG_ZERO; this.pos = p+1; return; }
    const iv = v | 0;
    if (v === iv) {
      if (iv >= -0x80 && iv <= 0x7F) { this.buf[p] = T.INT8; this.buf[p+1] = iv & 0xFF; this.pos = p+2; }
      else if (iv >= -0x8000 && iv <= 0x7FFF) { this.buf[p] = T.INT16; this.dv.setInt16(p+1, iv, true); this.pos = p+3; }
      else { this.buf[p] = T.INT32; this.dv.setInt32(p+1, iv, true); this.pos = p+5; }
      return;
    }
    const uv = v >>> 0;
    if (v === uv) { this.buf[p] = T.UINT32; this.dv.setUint32(p+1, uv, true); this.pos = p+5; return; }
    _f32[0] = v;
    if (_f32[0] === v) { this.buf[p] = T.FLOAT32; this.dv.setFloat32(p+1, v, true); this.pos = p+5; }
    else { this.buf[p] = T.FLOAT64; this.dv.setFloat64(p+1, v, true); this.pos = p+9; }
  }

  // ── Write: bigint ─────────────────────────────────────────────────

  _wBigInt(v) {
    this._grow(10);
    const neg = v < 0n, abs = neg ? -v : v;
    if (abs <= 0x7FFFFFFFFFFFFFFFn) {
      this.buf[this.pos++] = neg ? T.BIGINT_NEG_SMALL : T.BIGINT_POS_SMALL;
      this.dv.setBigInt64(this.pos, v, true);
      this.pos += 8;
    } else {
      this.buf[this.pos++] = neg ? T.BIGINT_NEG_LARGE : T.BIGINT_POS_LARGE;
      let hex = abs.toString(16);
      if (hex.length & 1) hex = "0" + hex;
      const len = hex.length >>> 1;
      this._grow(len + 5);
      this._wV(len);
      for (let i = hex.length - 2; i >= 0; i -= 2) this.buf[this.pos++] = parseInt(hex.substr(i, 2), 16);
      if (hex.length % 2) this.buf[this.pos++] = parseInt(hex[0], 16);
    }
  }

  // ── Write: strings ────────────────────────────────────────────────

  _wStr(value) {
    const len = value.length;

    if (len === 0) { this._grow(1); this.buf[this.pos++] = T.STRING_EMPTY; return; }

    if (len < 128) {
      let ascii = 1;
      for (let i = 0; i < len; i++) { if (value.charCodeAt(i) > 0x7F) { ascii = 0; break; } }
      if (ascii) {
        this._grow(len + 2);
        let p = this.pos;
        this.buf[p++] = len < 16 ? T.STRING_ASCII_TINY : T.STRING_ASCII_SHORT;
        this.buf[p++] = len;
        for (let i = 0; i < len; i++) this.buf[p + i] = value.charCodeAt(i);
        this.pos = p + len;
        return;
      }
      const enc = this.enc.encode(value);
      const bl = enc.length;
      this._grow(bl + 7);
      let p = this.pos;
      this.buf[p++] = bl < 16 ? T.STRING_UTF8_TINY : bl < 256 ? T.STRING_UTF8_SHORT : T.STRING_UTF8_LONG;
      if (bl < 256) { this.buf[p++] = bl; } else { this.pos = p; this._wV(bl); p = this.pos; }
      this.buf.set(enc, p);
      this.pos = p + bl;
      return;
    }

    const enc = this.enc.encode(value);
    const bl = enc.length;
    this._grow(bl + 7);
    let p = this.pos;
    if (bl === len) {
      this.buf[p++] = len < 256 ? T.STRING_ASCII_SHORT : T.STRING_ASCII_LONG;
      if (len < 256) { this.buf[p++] = len; } else { this.pos = p; this._wV(len); p = this.pos; }
    } else {
      this.buf[p++] = bl < 256 ? T.STRING_UTF8_SHORT : T.STRING_UTF8_LONG;
      if (bl < 256) { this.buf[p++] = bl; } else { this.pos = p; this._wV(bl); p = this.pos; }
    }
    this.buf.set(enc, p);
    this.pos = p + bl;
  }

  // ── Write: objects (dispatch) ─────────────────────────────────────

  _wObj(value) {
    
    if (Array.isArray(value)) { this._wArr(value); return; }

    const ctor = value.constructor;
    const mapped = CTOR_MAP.get(ctor);
    if (mapped !== undefined) {
      if (mapped === T.DATE) {
        this._grow(9); const t = value.getTime();
        if (t !== t) { this.buf[this.pos++] = T.DATE_INVALID; } else { this.buf[this.pos++] = T.DATE; this.dv.setFloat64(this.pos, t, true); this.pos += 8; }
        return;
      }
      if (mapped === T.REGEXP) { this._grow(1); this.buf[this.pos++] = T.REGEXP; this.writeValue(value.source); this.writeValue(value.flags); return; }
      if (mapped === T.MAP) { this._grow(6); this.buf[this.pos++] = T.MAP; this._wV(value.size); for (const [k,v] of value) { this.writeValue(k); this.writeValue(v); } return; }
      if (mapped === T.SET) { this._grow(6); this.buf[this.pos++] = T.SET; this._wV(value.size); for (const item of value) this.writeValue(item); return; }
      if (mapped === T.ARRAYBUFFER || mapped === T.SHAREDARRAYBUFFER) {
        this._grow(6); this.buf[this.pos++] = mapped;
        const bytes = new Uint8Array(value);
        this._wV(bytes.length);
        this._grow(bytes.length);
        this.buf.set(bytes, this.pos);
        this.pos += bytes.length;
        return;
      }
      if ((mapped & 0xF0) === 0x60) { this._wTypedArr(value, mapped); return; }
    }

    if (value instanceof Error) {
      this._grow(2);
      const et = ERR_NAMES.get(value.constructor.name) || T.CUSTOM_ERROR;
      this.buf[this.pos++] = et;
      this.writeValue(value.message || "");
      this.writeValue(value.stack || "");
      if (et === T.AGGREGATE_ERROR && value.errors) {
        this._wV(value.errors.length);
        for (const e of value.errors) this.writeValue(e);
      }
      return;
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      this._grow(12); this.buf[this.pos++] = (value instanceof File) ? T.FILE : T.BLOB;
      this._wV(0); this._wV(0);
      return;
    }

    this._wPlainObj(value);
  }

  // ── Write: arrays ─────────────────────────────────────────────────

  _wArr(arr) {
    const len = arr.length;
    if (len === 0) { this._grow(1); this.buf[this.pos++] = T.ARRAY_EMPTY; return; }
    let sparse = false;
    for (let i = 0; i < len; i++) { if (!(i in arr)) { sparse = true; break; } }
    if (sparse) {
      this._grow(12); this.buf[this.pos++] = T.ARRAY_SPARSE; this._wV(len);
      const entries = [];
      for (let i = 0; i < len; i++) { if (i in arr) entries.push(i); }
      this._wV(entries.length);
      for (const idx of entries) { this._wV(idx); this.writeValue(arr[idx]); }
      return;
    }
    if (this.options.simdOptimization && len >= 8 && typeof arr[0] === "number") {
      const packed = this._detectPacked(arr, len);
      if (packed) { this._grow(6); this.buf[this.pos++] = packed; this._wPacked(arr, len, packed); return; }
    }
    this._grow(6); this.buf[this.pos++] = T.ARRAY_DENSE; this._wV(len);
    for (let i = 0; i < len; i++) this.writeValue(arr[i]);
  }

  _detectPacked(arr, len) {
    let allInt = 1, min = arr[0], max = arr[0], canF32 = 1;
    for (let i = 0; i < len; i++) {
      const v = arr[i];
      if (typeof v !== "number") return 0;
      if (v !== (v | 0)) allInt = 0;
      if (v < min) min = v; if (v > max) max = v;
      if (canF32) { _f32[0] = v; if (_f32[0] !== v) canF32 = 0; }
    }
    if (allInt) {
      const am = Math.max(Math.abs(min), Math.abs(max));
      if (am <= 0x7F) return T.ARRAY_PACKED_I8;
      if (am <= 0x7FFF) return T.ARRAY_PACKED_I16;
      return T.ARRAY_PACKED_I32;
    }
    return canF32 ? T.ARRAY_PACKED_F32 : T.ARRAY_PACKED_F64;
  }

  _wPacked(arr, len, type) {
    const dv = this.dv;
    this._wV(len);
    const es = BPE[type] || 1;
    this._grow(len * es);
    let p = this.pos;
    switch (type) {
      case T.ARRAY_PACKED_I8:  for (let i = 0; i < len; i++) this.buf[p++] = arr[i] & 0xFF; break;
      case T.ARRAY_PACKED_I16: for (let i = 0; i < len; i++) { this.dv.setInt16(p, arr[i], true); p += 2; } break;
      case T.ARRAY_PACKED_I32: for (let i = 0; i < len; i++) { this.dv.setInt32(p, arr[i], true); p += 4; } break;
      case T.ARRAY_PACKED_F32: for (let i = 0; i < len; i++) { this.dv.setFloat32(p, arr[i], true); p += 4; } break;
      case T.ARRAY_PACKED_F64: for (let i = 0; i < len; i++) { this.dv.setFloat64(p, arr[i], true); p += 8; } break;
    }
    this.pos = p;
  }

  // ── Write: typed arrays ───────────────────────────────────────────

  _wTypedArr(arr, type) {
    this._grow(12);
    this.buf[this.pos++] = type;
    const buffer = arr.buffer;
    if (this.options.shareArrayBuffers) {
      const bid = this.buffers.get(buffer);
      if (bid !== undefined) {
        this.buf[this.pos++] = 1; // shared flag
        this._wV(bid); this._wV(arr.byteOffset); this._wV(arr.length);
        return;
      }
      this.buffers.set(buffer, this.buffers.size);
    }
    this.buf[this.pos++] = 0; // not shared
    this._wV(arr.byteOffset); this._wV(arr.length);
    const es = BPE[type] || 1;
    if (type === T.BIGINT64ARRAY || type === T.BIGUINT64ARRAY) {
      this._grow(arr.length * 8);
      for (let i = 0; i < arr.length; i++) { this.dv.setBigInt64(this.pos, arr[i], true); this.pos += 8; }
    } else {
      const tb = arr.length * es;
      this._grow(tb);
      const src = new Uint8Array(buffer, arr.byteOffset, tb);
      this.buf.set(src, this.pos);
      this.pos += tb;
    }
  }

  // ── Write: plain objects ──────────────────────────────────────────

  _wPlainObj(obj) {
    const proto = Object.getPrototypeOf(obj);
    const isPlain = (obj.constructor === Object) || (proto === Object.prototype) || (proto === null);
    const keys = Object.keys(obj);

    if (keys.length === 0 && isPlain) { this._grow(1); this.buf[this.pos++] = T.OBJECT_EMPTY; return; }

    // Classify object type
    if (!isPlain) {
      this._wConstructorObj(obj, keys);
      return;
    }

    if (this.options.preservePropertyDescriptors) {
      // Check for complex descriptors
      const allKeys = [...Object.getOwnPropertyNames(obj), ...Object.getOwnPropertySymbols(obj)];
      let hasComplex = false;
      for (const k of allKeys) {
        const d = Object.getOwnPropertyDescriptor(obj, k);
        if (d.get || d.set || !d.enumerable || !d.writable || !d.configurable) { hasComplex = true; break; }
      }
      if (hasComplex) { this._wDescriptorObj(obj, allKeys); return; }
    }

    // Check for methods
    let hasMethods = false;
    if (this.options.allowFunction) {
      for (let i = 0; i < keys.length; i++) {
        if (typeof obj[keys[i]] === "function") { hasMethods = true; break; }
      }
    }
    if (hasMethods) { this._wMethodObj(obj, keys); return; }

    // Simple object
    this._grow(6);
    this.buf[this.pos++] = T.OBJECT_LITERAL;
    if (this.options.sortKeys) keys.sort();
    // Count non-function keys
    let count = keys.length;
    if (!this.options.serializeFunctions) {
      count = 0;
      for (let i = 0; i < keys.length; i++) { if (typeof obj[keys[i]] !== "function") count++; }
    }
    this._wV(count);
    for (let i = 0; i < keys.length; i++) {
      const v = obj[keys[i]];
      if (!this.options.serializeFunctions && typeof v === "function") continue;
      this.writeValue(keys[i]);
      this.writeValue(v);
    }
  }

  _wDescriptorObj(obj, allKeys) {
    this._grow(6);
    this.buf[this.pos++] = T.OBJECT_WITH_DESCRIPTORS;
    const serializable = allKeys.filter(k => {
      try {
        const d = Object.getOwnPropertyDescriptor(obj, k);
        return d && (this.options.serializeFunctions || (!d.get && !d.set && typeof d.value !== "function"));
      } catch(e) { return false; }
    });
    this._wV(serializable.length);
    for (const key of serializable) {
      this.writeValue(key);
      const d = Object.getOwnPropertyDescriptor(obj, key);
      let flags = 0;
      if (d.enumerable) flags |= 1; if (d.writable) flags |= 2; if (d.configurable) flags |= 4;
      if (d.get) flags |= 8; if (d.set) flags |= 16;
      this._grow(1); this.buf[this.pos++] = flags;
      if (d.get || d.set) { if (d.get) this.writeValue(d.get); if (d.set) this.writeValue(d.set); }
      else this.writeValue(d.value);
    }
  }

  _wMethodObj(obj, keys) {
    this._grow(6);
    this.buf[this.pos++] = T.OBJECT_WITH_METHODS;
    const entries = [];
    for (const k of keys) {
      try {
        const v = obj[k];
        entries.push([k, v, typeof v === "function"]);
      } catch(e) {}
    }
    this._wV(entries.length);
    for (const [k, v, isFunc] of entries) {
      this.writeValue(k);
      this._grow(1); this.buf[this.pos++] = isFunc ? 1 : 0;
      if (isFunc && this.options.serializeFunctions) {
        this.writeValue(v.toString());
        this.writeValue(v.name || "");
      } else if (!isFunc) {
        this.writeValue(v);
      } else {
        this._grow(1); this.buf[this.pos++] = T.FUNCTION_PLACEHOLDER;
      }
    }
  }

  _wConstructorObj(obj, keys) {
    this._grow(6);
    this.buf[this.pos++] = T.OBJECT_CONSTRUCTOR;
    this.writeValue(obj.constructor?.name || "");
    const sk = this.options.serializeFunctions
      ? keys
      : keys.filter(k => { try { return typeof obj[k] !== "function"; } catch(e) { return false; } });
    this._wV(sk.length);
    for (const k of sk) { this.writeValue(k); this.writeValue(obj[k]); }
  }

  // ══════════════════════════════════════════════════════════════════
  // ── DESERIALIZATION ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════

  readValue() {
    const b = this.buffer;
    const type = this.buf[this.pos++];

    // References
    if (type === T.REFERENCE || type === T.CIRCULAR_REF) return this.deserializeRefs[this._rV()];
    if (type === T.STRING_REF) return this.deserializeStrings[this._rV()];
    if (type === T.BUFFER_REF) return this.deserializeBuffers[this._rV()];

    const g = type & GM;

    // Primitives
    if (g === 0x00) { return type === 0x00 ? null : type === 0x01 ? undefined : type === 0x03; }
    // Numbers
    if (g === 0x10) return this._rNum(type);
    // BigInt
    if (g === 0x20) return this._rBigInt(type);
    // String
    if (g === 0x30) return this._rStr(type);

    // Array / Object / Collection — register BEFORE filling
    if (g === 0x40 || g === 0x50 || g === 0x80) {
      let val;
      if (g === 0x40) val = [];
      else if (g === 0x80) val = type === T.MAP ? new Map() : new Set();
      else val = {};
      this.deserializeRefs.push(val);
      this._rFill(val, type, g);
      return val;
    }

    // Typed arrays (0x60)
    if (g === 0x60) { const v = this._rTypedArr(type); this.deserializeRefs.push(v); return v; }
    // Buffers (0x70)
    if (g === 0x70) { const v = this._rArrayBuf(type); this.deserializeBuffers.push(v); return v; }
    // Date (0x90)
    if (g === 0x90) { if (type === T.DATE_INVALID) return new Date(NaN); const t = this.view.getFloat64(this.pos, true); this.pos += 8; return new Date(t); }
    // Error (0xA0)
    if (g === 0xA0) return this._rError(type);
    // RegExp (0xB0)
    if (g === 0xB0) { return new RegExp(this.readValue(), this.readValue()); }
    // Binary (0xC0)
    if (g === 0xC0) { this._rV(); this._rV(); return { _type: "Binary" }; }
    // Special / Symbol (0xE0)
    if (g === 0xE0) return this._rSpecial(type);
    // Extension (0xF0)
    if (g === 0xF0) return this.options.allowFunction ? function(){throw new Error("Function not serialized")} : undefined;

    throw new Error(`Unknown type: 0x${type.toString(16)}`);
  }

  // ── Read: varint ──────────────────────────────────────────────────

  _rV() {
    const b = this.buffer;
    let p = this.pos, byte = this.buf[p++];
    if (!(byte & 0x80)) { this.pos = p; return byte; }
    let val = byte & 0x7F, shift = 7;
    do { byte = this.buf[p++]; val |= (byte & 0x7F) << shift; shift += 7; } while (byte & 0x80);
    this.pos = p;
    return val >>> 0;
  }

  // ── Read: fill containers ─────────────────────────────────────────

  _rFill(val, type, g) {
    if (g === 0x40) { // Array
      if (type === T.ARRAY_EMPTY) return;
      if (type === T.ARRAY_DENSE) { const n = this._rV(); for (let i = 0; i < n; i++) val[i] = this.readValue(); }
      else if (type === T.ARRAY_SPARSE) { val.length = this._rV(); const c = this._rV(); for (let i = 0; i < c; i++) val[this._rV()] = this.readValue(); }
      else { const d = this._rPacked(type); for (let i = 0; i < d.length; i++) val.push(d[i]); }
    } else if (g === 0x50) { // Object
      this.fillObject(val, type);
    } else if (g === 0x80) { // Collection
      const sz = this._rV();
      if (type === T.MAP) { for (let i = 0; i < sz; i++) val.set(this.readValue(), this.readValue()); }
      else { for (let i = 0; i < sz; i++) val.add(this.readValue()); }
    }
  }

  fillObject(obj, type) {
    if (type === T.OBJECT_EMPTY) return;
    if (type === T.OBJECT_LITERAL || type === T.OBJECT_PLAIN) {
      const n = this._rV(); for (let i = 0; i < n; i++) obj[this.readValue()] = this.readValue();
    } else if (type === T.OBJECT_WITH_DESCRIPTORS) {
      const n = this._rV();
      for (let i = 0; i < n; i++) {
        const key = this.readValue();
        const flags = this.buffer[this.pos++];
        const desc = { enumerable: !!(flags & 1), writable: !!(flags & 2), configurable: !!(flags & 4) };
        if (flags & 8 || flags & 16) {
          if (flags & 8) desc.get = this.readValue();
          if (flags & 16) desc.set = this.readValue();
        } else { desc.value = this.readValue(); }
        Object.defineProperty(obj, key, desc);
      }
    } else if (type === T.OBJECT_WITH_METHODS) {
      const n = this._rV();
      for (let i = 0; i < n; i++) {
        const key = this.readValue();
        const isFunc = this.buffer[this.pos++];
        if (isFunc) {
          if (this.options.allowFunction && this.options.serializeFunctions) {
            const src = this.readValue(); this.readValue(); // name
            try { obj[key] = new Function("return " + src)(); } catch(e) { obj[key] = undefined; }
          } else if (this.options.serializeFunctions) {
            this.readValue(); this.readValue(); obj[key] = undefined;
          } else {
            this.pos++; // skip FUNCTION_PLACEHOLDER byte
            obj[key] = this.options.allowFunction ? function(){throw new Error("Not serialized")} : undefined;
          }
        } else { obj[key] = this.readValue(); }
      }
    } else if (type === T.OBJECT_CONSTRUCTOR) {
      const ctorName = this.readValue();
      const n = this._rV();
      for (let i = 0; i < n; i++) obj[this.readValue()] = this.readValue();
      Object.defineProperty(obj, '__constructorName', { value: ctorName, enumerable: false, writable: false, configurable: true });
    }
  }

  // ── Read: numbers ─────────────────────────────────────────────────

  _rNum(type) {
    const dv = this.view; let p = this.pos, v;
    switch (type) {
      case T.INT8: v = (this.buffer[p] << 24) >> 24; this.pos = p+1; return v;
      case T.INT16: v = this.dv.getInt16(p, true); this.pos = p+2; return v;
      case T.INT32: v = this.dv.getInt32(p, true); this.pos = p+4; return v;
      case T.UINT32: v = this.dv.getUint32(p, true); this.pos = p+4; return v;
      case T.FLOAT32: v = this.dv.getFloat32(p, true); this.pos = p+4; return v;
      case T.FLOAT64: v = this.dv.getFloat64(p, true); this.pos = p+8; return v;
      case T.NAN: return NaN;
      case T.INFINITY: return Infinity;
      case T.NEG_INFINITY: return -Infinity;
      case T.NEG_ZERO: return -0;
      case T.VARINT: v = this._rV(); return this.buffer[this.pos++] ? -v : v;
    }
  }

  // ── Read: bigint ──────────────────────────────────────────────────

  _rBigInt(type) {
    if (type === T.BIGINT_POS_SMALL || type === T.BIGINT_NEG_SMALL) {
      const v = this.view.getBigInt64(this.pos, true); this.pos += 8; return v;
    }
    const neg = type === T.BIGINT_NEG_LARGE;
    const len = this._rV(); let hex = "";
    for (let i = len - 1; i >= 0; i--) hex += this.buffer[this.pos + i].toString(16).padStart(2, "0");
    this.pos += len;
    const v = BigInt("0x" + (hex || "0"));
    return neg ? -v : v;
  }

  // ── Read: strings ─────────────────────────────────────────────────

  _rStr(type) {
    if (type === T.STRING_EMPTY) return "";
    const b = this.buffer;
    let len;
    if (type === T.STRING_ASCII_TINY || type === T.STRING_ASCII_SHORT ||
        type === T.STRING_UTF8_TINY || type === T.STRING_UTF8_SHORT) {
      len = this.buf[this.pos++];
    } else { len = this._rV(); }

    let str;
    const isAsc = type === T.STRING_ASCII_TINY || type === T.STRING_ASCII_SHORT || type === T.STRING_ASCII_LONG;
    if (isAsc && len < 128) {
      str = _ascDec[len](b, this.pos);
      this.pos += len;
    } else {
      str = this.dec.decode(b.subarray(this.pos, this.pos + len));
      this.pos += len;
    }
    if (str.length > 3) this.deserializeStrings.push(str);
    return str;
  }

  // ── Read: packed arrays ───────────────────────────────────────────

  _rPacked(type) {
    const len = this._rV(), arr = new Array(len), dv = this.view;
    let p = this.pos;
    switch (type) {
      case T.ARRAY_PACKED_I8:  for (let i=0;i<len;i++) arr[i] = (this.buffer[p++]<<24)>>24; break;
      case T.ARRAY_PACKED_I16: for (let i=0;i<len;i++) { arr[i] = this.dv.getInt16(p,true); p+=2; } break;
      case T.ARRAY_PACKED_I32: for (let i=0;i<len;i++) { arr[i] = this.dv.getInt32(p,true); p+=4; } break;
      case T.ARRAY_PACKED_F32: for (let i=0;i<len;i++) { arr[i] = this.dv.getFloat32(p,true); p+=4; } break;
      case T.ARRAY_PACKED_F64: for (let i=0;i<len;i++) { arr[i] = this.dv.getFloat64(p,true); p+=8; } break;
    }
    this.pos = p; return arr;
  }

  // ── Read: typed arrays ────────────────────────────────────────────

  _rTypedArr(type) {
    const shared = this.buffer[this.pos++];
    if (shared) {
      const bid = this._rV(), bo = this._rV(), len = this._rV();
      return new (TCTOR[type])(this.deserializeBuffers[bid], bo, len);
    }
    const bo = this._rV(), len = this._rV(), es = BPE[type] || 1;
    if (type === T.BIGINT64ARRAY || type === T.BIGUINT64ARRAY) {
      const vals = [];
      for (let i = 0; i < len; i++) { vals.push(this.view.getBigInt64(this.pos, true)); this.pos += 8; }
      return new (TCTOR[type])(vals);
    }
    const tb = len * es;
    const ab = new ArrayBuffer(tb);
    new Uint8Array(ab).set(this.buffer.subarray(this.pos, this.pos + tb));
    this.pos += tb;
    this.deserializeBuffers.push(ab);
    return new (TCTOR[type])(ab, 0, len);
  }

  // ── Read: ArrayBuffer ─────────────────────────────────────────────

  _rArrayBuf(type) {
    const len = this._rV();
    const buf = this.buffer.buffer.slice(this.buffer.byteOffset + this.pos, this.buffer.byteOffset + this.pos + len);
    this.pos += len;
    return buf;
  }

  // ── Read: errors ──────────────────────────────────────────────────

  _rError(type) {
    const msg = this.readValue(), stack = this.readValue();
    let err;
    if (type === T.AGGREGATE_ERROR) {
      const n = this._rV(), errs = [];
      for (let i = 0; i < n; i++) errs.push(this.readValue());
      err = new AggregateError(errs, msg);
    } else { err = new (ERR_CTORS[type] || Error)(msg); }
    if (stack) err.stack = stack;
    return err;
  }

  // ── Read: symbols ─────────────────────────────────────────────────

  _rSpecial(type) {
    if (type === T.SYMBOL) return Symbol(this.readValue());
    if (type === T.SYMBOL_NO_DESC) return Symbol();
    if (type === T.SYMBOL_GLOBAL) return Symbol.for(this.readValue());
    if (type === T.SYMBOL_WELLKNOWN) return WELLKNOWN_BY_NAME.get(this.readValue()) || Symbol();
    throw new Error(`Unknown special type: 0x${type.toString(16)}`);
  }
}

export default TurboSerial;
