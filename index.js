/**
 * TurboSerial v5 - Ultra-Optimized JavaScript Serializer
 * FULLY OPTIMIZED VERSION with SIMD-style patterns and enhanced type support
 */
"use strict";

// Cache line size for optimal memory access
const CACHE_LINE_SIZE = 128;
const SIMD_ALIGNMENT = 8;
const SIMD_BLOCK_SIZE = 16;

// Pre-computed constants for branchless operations
const INT8_MIN = -0x80|0;
const INT8_MAX = 0x7F|0;
const INT16_MIN = -0x8000|0;
const INT16_MAX = 0x7FFF|0;
const INT32_MIN = -0x80000000|0;
const INT32_MAX = 0x7FFFFFFF|0;
const UINT32_MAX = 0xFFFFFFFF>>>0;

// Type system optimized for bitwise operations
const TYPE_MASK = {
  GROUP: 0xF0,
  SUBTYPE: 0x0F,
  ALIGNMENT: 0x07
};

const TYPE_GROUP = {
  PRIMITIVE: 0x00,
  NUMBER: 0x10,
  BIGINT: 0x20,
  STRING: 0x30,
  ARRAY: 0x40,
  OBJECT: 0x50,
  TYPED: 0x60,
  BUFFER: 0x70,
  COLLECTION: 0x80,
  DATE: 0x90,
  ERROR: 0xA0,
  REGEX: 0xB0,
  BINARY: 0xC0,
  REFERENCE: 0xD0,
  SPECIAL: 0xE0,
  EXTENSION: 0xF0
};

// Complete type definitions
const TYPE = {
  NULL: 0x00,
  UNDEFINED: 0x01,
  FALSE: 0x02,
  TRUE: 0x03,
  INT8: 0x10,
  INT16: 0x11,
  INT32: 0x12,
  UINT32: 0x13,
  FLOAT32: 0x14,
  FLOAT64: 0x15,
  NAN: 0x16,
  INFINITY: 0x17,
  NEG_INFINITY: 0x18,
  NEG_ZERO: 0x19,
  VARINT: 0x1A,
  BIGINT_POS_SMALL: 0x20,
  BIGINT_NEG_SMALL: 0x21,
  BIGINT_POS_LARGE: 0x22,
  BIGINT_NEG_LARGE: 0x23,
  STRING_EMPTY: 0x30,
  STRING_ASCII_TINY: 0x31,
  STRING_ASCII_SHORT: 0x32,
  STRING_ASCII_LONG: 0x33,
  STRING_UTF8_TINY: 0x34,
  STRING_UTF8_SHORT: 0x35,
  STRING_UTF8_LONG: 0x36,
  STRING_REF: 0x37,
  ARRAY_EMPTY: 0x40,
  ARRAY_DENSE: 0x41,
  ARRAY_SPARSE: 0x42,
  ARRAY_PACKED_I8: 0x43,
  ARRAY_PACKED_I16: 0x44,
  ARRAY_PACKED_I32: 0x45,
  ARRAY_PACKED_F32: 0x46,
  ARRAY_PACKED_F64: 0x47,
  OBJECT_EMPTY: 0x50,
  OBJECT_PLAIN: 0x51,
  OBJECT_LITERAL: 0x52,
  OBJECT_CONSTRUCTOR: 0x53,
  OBJECT_WITH_DESCRIPTORS: 0x54, // NEW: for objects with getters/setters
  OBJECT_WITH_METHODS: 0x55, // NEW: for objects with methods
  UINT8ARRAY: 0x60,
  INT8ARRAY: 0x61,
  UINT8CLAMPEDARRAY: 0x62,
  UINT16ARRAY: 0x63,
  INT16ARRAY: 0x64,
  UINT32ARRAY: 0x65,
  INT32ARRAY: 0x66,
  FLOAT32ARRAY: 0x67,
  FLOAT64ARRAY: 0x68,
  BIGINT64ARRAY: 0x69,
  BIGUINT64ARRAY: 0x6A,
  DATAVIEW: 0x6B,
  ARRAYBUFFER: 0x70,
  BUFFER_REF: 0x71,
  SHAREDARRAYBUFFER: 0x72,
  MAP: 0x80,
  SET: 0x81,
  DATE: 0x90,
  DATE_INVALID: 0x91,
  ERROR: 0xA0,
  EVAL_ERROR: 0xA1,
  RANGE_ERROR: 0xA2,
  REFERENCE_ERROR: 0xA3,
  SYNTAX_ERROR: 0xA4,
  TYPE_ERROR: 0xA5,
  URI_ERROR: 0xA6,
  AGGREGATE_ERROR: 0xA7,
  CUSTOM_ERROR: 0xA8,
  REGEXP: 0xB0,
  BLOB: 0xC0,
  FILE: 0xC1,
  REFERENCE: 0xD0,
  CIRCULAR_REF: 0xD1,
  SYMBOL: 0xE0,
  SYMBOL_GLOBAL: 0xE1,
  SYMBOL_WELLKNOWN: 0xE2,
  SYMBOL_NO_DESC: 0xE3, // NEW: for symbols without description
  FUNCTION_PLACEHOLDER: 0xF0 // NEW: for method placeholders
};

// Pre-computed lookup tables
const ALIGNMENT_LOOKUP = new Uint8Array(256);
const BYTES_PER_ELEMENT = new Uint8Array(256);
const TYPE_CONSTRUCTOR_MAP = new Map();

// Well-known symbols lookup
const WELLKNOWN_SYMBOLS = new Map();
const WELLKNOWN_SYMBOLS_BY_NAME = new Map();

// Initialize lookup tables
(function initLookups() {
  const alignments = [
    [TYPE.INT16, 2], [TYPE.INT32, 4], [TYPE.UINT32, 4],
    [TYPE.FLOAT32, 4], [TYPE.FLOAT64, 8],
    [TYPE.BIGINT_POS_SMALL, 8], [TYPE.BIGINT_NEG_SMALL, 8]
  ];
  
  for (let i = 0; i < alignments.length; i++) {
    ALIGNMENT_LOOKUP[alignments[i][0]] = alignments[i][1];
  }
  
  const byteSizes = [
    [TYPE.UINT8ARRAY, 1], [TYPE.INT8ARRAY, 1], [TYPE.UINT8CLAMPEDARRAY, 1],
    [TYPE.UINT16ARRAY, 2], [TYPE.INT16ARRAY, 2],
    [TYPE.UINT32ARRAY, 4], [TYPE.INT32ARRAY, 4], [TYPE.FLOAT32ARRAY, 4],
    [TYPE.FLOAT64ARRAY, 8], [TYPE.BIGINT64ARRAY, 8], [TYPE.BIGUINT64ARRAY, 8],
    [TYPE.ARRAY_PACKED_I8, 1], [TYPE.ARRAY_PACKED_I16, 2], [TYPE.ARRAY_PACKED_I32, 4],
    [TYPE.ARRAY_PACKED_F32, 4], [TYPE.ARRAY_PACKED_F64, 8]
  ];
  
  for (let i = 0; i < byteSizes.length; i++) {
    BYTES_PER_ELEMENT[byteSizes[i][0]] = byteSizes[i][1];
  }

  // Initialize well-known symbols
  const wellKnownNames = [
    'asyncIterator', 'hasInstance', 'isConcatSpreadable', 'iterator',
    'match', 'matchAll', 'replace', 'search', 'species', 'split',
    'toPrimitive', 'toStringTag', 'unscopables'
  ];
  
  for (const name of wellKnownNames) {
    const symbol = Symbol[name];
    if (symbol) {
      WELLKNOWN_SYMBOLS.set(symbol, name);
      WELLKNOWN_SYMBOLS_BY_NAME.set(name, symbol);
    }
  }
})();

/**
 * Ultra-optimized memory pool with cache-line alignment
 */
class UltraMemoryPool {
  /**
   * Initialize memory pool with optimal alignment
   * @param {number} initialSize - Initial buffer size
   */
  constructor(initialSize = 65536) {
    // Align to cache line
    this.size = ((initialSize + CACHE_LINE_SIZE - 1) & ~(CACHE_LINE_SIZE - 1)) >>> 0;
    this.buffer = new ArrayBuffer(this.size);
    
    // Create aligned views - fixed offset calculation
    this.offset = 0;
    this.u8 = new Uint8Array(this.buffer);
    this.view = new DataView(this.buffer);
    this.pos = 0;
    
    // Pre-allocate typed views for common operations
    this.f32View = null;
    this.f64View = null;
    this.i32View = null;
  }

  /**
   * Ensure capacity with efficient reallocation
   * @param {number} bytes - Required bytes
   */
  ensure(bytes) {
    bytes = bytes|0;
    const required = (this.pos + bytes)|0;
    
    if (required > this.size) {
      // Double size or accommodate requirement
      const newSize = Math.max(this.size << 1, required + CACHE_LINE_SIZE)|0;
      const alignedSize = ((newSize + CACHE_LINE_SIZE - 1) & ~(CACHE_LINE_SIZE - 1)) >>> 0;
      
      const newBuffer = new ArrayBuffer(alignedSize);
      const newU8 = new Uint8Array(newBuffer);
      
      // Use subarray for efficient copy
      newU8.set(this.u8.subarray(0, this.pos));
      
      this.buffer = newBuffer;
      this.u8 = newU8;
      this.view = new DataView(newBuffer);
      this.size = alignedSize;
      
      // Reset cached views
      this.f32View = null;
      this.f64View = null;
      this.i32View = null;
    }
  }

  /**
   * Align position for optimal memory access
   * @param {number} alignment - Required alignment
   */
  alignPos(alignment) {
    const mask = (alignment - 1)|0;
    this.pos = ((this.pos + mask) & ~mask) >>> 0;
  }

  /**
   * Write unsigned 8-bit integer
   * @param {number} value - Value to write
   */
  writeU8(value) {
    this.ensure(1);
    this.u8[this.pos++] = value & 0xFF;
  }

  /**
   * Write unsigned 16-bit integer with alignment
   * @param {number} value - Value to write
   */
  writeU16(value) {
    this.alignPos(2);
    this.ensure(2);
    this.view.setUint16(this.pos, value & 0xFFFF, true);
    this.pos = (this.pos + 2)|0;
  }

  /**
   * Write signed 16-bit integer with alignment
   * @param {number} value - Value to write
   */
  writeI16(value) {
    this.alignPos(2);
    this.ensure(2);
    this.view.setInt16(this.pos, value, true);
    this.pos = (this.pos + 2)|0;
  }

  /**
   * Write unsigned 32-bit integer with alignment
   * @param {number} value - Value to write
   */
  writeU32(value) {
    this.alignPos(4);
    this.ensure(4);
    this.view.setUint32(this.pos, value >>> 0, true);
    this.pos = (this.pos + 4)|0;
  }

  /**
   * Write signed 32-bit integer with alignment
   * @param {number} value - Value to write
   */
  writeI32(value) {
    this.alignPos(4);
    this.ensure(4);
    this.view.setInt32(this.pos, value|0, true);
    this.pos = (this.pos + 4)|0;
  }

  /**
   * Write 32-bit float with alignment
   * @param {number} value - Value to write
   */
  writeF32(value) {
    this.alignPos(4);
    this.ensure(4);
    this.view.setFloat32(this.pos, +value, true);
    this.pos = (this.pos + 4)|0;
  }

  /**
   * Write 64-bit float with alignment
   * @param {number} value - Value to write
   */
  writeF64(value) {
    this.alignPos(8);
    this.ensure(8);
    this.view.setFloat64(this.pos, +value, true);
    this.pos = (this.pos + 8)|0;
  }

  /**
   * Write BigInt as 64-bit integer
   * @param {BigInt} value - Value to write
   */
  writeBigInt64(value) {
    this.alignPos(8);
    this.ensure(8);
    this.view.setBigInt64(this.pos, BigInt(value), true);
    this.pos = (this.pos + 8)|0;
  }

  /**
   * Write variable-length integer with optimized encoding
   * @param {number} value - Value to write
   */
  writeVarint(value) {
    value = value >>> 0;
    this.ensure(5);
    
    // Optimized small value path
    if (value < 0x80) {
      this.u8[this.pos++] = value;
      return;
    }
    
    // Optimized medium value path
    if (value < 0x4000) {
      this.u8[this.pos] = (value & 0x7F) | 0x80;
      this.u8[this.pos + 1] = value >>> 7;
      this.pos = (this.pos + 2)|0;
      return;
    }
    
    // General case with unrolled loop
    let pos = this.pos;
    do {
      this.u8[pos++] = (value & 0x7F) | 0x80;
      value >>>= 7;
    } while (value >= 0x80);
    this.u8[pos++] = value;
    this.pos = pos;
  }

  /**
   * Write packed array with optimal type-specific handling
   * @param {Array} array - Array to write
   * @param {number} elementType - Element type identifier
   */
  writePackedArray(array, elementType) {
    const len = array.length|0;
    this.writeVarint(len);
    
    const elementSize = BYTES_PER_ELEMENT[elementType]|0;
    if (!elementSize) {
      throw new Error(`Unknown element type: 0x${elementType.toString(16)}`);
    }
    
    this.alignPos(Math.min(elementSize, 8));
    this.ensure(len * elementSize);
    
    // Use typed array views for efficient bulk writes
    switch (elementType) {
      case TYPE.ARRAY_PACKED_I8: {
        const view = new Int8Array(this.buffer, this.pos, len);
        view.set(array);
        this.pos = (this.pos + len)|0;
        break;
      }
      case TYPE.ARRAY_PACKED_I16: {
        const view = new Int16Array(this.buffer, this.pos, len);
        for (let i = 0; i < len; i++) view[i] = array[i]|0;
        this.pos = (this.pos + (len << 1))|0;
        break;
      }
      case TYPE.ARRAY_PACKED_I32: {
        const view = new Int32Array(this.buffer, this.pos, len);
        for (let i = 0; i < len; i++) view[i] = array[i]|0;
        this.pos = (this.pos + (len << 2))|0;
        break;
      }
      case TYPE.ARRAY_PACKED_F32: {
        const view = new Float32Array(this.buffer, this.pos, len);
        for (let i = 0; i < len; i++) view[i] = +array[i];
        this.pos = (this.pos + (len << 2))|0;
        break;
      }
      case TYPE.ARRAY_PACKED_F64: {
        const view = new Float64Array(this.buffer, this.pos, len);
        for (let i = 0; i < len; i++) view[i] = +array[i];
        this.pos = (this.pos + (len << 3))|0;
        break;
      }
      default:
        throw new Error(`Unsupported packed array type: 0x${elementType.toString(16)}`);
    }
  }

  /**
   * Write bulk data with alignment
   * @param {Uint8Array} data - Data to write
   * @param {number} elementSize - Element size for alignment
   */
  writeBulkAligned(data, elementSize) {
    const alignment = Math.min(elementSize, SIMD_ALIGNMENT);
    this.alignPos(alignment);
    
    const totalBytes = data.byteLength || data.length;
    this.ensure(totalBytes);
    
    // Use subarray for efficient copy
    if (data.buffer && data.byteOffset !== undefined) {
      const sourceBytes = new Uint8Array(data.buffer, data.byteOffset, totalBytes);
      this.u8.set(sourceBytes, this.pos);
    } else {
      this.u8.set(data, this.pos);
    }
    
    this.pos = (this.pos + totalBytes)|0;
  }

  /**
   * Reset pool position
   */
  reset() {
    this.pos = 0;
  }

  /**
   * Get result buffer
   * @returns {Uint8Array} Result buffer
   */
  getResult() {
    return this.u8.subarray(0, this.pos);
  }
}

/**
 * SIMD-style processor for vectorized operations
 */
class SIMDProcessor {
  constructor() {
    this.blockSize = SIMD_BLOCK_SIZE;
  }

  /**
   * Check if array can be optimized with SIMD-style processing
   * @param {Array} array - Array to check
   * @returns {boolean} True if optimizable
   */
  canOptimize(array) {
    const len = array.length;
    
    // Use bit manipulation for size check
    const isGoodSize = (len >= 8) & ((len & (len - 1)) == 0 || len >= 16);
    if (!isGoodSize) return false;
    
    // Fast type check
    const firstType = typeof array[0];
    if (firstType !== 'number') return false;
    
    // Sample-based homogeneity check
    const sampleInterval = Math.max(1, (len >>> 5)|0);
    for (let i = sampleInterval; i < len; i += sampleInterval) {
      if (typeof array[i] !== firstType) return false;
    }
    
    return true;
  }

  /**
   * Analyze numeric array for optimal packing
   * @param {Array} array - Array to analyze
   * @returns {Object} Analysis result with type and element size
   */
  analyzeNumericArray(array) {
    let isInteger = 1;
    let min = Infinity;
    let max = -Infinity;
    let canBeFloat32 = 1;
    
    const len = array.length;
    
    // Process in blocks for better performance
    for (let i = 0; i < len; i++) {
      const val = array[i];
      
      // Branchless operations
      const intVal = val|0;
      isInteger &= +(val == intVal);
      
      // Use Math.min/max for branchless comparison
      min = Math.min(min, val);
      max = Math.max(max, val);
      
      // Check float32 precision
      if (canBeFloat32) {
        const f32Val = Math.fround(val);
        canBeFloat32 &= +(f32Val == val);
      }
    }
    
    if (isInteger) {
      const absMax = Math.max(Math.abs(min), Math.abs(max));
      
      // Branchless type selection using bit manipulation
      const typeIndex = 
        (+(absMax <= 0x7F) << 0) |
        (+(absMax <= 0x7FFF) << 1) |
        (+(absMax <= 0x7FFFFFFF) << 2);
      
      const types = [
        { type: TYPE.ARRAY_PACKED_I32, elementSize: 4 },
        { type: TYPE.ARRAY_PACKED_I8, elementSize: 1 },
        { type: TYPE.ARRAY_PACKED_I16, elementSize: 2 },
        { type: TYPE.ARRAY_PACKED_I32, elementSize: 4 }
      ];
      
      return types[typeIndex & 3];
    }
    
    return canBeFloat32 
      ? { type: TYPE.ARRAY_PACKED_F32, elementSize: 4 }
      : { type: TYPE.ARRAY_PACKED_F64, elementSize: 8 };
  }
}

/**
 * Ultra-fast type detector with branchless operations
 */
class UltraTypeDetector {
  constructor() {
    this.simdProcessor = new SIMDProcessor();
    
    // Pre-computed maps for O(1) lookups
    this.constructorMap = new Map();
    this.typeNameMap = new Map();
    this.errorTypeMap = new Map();
    
    this.initMaps();
  }

  /**
   * Initialize lookup maps
   */
  initMaps() {
    // Constructor mappings
    const constructors = [
      [Date, TYPE.DATE],
      [RegExp, TYPE.REGEXP],
      [Map, TYPE.MAP],
      [Set, TYPE.SET],
      [ArrayBuffer, TYPE.ARRAYBUFFER],
      [DataView, TYPE.DATAVIEW]
    ];
    
    // Add typed array constructors
    const typedArrays = [
      ['Uint8Array', TYPE.UINT8ARRAY],
      ['Int8Array', TYPE.INT8ARRAY],
      ['Uint8ClampedArray', TYPE.UINT8CLAMPEDARRAY],
      ['Uint16Array', TYPE.UINT16ARRAY],
      ['Int16Array', TYPE.INT16ARRAY],
      ['Uint32Array', TYPE.UINT32ARRAY],
      ['Int32Array', TYPE.INT32ARRAY],
      ['Float32Array', TYPE.FLOAT32ARRAY],
      ['Float64Array', TYPE.FLOAT64ARRAY],
      ['BigInt64Array', TYPE.BIGINT64ARRAY],
      ['BigUint64Array', TYPE.BIGUINT64ARRAY],
      ['SharedArrayBuffer', TYPE.SHAREDARRAYBUFFER]
    ];
    
    for (const [ctor, type] of constructors) {
      this.constructorMap.set(ctor, type);
    }
    
    for (const [name, type] of typedArrays) {
      const ctor = globalThis[name];
      if (ctor) {
        this.constructorMap.set(ctor, type);
        this.typeNameMap.set(name, type);
      }
    }
    
    // Error type mappings
    this.errorTypeMap.set('Error', TYPE.ERROR);
    this.errorTypeMap.set('EvalError', TYPE.EVAL_ERROR);
    this.errorTypeMap.set('RangeError', TYPE.RANGE_ERROR);
    this.errorTypeMap.set('ReferenceError', TYPE.REFERENCE_ERROR);
    this.errorTypeMap.set('SyntaxError', TYPE.SYNTAX_ERROR);
    this.errorTypeMap.set('TypeError', TYPE.TYPE_ERROR);
    this.errorTypeMap.set('URIError', TYPE.URI_ERROR);
    this.errorTypeMap.set('AggregateError', TYPE.AGGREGATE_ERROR);
  }

  /**
   * Detect type of value with optimized branching
   * @param {*} value - Value to detect
   * @returns {number} Type identifier
   */
  detect(value) {
    // Optimized null check
    if (value == null) return value === null ? TYPE.NULL : TYPE.UNDEFINED;
    
    // Fast type dispatch using switch
    const typeStr = typeof value;
    
    switch (typeStr) {
      case 'boolean':
        return value ? TYPE.TRUE : TYPE.FALSE;
      case 'number':
        return this.detectNumber(value);
      case 'bigint':
        return this.detectBigInt(value);
      case 'string':
        return this.detectString(value);
      case 'symbol':
        return this.detectSymbol(value);
      case 'object':
        return this.detectObject(value);
      case 'function':
        return TYPE.UNDEFINED;
      default:
        return TYPE.UNDEFINED;
    }
  }

  /**
   * Detect number type with branchless operations
   * @param {number} value - Number to detect
   * @returns {number} Type identifier
   */
  detectNumber(value) {
    // Fast NaN check
    if (value !== value) return TYPE.NAN;
    
    // Fast infinity checks using bit manipulation
    const bits = new Float64Array([value]);
    const intView = new Uint32Array(bits.buffer);
    const highBits = intView[1];
    
    // Check for infinity: exponent all 1s, mantissa 0
    const expMask = 0x7FF00000;
    const isInfinity = ((highBits & expMask) == expMask) & ((intView[0] == 0) & ((highBits & 0xFFFFF) == 0));
    
    if (isInfinity) {
      return (highBits >>> 31) ? TYPE.NEG_INFINITY : TYPE.INFINITY;
    }
    
    // Check for negative zero
    if (value == 0 && (highBits >>> 31)) return TYPE.NEG_ZERO;
    
    // Integer check with branchless classification
    const intValue = value|0;
    if (value == intValue) {
      const absValue = Math.abs(value);
      
      // Branchless type selection
      const typeIndex = 
        (+(absValue <= 0x7F) << 0) |
        (+(absValue <= 0x7FFF) << 1) |
        (+(absValue <= 0x7FFFFFFF) << 2);
      
      const types = [TYPE.VARINT, TYPE.INT8, TYPE.INT16, TYPE.INT32];
      return types[Math.min(typeIndex, 3)];
    }
    
    // Float precision check
    const f32Value = Math.fround(value);
    return (f32Value == value) ? TYPE.FLOAT32 : TYPE.FLOAT64;
  }

  /**
   * Detect BigInt type
   * @param {BigInt} value - BigInt to detect
   * @returns {number} Type identifier
   */
  detectBigInt(value) {
    const isNegative = value < 0n;
    const absValue = isNegative ? -value : value;
    
    // Check if fits in 64 bits
    const fits64Bit = absValue <= 0x7FFFFFFFFFFFFFFFn;
    
    return fits64Bit
      ? (isNegative ? TYPE.BIGINT_NEG_SMALL : TYPE.BIGINT_POS_SMALL)
      : (isNegative ? TYPE.BIGINT_NEG_LARGE : TYPE.BIGINT_POS_LARGE);
  }

  /**
   * Detect string type with optimized checks
   * @param {string} value - String to detect
   * @returns {number} Type identifier
   */
  detectString(value) {
    const len = value.length;
    
    if (len == 0) return TYPE.STRING_EMPTY;
    
    // Fast ASCII check with early exit
    let isAscii = 1;
    for (let i = 0; i < len && isAscii; i++) {
      isAscii &= +(value.charCodeAt(i) <= 0x7F);
    }
    
    if (isAscii) {
      // Branchless size selection
      return (len < 16) ? TYPE.STRING_ASCII_TINY :
             (len < 256) ? TYPE.STRING_ASCII_SHORT :
             TYPE.STRING_ASCII_LONG;
    } else {
      const byteLength = new TextEncoder().encode(value).length;
      return (byteLength < 16) ? TYPE.STRING_UTF8_TINY :
             (byteLength < 256) ? TYPE.STRING_UTF8_SHORT :
             TYPE.STRING_UTF8_LONG;
    }
  }

  /**
   * FIXED: Detect symbol type with proper handling of descriptions
   * @param {Symbol} value - Symbol to detect
   * @returns {number} Type identifier
   */
  detectSymbol(value) {
    // Check for global symbol first
    const key = Symbol.keyFor(value);
    if (key !== undefined) {
      return TYPE.SYMBOL_GLOBAL;
    }
    
    // Check for well-known symbol
    if (WELLKNOWN_SYMBOLS.has(value)) {
      return TYPE.SYMBOL_WELLKNOWN;
    }
    
    // FIXED: Distinguish between Symbol() and Symbol("")
    const description = value.description;
    if (description === undefined) {
      return TYPE.SYMBOL_NO_DESC; // NEW: Symbol without description
    }
    
    return TYPE.SYMBOL; // Symbol with description (including empty string)
  }

  /**
   * FIXED: Detect object type with enhanced property analysis
   * @param {Object} obj - Object to detect
   * @returns {number} Type identifier
   */
  detectObject(obj) {
    if (obj == null) return TYPE.NULL;
    
    const constructor = obj.constructor;
    
    // Fast constructor lookup
    const mappedType = this.constructorMap.get(constructor);
    if (mappedType !== undefined) {
      // Special handling for invalid dates
      if (mappedType == TYPE.DATE) {
        const time = obj.getTime();
        return (time == time) ? TYPE.DATE : TYPE.DATE_INVALID;
      }
      return mappedType;
    }
    
    // Array detection with optimization analysis
    if (Array.isArray(obj)) {
      return this.detectArray(obj);
    }
    
    // Typed array detection
    if (ArrayBuffer.isView(obj)) {
      return this.detectTypedArrayType(obj);
    }
    
    // Error detection
    if (obj instanceof Error) {
      return this.detectErrorType(obj);
    }
    
    // Binary object detection
    if (typeof Blob !== 'undefined' && obj instanceof Blob) {
      return (obj instanceof File) ? TYPE.FILE : TYPE.BLOB;
    }
    
    // FIXED: Enhanced object classification
    return this.classifyObject(obj);
  }

  /**
   * NEW: Enhanced object classification with descriptor analysis
   * @param {Object} obj - Object to classify
   * @returns {number} Type identifier
   */
  classifyObject(obj) {
    const proto = Object.getPrototypeOf(obj);
    const isPlainObject = (obj.constructor == Object) || (proto == Object.prototype) || (proto == null);
    
    if (!isPlainObject) {
      return TYPE.OBJECT_CONSTRUCTOR;
    }
    
    // Get all own properties including non-enumerable ones
    const ownKeys = Object.getOwnPropertyNames(obj);
    const ownSymbols = Object.getOwnPropertySymbols(obj);
    const allKeys = [...ownKeys, ...ownSymbols];
    
    if (allKeys.length === 0) {
      return TYPE.OBJECT_EMPTY;
    }
    
    // Check for complex property descriptors
    let hasComplexDescriptors = false;
    let hasMethods = false;
    
    for (const key of allKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      
      // Check for getters/setters
      if (descriptor.get || descriptor.set) {
        hasComplexDescriptors = true;
        break;
      }
      
      // Check for methods
      if (typeof descriptor.value === 'function') {
        hasMethods = true;
      }
      
      // Check for non-default attributes
      if (!descriptor.enumerable || !descriptor.writable || !descriptor.configurable) {
        hasComplexDescriptors = true;
      }
    }
    
    if (hasComplexDescriptors) {
      return TYPE.OBJECT_WITH_DESCRIPTORS;
    }
    
    if (hasMethods) {
      return TYPE.OBJECT_WITH_METHODS;
    }
    
    return TYPE.OBJECT_LITERAL;
  }

  /**
   * Detect array type with sparsity and optimization analysis
   * @param {Array} arr - Array to detect
   * @returns {number} Type identifier
   */
  detectArray(arr) {
    const len = arr.length;
    
    if (len == 0) return TYPE.ARRAY_EMPTY;
    
    // Fast sparsity check
    let filledCount = 0;
    let hasHoles = false;
    
    for (let i = 0; i < len; i++) {
      if (i in arr) {
        filledCount++;
      } else {
        hasHoles = true;
      }
    }
    
    // Sparse if has holes or less than 75% filled
    const sparsityThreshold = (len * 3) >>> 2;
    if (hasHoles || filledCount < sparsityThreshold) {
      return TYPE.ARRAY_SPARSE;
    }
    
    // Check for SIMD optimization potential
    if (this.simdProcessor.canOptimize(arr)) {
      const analysis = this.simdProcessor.analyzeNumericArray(arr);
      return analysis.type;
    }
    
    return TYPE.ARRAY_DENSE;
  }

  /**
   * Detect typed array type using fast lookup
   * @param {Object} obj - Typed array to detect
   * @returns {number} Type identifier
   */
  detectTypedArrayType(obj) {
    const name = obj.constructor.name;
    return this.typeNameMap.get(name) || TYPE.UINT8ARRAY;
  }

  /**
   * Detect error type using fast lookup
   * @param {Error} err - Error to detect
   * @returns {number} Type identifier
   */
  detectErrorType(err) {
    const name = err.constructor.name;
    return this.errorTypeMap.get(name) || TYPE.CUSTOM_ERROR;
  }
}

/**
 * Main TurboSerial class with full optimization
 */
class TurboSerial {
  /**
   * Initialize TurboSerial with options
   * @param {Object} options - Serialization options
   */
  constructor(options = {}) {
    this.options = {
      compression: options.compression || false,
      deduplication: options.deduplication !== false,
      shareArrayBuffers: options.shareArrayBuffers !== false,
      simdOptimization: options.simdOptimization !== false,
      detectCircular: options.detectCircular !== false,
      serializeFunctions: options.serializeFunctions || false, // NEW: function serialization option
      preservePropertyDescriptors: options.preservePropertyDescriptors !== false, // NEW: descriptor preservation
      memoryPoolSize: options.memoryPoolSize || 65536,
      ...options
    };

    this.pool = new UltraMemoryPool(this.options.memoryPoolSize);
    this.detector = new UltraTypeDetector();
    this.simdProcessor = new SIMDProcessor();
    
    // Reference tracking structures
    this.refs = new Map();
    this.circularRefs = new Set();
    this.strings = new Map();
    this.buffers = new Map();
    
    // Pre-allocate encoders
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  /**
   * Serialize value to binary format
   * @param {*} value - Value to serialize
   * @returns {Uint8Array} Serialized data
   */
  serialize(value) {
    this.resetState();
    
    // Write header
    this.pool.writeU32(0x54425235); // 'TBR5'
    this.pool.writeU8(5); // Version
    
    // Detect circular references if needed
    if (this.options.detectCircular) {
      this.detectCircularReferences(value, new WeakSet());
    }
    
    // Serialize value
    this.writeValue(value);
    
    return this.pool.getResult();
  }

  /**
   * Reset serialization state
   */
  resetState() {
    this.pool.reset();
    this.refs.clear();
    this.circularRefs.clear();
    this.strings.clear();
    this.buffers.clear();
  }

  /**
   * Detect circular references in value
   * @param {*} value - Value to check
   * @param {WeakSet} visited - Visited objects
   */
  detectCircularReferences(value, visited) {
    if (typeof value !== 'object' || value == null) return;
    
    if (visited.has(value)) {
      this.circularRefs.add(value);
      return;
    }
    
    visited.add(value);
    
    try {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (i in value) {
            this.detectCircularReferences(value[i], visited);
          }
        }
      } else if (value instanceof Map) {
        for (const [k, v] of value) {
          this.detectCircularReferences(k, visited);
          this.detectCircularReferences(v, visited);
        }
      } else if (value instanceof Set) {
        for (const item of value) {
          this.detectCircularReferences(item, visited);
        }
      } else {
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            try {
              this.detectCircularReferences(value[key], visited);
            } catch (e) {
              // Skip inaccessible properties
            }
          }
        }
      }
    } finally {
      visited.delete(value);
    }
  }

  /**
   * Write value with deduplication and type dispatch
   * @param {*} value - Value to write
   */
  writeValue(value) {
    // Handle circular references
    if (this.options.detectCircular && typeof value == 'object' && value != null) {
      if (this.circularRefs.has(value)) {
        const refId = this.refs.get(value);
        if (refId !== undefined) {
          this.pool.writeU8(TYPE.CIRCULAR_REF);
          this.pool.writeVarint(refId);
          return;
        }
        this.refs.set(value, this.refs.size);
      }
    }
    
    // Handle object deduplication
    if (this.options.deduplication && typeof value == 'object' && value != null && !this.circularRefs.has(value)) {
      const refId = this.refs.get(value);
      if (refId !== undefined) {
        this.pool.writeU8(TYPE.REFERENCE);
        this.pool.writeVarint(refId);
        return;
      }
      this.refs.set(value, this.refs.size);
    }
    
    // Handle string deduplication
    if (this.options.deduplication && typeof value == 'string' && value.length > 3) {
      const stringId = this.strings.get(value);
      if (stringId !== undefined) {
        this.pool.writeU8(TYPE.STRING_REF);
        this.pool.writeVarint(stringId);
        return;
      }
      this.strings.set(value, this.strings.size);
    }
    
    // Handle buffer sharing
    if (this.options.shareArrayBuffers && value instanceof ArrayBuffer) {
      const bufferId = this.buffers.get(value);
      if (bufferId !== undefined) {
        this.pool.writeU8(TYPE.BUFFER_REF);
        this.pool.writeVarint(bufferId);
        return;
      }
      this.buffers.set(value, this.buffers.size);
    }
    
    // Detect and write type
    const type = this.detector.detect(value);
    this.pool.writeU8(type);
    
    // Fast group dispatch using bit manipulation
    const group = type & TYPE_MASK.GROUP;
    
    switch (group) {
      case TYPE_GROUP.PRIMITIVE:
        // No additional data needed
        break;
      case TYPE_GROUP.NUMBER:
        this.writeNumber(value, type);
        break;
      case TYPE_GROUP.BIGINT:
        this.writeBigInt(value, type);
        break;
      case TYPE_GROUP.STRING:
        this.writeString(value, type);
        break;
      case TYPE_GROUP.ARRAY:
        this.writeArray(value, type);
        break;
      case TYPE_GROUP.OBJECT:
        this.writeObject(value, type);
        break;
      case TYPE_GROUP.TYPED:
        this.writeTypedArray(value, type);
        break;
      case TYPE_GROUP.BUFFER:
        this.writeArrayBuffer(value, type);
        break;
      case TYPE_GROUP.COLLECTION:
        this.writeCollection(value, type);
        break;
      case TYPE_GROUP.DATE:
        this.writeDate(value, type);
        break;
      case TYPE_GROUP.ERROR:
        this.writeError(value, type);
        break;
      case TYPE_GROUP.REGEX:
        this.writeRegExp(value);
        break;
      case TYPE_GROUP.BINARY:
        this.writeBinary(value, type);
        break;
      case TYPE_GROUP.SPECIAL:
        this.writeSpecial(value, type);
        break;
      case TYPE_GROUP.EXTENSION:
        this.writeExtension(value, type);
        break;
    }
  }

  /**
   * Write number value
   * @param {number} value - Number to write
   * @param {number} type - Number type
   */
  writeNumber(value, type) {
    switch (type) {
      case TYPE.INT8:
        this.pool.writeU8(value);
        break;
      case TYPE.INT16:
        this.pool.writeI16(value);
        break;
      case TYPE.INT32:
        this.pool.writeI32(value);
        break;
      case TYPE.UINT32:
        this.pool.writeU32(value);
        break;
      case TYPE.FLOAT32:
        this.pool.writeF32(value);
        break;
      case TYPE.FLOAT64:
        this.pool.writeF64(value);
        break;
      case TYPE.VARINT:
        const isNegative = value < 0;
        this.pool.writeVarint(Math.abs(value));
        this.pool.writeU8(isNegative ? 1 : 0);
        break;
    }
  }

  /**
   * Write BigInt value
   * @param {BigInt} value - BigInt to write
   * @param {number} type - BigInt type
   */
  writeBigInt(value, type) {
    switch (type) {
      case TYPE.BIGINT_POS_SMALL:
      case TYPE.BIGINT_NEG_SMALL:
        this.pool.writeBigInt64(value);
        break;
      case TYPE.BIGINT_POS_LARGE:
      case TYPE.BIGINT_NEG_LARGE:
        this.writeLargeBigInt(value);
        break;
    }
  }

  /**
   * Write large BigInt
   * @param {BigInt} value - BigInt to write
   */
  writeLargeBigInt(value) {
    const bigintValue = BigInt(value);
    const hex = bigintValue.toString(16).replace('-', '');
    const bytes = [];
    
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    if (hex.length % 2) {
      bytes.push(parseInt(hex[0], 16));
    }
    
    this.pool.writeVarint(bytes.length);
    for (const byte of bytes) {
      this.pool.writeU8(byte);
    }
  }

  /**
   * Write string value
   * @param {string} value - String to write
   * @param {number} type - String type
   */
  writeString(value, type) {
    const len = value.length;
    
    switch (type) {
      case TYPE.STRING_EMPTY:
        // No data needed
        break;
        
      case TYPE.STRING_ASCII_TINY:
      case TYPE.STRING_ASCII_SHORT:
        this.pool.writeU8(len);
        for (let i = 0; i < len; i++) {
          this.pool.writeU8(value.charCodeAt(i));
        }
        break;
        
      case TYPE.STRING_ASCII_LONG:
        this.pool.writeVarint(len);
        for (let i = 0; i < len; i++) {
          this.pool.writeU8(value.charCodeAt(i));
        }
        break;
        
      case TYPE.STRING_UTF8_TINY:
      case TYPE.STRING_UTF8_SHORT:
      case TYPE.STRING_UTF8_LONG:
        const encoded = this.encoder.encode(value);
        if (type == TYPE.STRING_UTF8_TINY || type == TYPE.STRING_UTF8_SHORT) {
          this.pool.writeU8(encoded.length);
        } else {
          this.pool.writeVarint(encoded.length);
        }
        this.pool.writeBulkAligned(encoded, 1);
        break;
    }
  }

  /**
   * Write array value
   * @param {Array} value - Array to write
   * @param {number} type - Array type
   */
  writeArray(value, type) {
    const len = value.length;
    
    switch (type) {
      case TYPE.ARRAY_EMPTY:
        // No data needed
        break;
        
      case TYPE.ARRAY_DENSE:
        this.pool.writeVarint(len);
        for (let i = 0; i < len; i++) {
          this.writeValue(value[i]);
        }
        break;
        
      case TYPE.ARRAY_SPARSE:
        this.writeSparseArray(value);
        break;
        
      case TYPE.ARRAY_PACKED_I8:
      case TYPE.ARRAY_PACKED_I16:
      case TYPE.ARRAY_PACKED_I32:
      case TYPE.ARRAY_PACKED_F32:
      case TYPE.ARRAY_PACKED_F64:
        this.pool.writePackedArray(value, type);
        break;
    }
  }

  /**
   * Write sparse array with optimized indexing
   * @param {Array} array - Sparse array to write
   */
  writeSparseArray(array) {
    const len = array.length;
    
    // Use typed array for indices
    const indices = new Uint32Array(len);
    const values = [];
    let count = 0;
    
    for (let i = 0; i < len; i++) {
      if (i in array) {
        indices[count] = i;
        values[count] = array[i];
        count++;
      }
    }
    
    this.pool.writeVarint(len);
    this.pool.writeVarint(count);
    
    for (let i = 0; i < count; i++) {
      this.pool.writeVarint(indices[i]);
      this.writeValue(values[i]);
    }
  }

  /**
   * FIXED: Write object value with enhanced property handling
   * @param {Object} value - Object to write
   * @param {number} type - Object type
   */
  writeObject(value, type) {
    if (type == TYPE.OBJECT_EMPTY) {
      return;
    }
    
    switch (type) {
      case TYPE.OBJECT_LITERAL:
      case TYPE.OBJECT_PLAIN:
        this.writeSimpleObject(value);
        break;
      case TYPE.OBJECT_WITH_DESCRIPTORS:
        this.writeObjectWithDescriptors(value);
        break;
      case TYPE.OBJECT_WITH_METHODS:
        this.writeObjectWithMethods(value);
        break;
      case TYPE.OBJECT_CONSTRUCTOR:
        this.writeConstructorObject(value);
        break;
    }
  }

  /**
   * NEW: Write simple object with basic properties
   * @param {Object} obj - Object to write
   */
  writeSimpleObject(obj) {
    const keys = Object.keys(obj);
    const serializableKeys = keys.filter(key => {
      try {
        const val = obj[key];
        return typeof val !== 'function' || this.options.serializeFunctions;
      } catch (e) {
        return false;
      }
    });
    
    serializableKeys.sort(); // Deterministic order
    this.pool.writeVarint(serializableKeys.length);
    
    for (const key of serializableKeys) {
      this.writeValue(key);
      this.writeValue(obj[key]);
    }
  }

  /**
   * NEW: Write object with complex property descriptors
   * @param {Object} obj - Object to write
   */
  writeObjectWithDescriptors(obj) {
    const ownKeys = Object.getOwnPropertyNames(obj);
    const ownSymbols = Object.getOwnPropertySymbols(obj);
    const allKeys = [...ownKeys, ...ownSymbols];
    
    const serializableKeys = allKeys.filter(key => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(obj, key);
        return descriptor && (
          this.options.serializeFunctions || 
          (!descriptor.get && !descriptor.set && typeof descriptor.value !== 'function')
        );
      } catch (e) {
        return false;
      }
    });
    
    this.pool.writeVarint(serializableKeys.length);
    
    for (const key of serializableKeys) {
      this.writeValue(key);
      
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      
      // Write descriptor flags
      let flags = 0;
      if (descriptor.enumerable) flags |= 1;
      if (descriptor.writable) flags |= 2;
      if (descriptor.configurable) flags |= 4;
      if (descriptor.get) flags |= 8;
      if (descriptor.set) flags |= 16;
      
      this.pool.writeU8(flags);
      
      // Write getter/setter or value
      if (descriptor.get || descriptor.set) {
        if (descriptor.get) this.writeValue(descriptor.get);
        if (descriptor.set) this.writeValue(descriptor.set);
      } else {
        this.writeValue(descriptor.value);
      }
    }
  }

  /**
   * NEW: Write object with methods
   * @param {Object} obj - Object to write
   */
  writeObjectWithMethods(obj) {
    const keys = Object.keys(obj);
    const serializableEntries = [];
    
    for (const key of keys) {
      try {
        const value = obj[key];
        if (typeof value === 'function') {
          if (this.options.serializeFunctions) {
            serializableEntries.push([key, value, true]); // true = is function
          } else {
            serializableEntries.push([key, null, false]); // placeholder
          }
        } else {
          serializableEntries.push([key, value, false]);
        }
      } catch (e) {
        // Skip inaccessible properties
      }
    }
    
    this.pool.writeVarint(serializableEntries.length);
    
    for (const [key, value, isFunction] of serializableEntries) {
      this.writeValue(key);
      this.pool.writeU8(isFunction ? 1 : 0);
      
      if (isFunction && this.options.serializeFunctions) {
        // Serialize function source
        this.writeValue(value.toString());
        this.writeValue(value.name || '');
      } else if (!isFunction) {
        this.writeValue(value);
      } else {
        // Write placeholder marker
        this.pool.writeU8(TYPE.FUNCTION_PLACEHOLDER);
      }
    }
  }

  /**
   * NEW: Write constructor-based object
   * @param {Object} obj - Object to write
   */
  writeConstructorObject(obj) {
    // Write constructor name
    this.writeValue(obj.constructor.name || '');
    
    // Write enumerable properties
    const keys = Object.keys(obj);
    const serializableKeys = keys.filter(key => {
      try {
        return typeof obj[key] !== 'function' || this.options.serializeFunctions;
      } catch (e) {
        return false;
      }
    });
    
    this.pool.writeVarint(serializableKeys.length);
    
    for (const key of serializableKeys) {
      this.writeValue(key);
      this.writeValue(obj[key]);
    }
  }

  /**
   * Write typed array value
   * @param {TypedArray} array - Typed array to write
   * @param {number} type - Typed array type
   */
  writeTypedArray(array, type) {
    const buffer = array.buffer;
    const byteOffset = array.byteOffset;
    const length = array.length;
    
    // Check for shared buffer
    if (this.options.shareArrayBuffers) {
      const bufferId = this.buffers.get(buffer);
      if (bufferId !== undefined) {
        this.pool.writeU8(1); // Shared flag
        this.pool.writeVarint(bufferId);
        this.pool.writeVarint(byteOffset);
        this.pool.writeVarint(length);
        return;
      }
      this.buffers.set(buffer, this.buffers.size);
    }
    
    this.pool.writeU8(0); // Not shared
    this.pool.writeVarint(byteOffset);
    this.pool.writeVarint(length);
    
    const elementSize = BYTES_PER_ELEMENT[type] || 1;
    const totalBytes = length * elementSize;
    
    // Special handling for BigInt arrays
    if (type == TYPE.BIGINT64ARRAY || type == TYPE.BIGUINT64ARRAY) {
      for (let i = 0; i < length; i++) {
        this.pool.writeBigInt64(array[i]);
      }
    } else {
      const sourceData = new Uint8Array(buffer, byteOffset, totalBytes);
      this.pool.writeBulkAligned(sourceData, elementSize);
    }
  }

  /**
   * Write ArrayBuffer value
   * @param {ArrayBuffer} buffer - Buffer to write
   * @param {number} type - Buffer type
   */
  writeArrayBuffer(buffer, type) {
    const bytes = new Uint8Array(buffer);
    this.pool.writeVarint(bytes.length);
    this.pool.writeBulkAligned(bytes, 1);
  }

  /**
   * Write collection value
   * @param {Map|Set} value - Collection to write
   * @param {number} type - Collection type
   */
  writeCollection(value, type) {
    switch (type) {
      case TYPE.MAP:
        this.pool.writeVarint(value.size);
        for (const [key, val] of value) {
          this.writeValue(key);
          this.writeValue(val);
        }
        break;
        
      case TYPE.SET:
        this.pool.writeVarint(value.size);
        for (const item of value) {
          this.writeValue(item);
        }
        break;
    }
  }

  /**
   * Write Date value
   * @param {Date} value - Date to write
   * @param {number} type - Date type
   */
  writeDate(value, type) {
    if (type == TYPE.DATE) {
      this.pool.writeF64(value.getTime());
    }
  }

  /**
   * Write Error value
   * @param {Error} error - Error to write
   * @param {number} type - Error type
   */
  writeError(error, type) {
    this.writeValue(error.message || '');
    this.writeValue(error.stack || '');
    
    if (type == TYPE.AGGREGATE_ERROR && error.errors) {
      this.pool.writeVarint(error.errors.length);
      for (const subError of error.errors) {
        this.writeValue(subError);
      }
    }
  }

  /**
   * Write RegExp value
   * @param {RegExp} regex - RegExp to write
   */
  writeRegExp(regex) {
    this.writeValue(regex.source);
    this.writeValue(regex.flags);
  }

  /**
   * Write binary value
   * @param {Blob|File} value - Binary value to write
   * @param {number} type - Binary type
   */
  writeBinary(value, type) {
    // Simplified for now
    this.pool.writeVarint(0);
    this.pool.writeVarint(0);
  }

  /**
   * FIXED: Write special value with proper symbol handling
   * @param {Symbol} value - Special value to write
   * @param {number} type - Special type
   */
  writeSpecial(value, type) {
    switch (type) {
      case TYPE.SYMBOL:
        // Symbol with description (including empty string)
        const desc = value.description;
        this.writeValue(desc);
        break;
      case TYPE.SYMBOL_NO_DESC:
        // Symbol without description - no data needed
        break;
      case TYPE.SYMBOL_GLOBAL:
        const key = Symbol.keyFor(value);
        this.writeValue(key || '');
        break;
      case TYPE.SYMBOL_WELLKNOWN:
        const wellKnownName = WELLKNOWN_SYMBOLS.get(value);
        this.writeValue(wellKnownName || '');
        break;
    }
  }

  /**
   * NEW: Write extension value (functions, etc.)
   * @param {*} value - Extension value to write
   * @param {number} type - Extension type
   */
  writeExtension(value, type) {
    switch (type) {
      case TYPE.FUNCTION_PLACEHOLDER:
        // Just a marker, no data needed
        break;
    }
  }

  /**
   * Deserialize binary data to value
   * @param {ArrayBuffer|Uint8Array} buffer - Data to deserialize
   * @returns {*} Deserialized value
   */
  deserialize(buffer) {
    this.buffer = new Uint8Array(buffer);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    this.pos = 0;
    
    // Deserialization state
    this.deserializeRefs = [];
    this.deserializeStrings = [];
    this.deserializeBuffers = [];
    
    // Validate header
    const magic = this.readU32();
    if (magic !== 0x54425235) {
      throw new Error('Invalid TurboSerial data');
    }
    
    const version = this.readU8();
    if (version !== 5) {
      throw new Error(`Unsupported version: ${version}`);
    }
    
    return this.readValue();
  }

  /**
   * Read value with type dispatch
   * @returns {*} Read value
   */
  readValue() {
    if (this.pos >= this.buffer.length) {
      throw new Error('Unexpected end of buffer');
    }
    
    const type = this.readU8();
    
    // Handle references first
    if (type == TYPE.REFERENCE || type == TYPE.CIRCULAR_REF) {
      const refId = this.readVarint();
      if (refId >= this.deserializeRefs.length) {
        throw new Error(`Invalid reference: ${refId}`);
      }
      return this.deserializeRefs[refId];
    }
    
    if (type == TYPE.STRING_REF) {
      const stringId = this.readVarint();
      if (stringId >= this.deserializeStrings.length) {
        throw new Error(`Invalid string reference: ${stringId}`);
      }
      return this.deserializeStrings[stringId];
    }
    
    if (type == TYPE.BUFFER_REF) {
      const bufferId = this.readVarint();
      if (bufferId >= this.deserializeBuffers.length) {
        throw new Error(`Invalid buffer reference: ${bufferId}`);
      }
      return this.deserializeBuffers[bufferId];
    }
    
    const group = type & TYPE_MASK.GROUP;
    
    // Pre-register objects for circular references
    let value;
    let needsEarlyRegistration = false;
    
    switch (group) {
      case TYPE_GROUP.OBJECT:
      case TYPE_GROUP.ARRAY:
      case TYPE_GROUP.COLLECTION:
        needsEarlyRegistration = true;
        break;
    }
    
    if (needsEarlyRegistration) {
      // Create placeholder
      switch (group) {
        case TYPE_GROUP.ARRAY:
          value = [];
          break;
        case TYPE_GROUP.COLLECTION:
          if (type == TYPE.MAP) {
            value = new Map();
          } else if (type == TYPE.SET) {
            value = new Set();
          }
          break;
        case TYPE_GROUP.OBJECT:
          value = {};
          break;
      }
      
      if (value) {
        this.deserializeRefs.push(value);
      }
      
      // Fill contents
      switch (group) {
        case TYPE_GROUP.ARRAY:
          this.fillArray(value, type);
          break;
        case TYPE_GROUP.OBJECT:
          this.fillObject(value, type);
          break;
        case TYPE_GROUP.COLLECTION:
          this.fillCollection(value, type);
          break;
      }
    } else {
      // Read normally
      switch (group) {
        case TYPE_GROUP.PRIMITIVE:
          value = this.readPrimitive(type);
          break;
        case TYPE_GROUP.NUMBER:
          value = this.readNumber(type);
          break;
        case TYPE_GROUP.BIGINT:
          value = this.readBigInt(type);
          break;
        case TYPE_GROUP.STRING:
          value = this.readString(type);
          break;
        case TYPE_GROUP.TYPED:
          value = this.readTypedArray(type);
          break;
        case TYPE_GROUP.BUFFER:
          value = this.readArrayBuffer(type);
          break;
        case TYPE_GROUP.DATE:
          value = this.readDate(type);
          break;
        case TYPE_GROUP.ERROR:
          value = this.readError(type);
          break;
        case TYPE_GROUP.REGEX:
          value = this.readRegExp();
          break;
        case TYPE_GROUP.BINARY:
          value = this.readBinary(type);
          break;
        case TYPE_GROUP.SPECIAL:
          value = this.readSpecial(type);
          break;
        case TYPE_GROUP.EXTENSION:
          value = this.readExtension(type);
          break;
        default:
          throw new Error(`Unknown type: 0x${type.toString(16)}`);
      }
      
      // Store reference
      if (typeof value == 'object' && value != null && !needsEarlyRegistration) {
        this.deserializeRefs.push(value);
      }
    }
    
    return value;
  }

  /**
   * Fill array with contents
   * @param {Array} array - Array to fill
   * @param {number} type - Array type
   */
  fillArray(array, type) {
    switch (type) {
      case TYPE.ARRAY_EMPTY:
        break;
      case TYPE.ARRAY_DENSE:
        const length = this.readVarint();
        for (let i = 0; i < length; i++) {
          array[i] = this.readValue();
        }
        break;
      case TYPE.ARRAY_SPARSE:
        const totalLength = this.readVarint();
        const elementCount = this.readVarint();
        array.length = totalLength;
        for (let i = 0; i < elementCount; i++) {
          const index = this.readVarint();
          array[index] = this.readValue();
        }
        break;
      case TYPE.ARRAY_PACKED_I8:
      case TYPE.ARRAY_PACKED_I16:
      case TYPE.ARRAY_PACKED_I32:
      case TYPE.ARRAY_PACKED_F32:
      case TYPE.ARRAY_PACKED_F64:
        const packedArray = this.readPackedArrayData(type);
        array.push(...packedArray);
        break;
    }
  }

  /**
   * FIXED: Fill object with enhanced property handling
   * @param {Object} obj - Object to fill
   * @param {number} type - Object type
   */
  fillObject(obj, type) {
    if (type == TYPE.OBJECT_EMPTY) {
      return;
    }
    
    switch (type) {
      case TYPE.OBJECT_LITERAL:
      case TYPE.OBJECT_PLAIN:
        this.fillSimpleObject(obj);
        break;
      case TYPE.OBJECT_WITH_DESCRIPTORS:
        this.fillObjectWithDescriptors(obj);
        break;
      case TYPE.OBJECT_WITH_METHODS:
        this.fillObjectWithMethods(obj);
        break;
      case TYPE.OBJECT_CONSTRUCTOR:
        this.fillConstructorObject(obj);
        break;
    }
  }

  /**
   * NEW: Fill simple object
   * @param {Object} obj - Object to fill
   */
  fillSimpleObject(obj) {
    const keyCount = this.readVarint();
    for (let i = 0; i < keyCount; i++) {
      const key = this.readValue();
      obj[key] = this.readValue();
    }
  }

  /**
   * NEW: Fill object with descriptors
   * @param {Object} obj - Object to fill
   */
  fillObjectWithDescriptors(obj) {
    const keyCount = this.readVarint();
    
    for (let i = 0; i < keyCount; i++) {
      const key = this.readValue();
      const flags = this.readU8();
      
      const descriptor = {
        enumerable: !!(flags & 1),
        writable: !!(flags & 2),
        configurable: !!(flags & 4)
      };
      
      const hasGetter = !!(flags & 8);
      const hasSetter = !!(flags & 16);
      
      if (hasGetter || hasSetter) {
        if (hasGetter) descriptor.get = this.readValue();
        if (hasSetter) descriptor.set = this.readValue();
      } else {
        descriptor.value = this.readValue();
      }
      
      Object.defineProperty(obj, key, descriptor);
    }
  }

  /**
   * NEW: Fill object with methods
   * @param {Object} obj - Object to fill
   */
  fillObjectWithMethods(obj) {
    const entryCount = this.readVarint();
    
    for (let i = 0; i < entryCount; i++) {
      const key = this.readValue();
      const isFunction = this.readU8();
      
      if (isFunction) {
        if (this.options.serializeFunctions) {
          const functionSource = this.readValue();
          const functionName = this.readValue();
          try {
            // Attempt to reconstruct function
            obj[key] = new Function('return ' + functionSource)();
          } catch (e) {
            // Fall back to placeholder
            obj[key] = function() { throw new Error('Function deserialization failed'); };
          }
        } else {
          // Check for placeholder
          const placeholderType = this.readU8();
          if (placeholderType === TYPE.FUNCTION_PLACEHOLDER) {
            obj[key] = function() { throw new Error('Function not serialized'); };
          }
        }
      } else {
        obj[key] = this.readValue();
      }
    }
  }

  /**
   * NEW: Fill constructor object
   * @param {Object} obj - Object to fill
   */
  fillConstructorObject(obj) {
    const constructorName = this.readValue();
    const keyCount = this.readVarint();
    
    for (let i = 0; i < keyCount; i++) {
      const key = this.readValue();
      obj[key] = this.readValue();
    }
    
    // Store constructor name as non-enumerable property
    Object.defineProperty(obj, '__constructorName', {
      value: constructorName,
      enumerable: false,
      writable: false,
      configurable: true
    });
  }

  /**
   * Fill collection with contents
   * @param {Map|Set} collection - Collection to fill
   * @param {number} type - Collection type
   */
  fillCollection(collection, type) {
    const size = this.readVarint();
    
    switch (type) {
      case TYPE.MAP:
        for (let i = 0; i < size; i++) {
          const key = this.readValue();
          const value = this.readValue();
          collection.set(key, value);
        }
        break;
        
      case TYPE.SET:
        for (let i = 0; i < size; i++) {
          collection.add(this.readValue());
        }
        break;
    }
  }

  /**
   * Read primitive value
   * @param {number} type - Primitive type
   * @returns {*} Primitive value
   */
  readPrimitive(type) {
    switch (type) {
      case TYPE.NULL: return null;
      case TYPE.UNDEFINED: return undefined;
      case TYPE.FALSE: return false;
      case TYPE.TRUE: return true;
      default:
        throw new Error(`Unknown primitive: 0x${type.toString(16)}`);
    }
  }

  /**
   * Read number value
   * @param {number} type - Number type
   * @returns {number} Number value
   */
  readNumber(type) {
    switch (type) {
      case TYPE.INT8:
        return this.view.getInt8(this.pos++);
      case TYPE.INT16:
        return this.readI16();
      case TYPE.INT32:
        return this.readI32();
      case TYPE.UINT32:
        return this.readU32();
      case TYPE.FLOAT32:
        return this.readF32();
      case TYPE.FLOAT64:
        return this.readF64();
      case TYPE.NAN:
        return NaN;
      case TYPE.INFINITY:
        return Infinity;
      case TYPE.NEG_INFINITY:
        return -Infinity;
      case TYPE.NEG_ZERO:
        return -0;
      case TYPE.VARINT:
        const value = this.readVarint();
        const isNegative = this.readU8();
        return isNegative ? -value : value;
      default:
        throw new Error(`Unknown number type: 0x${type.toString(16)}`);
    }
  }

  /**
   * Read BigInt value
   * @param {number} type - BigInt type
   * @returns {BigInt} BigInt value
   */
  readBigInt(type) {
    switch (type) {
      case TYPE.BIGINT_POS_SMALL:
      case TYPE.BIGINT_NEG_SMALL:
        return this.readBigInt64();
      case TYPE.BIGINT_POS_LARGE:
      case TYPE.BIGINT_NEG_LARGE:
        return this.readLargeBigInt(type == TYPE.BIGINT_NEG_LARGE);
      default:
        throw new Error(`Unknown BigInt type: 0x${type.toString(16)}`);
    }
  }

  /**
   * Read large BigInt
   * @param {boolean} isNegative - Whether negative
   * @returns {BigInt} BigInt value
   */
  readLargeBigInt(isNegative) {
    const byteLength = this.readVarint();
    this.ensureBytes(byteLength);
    
    const bytes = this.buffer.subarray(this.pos, this.pos + byteLength);
    this.pos += byteLength;
    
    let hex = '';
    for (let i = bytes.length - 1; i >= 0; i--) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    
    const value = BigInt('0x' + hex);
    return isNegative ? -value : value;
  }

  /**
   * Read string value
   * @param {number} type - String type
   * @returns {string} String value
   */
  readString(type) {
    if (type == TYPE.STRING_EMPTY) {
      return '';
    }
    
    let length;
    let str;
    
    switch (type) {
      case TYPE.STRING_ASCII_TINY:
      case TYPE.STRING_ASCII_SHORT:
      case TYPE.STRING_UTF8_TINY:
      case TYPE.STRING_UTF8_SHORT:
        length = this.readU8();
        break;
      default:
        length = this.readVarint();
        break;
    }
    
    this.ensureBytes(length);
    
    if (type == TYPE.STRING_ASCII_TINY || type == TYPE.STRING_ASCII_SHORT || type == TYPE.STRING_ASCII_LONG) {
      // ASCII string
      str = '';
      for (let i = 0; i < length; i++) {
        str += String.fromCharCode(this.readU8());
      }
    } else {
      // UTF-8 string
      const bytes = this.buffer.subarray(this.pos, this.pos + length);
      this.pos += length;
      str = this.decoder.decode(bytes);
    }
    
    this.deserializeStrings.push(str);
    return str;
  }

  /**
   * Read packed array data
   * @param {number} type - Array type
   * @returns {Array} Array data
   */
  readPackedArrayData(type) {
    const length = this.readVarint();
    const array = new Array(length);
    
    const elementSize = BYTES_PER_ELEMENT[type];
    if (!elementSize) {
      throw new Error(`Unknown packed array type: 0x${type.toString(16)}`);
    }
    
    this.alignPos(Math.min(elementSize, 8));
    this.ensureBytes(length * elementSize);
    
    switch (type) {
      case TYPE.ARRAY_PACKED_I8:
        for (let i = 0; i < length; i++) {
          array[i] = this.view.getInt8(this.pos++);
        }
        break;
      case TYPE.ARRAY_PACKED_I16:
        for (let i = 0; i < length; i++) {
          array[i] = this.view.getInt16(this.pos, true);
          this.pos += 2;
        }
        break;
      case TYPE.ARRAY_PACKED_I32:
        for (let i = 0; i < length; i++) {
          array[i] = this.view.getInt32(this.pos, true);
          this.pos += 4;
        }
        break;
      case TYPE.ARRAY_PACKED_F32:
        for (let i = 0; i < length; i++) {
          array[i] = this.view.getFloat32(this.pos, true);
          this.pos += 4;
        }
        break;
      case TYPE.ARRAY_PACKED_F64:
        for (let i = 0; i < length; i++) {
          array[i] = this.view.getFloat64(this.pos, true);
          this.pos += 8;
        }
        break;
    }
    
    return array;
  }

  /**
   * Read typed array
   * @param {number} type - Typed array type
   * @returns {TypedArray} Typed array
   */
  readTypedArray(type) {
    const isShared = this.readU8();
    
    if (isShared) {
      const bufferId = this.readVarint();
      const byteOffset = this.readVarint();
      const length = this.readVarint();
      
      if (bufferId >= this.deserializeBuffers.length) {
        throw new Error(`Invalid buffer reference: ${bufferId}`);
      }
      
      const buffer = this.deserializeBuffers[bufferId];
      return this.createTypedArray(type, buffer, byteOffset, length);
    } else {
      const byteOffset = this.readVarint();
      const length = this.readVarint();
      const elementSize = BYTES_PER_ELEMENT[type] || 1;
      
      // Special handling for BigInt arrays
      if (type == TYPE.BIGINT64ARRAY || type == TYPE.BIGUINT64ARRAY) {
        this.alignPos(8);
        const values = [];
        for (let i = 0; i < length; i++) {
          values.push(this.readBigInt64());
        }
        
        const Constructor = type == TYPE.BIGINT64ARRAY ? BigInt64Array : BigUint64Array;
        return new Constructor(values);
      } else {
        const totalBytes = length * elementSize;
        
        this.alignPos(elementSize);
        this.ensureBytes(totalBytes);
        
        const data = this.buffer.subarray(this.pos, this.pos + totalBytes);
        this.pos += totalBytes;
        
        // Create properly aligned buffer for typed arrays
        const alignedBuffer = new ArrayBuffer(totalBytes);
        const alignedBytes = new Uint8Array(alignedBuffer);
        alignedBytes.set(data);
        
        this.deserializeBuffers.push(alignedBuffer);
        
        return this.createTypedArray(type, alignedBuffer, 0, length);
      }
    }
  }

  /**
   * Create typed array from buffer
   * @param {number} type - Typed array type
   * @param {ArrayBuffer} buffer - Buffer
   * @param {number} byteOffset - Byte offset
   * @param {number} length - Length
   * @returns {TypedArray} Typed array
   */
  createTypedArray(type, buffer, byteOffset, length) {
    const constructorMap = {
      [TYPE.UINT8ARRAY]: Uint8Array,
      [TYPE.INT8ARRAY]: Int8Array,
      [TYPE.UINT8CLAMPEDARRAY]: Uint8ClampedArray,
      [TYPE.UINT16ARRAY]: Uint16Array,
      [TYPE.INT16ARRAY]: Int16Array,
      [TYPE.UINT32ARRAY]: Uint32Array,
      [TYPE.INT32ARRAY]: Int32Array,
      [TYPE.FLOAT32ARRAY]: Float32Array,
      [TYPE.FLOAT64ARRAY]: Float64Array,
      [TYPE.BIGINT64ARRAY]: BigInt64Array,
      [TYPE.BIGUINT64ARRAY]: BigUint64Array,
      [TYPE.DATAVIEW]: DataView
    };
    
    const Constructor = constructorMap[type];
    if (!Constructor) {
      throw new Error(`Unknown typed array type: 0x${type.toString(16)}`);
    }
    
    return new Constructor(buffer, byteOffset, length);
  }

  /**
   * Read ArrayBuffer
   * @param {number} type - Buffer type
   * @returns {ArrayBuffer} Buffer
   */
  readArrayBuffer(type) {
    const length = this.readVarint();
    this.ensureBytes(length);
    
    const data = this.buffer.subarray(this.pos, this.pos + length);
    this.pos += length;
    
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.deserializeBuffers.push(buffer);
    
    return buffer;
  }

  /**
   * Read Date
   * @param {number} type - Date type
   * @returns {Date} Date
   */
  readDate(type) {
    switch (type) {
      case TYPE.DATE:
        return new Date(this.readF64());
      case TYPE.DATE_INVALID:
        return new Date(NaN);
      default:
        throw new Error(`Unknown date type: 0x${type.toString(16)}`);
    }
  }

  /**
   * Read Error
   * @param {number} type - Error type
   * @returns {Error} Error
   */
  readError(type) {
    const message = this.readValue();
    const stack = this.readValue();
    
    let error;
    const errorConstructors = {
      [TYPE.ERROR]: Error,
      [TYPE.EVAL_ERROR]: EvalError,
      [TYPE.RANGE_ERROR]: RangeError,
      [TYPE.REFERENCE_ERROR]: ReferenceError,
      [TYPE.SYNTAX_ERROR]: SyntaxError,
      [TYPE.TYPE_ERROR]: TypeError,
      [TYPE.URI_ERROR]: URIError
    };
    
    const ErrorConstructor = errorConstructors[type] || Error;
    
    if (type == TYPE.AGGREGATE_ERROR) {
      const errorCount = this.readVarint();
      const errors = [];
      for (let i = 0; i < errorCount; i++) {
        errors.push(this.readValue());
      }
      error = new AggregateError(errors, message);
    } else {
      error = new ErrorConstructor(message);
    }
    
    if (stack) error.stack = stack;
    return error;
  }

  /**
   * Read RegExp
   * @returns {RegExp} RegExp
   */
  readRegExp() {
    const source = this.readValue();
    const flags = this.readValue();
    return new RegExp(source, flags);
  }

  /**
   * Read binary
   * @param {number} type - Binary type
   * @returns {Object} Binary placeholder
   */
  readBinary(type) {
    const size = this.readVarint();
    const typeStr = this.readVarint();
    return { _type: 'Binary', size, typeStr };
  }

  /**
   * FIXED: Read special with proper symbol handling
   * @param {number} type - Special type
   * @returns {Symbol} Symbol
   */
  readSpecial(type) {
    switch (type) {
      case TYPE.SYMBOL:
        const description = this.readValue();
        return Symbol(description);
      case TYPE.SYMBOL_NO_DESC:
        return Symbol(); // Symbol without description
      case TYPE.SYMBOL_GLOBAL:
        const key = this.readValue();
        return Symbol.for(key);
      case TYPE.SYMBOL_WELLKNOWN:
        const wellKnownName = this.readValue();
        return WELLKNOWN_SYMBOLS_BY_NAME.get(wellKnownName) || Symbol(wellKnownName);
      default:
        throw new Error(`Unknown special type: 0x${type.toString(16)}`);
    }
  }

  /**
   * NEW: Read extension value
   * @param {number} type - Extension type
   * @returns {*} Extension value
   */
  readExtension(type) {
    switch (type) {
      case TYPE.FUNCTION_PLACEHOLDER:
        return function() { throw new Error('Function not serialized'); };
      default:
        throw new Error(`Unknown extension type: 0x${type.toString(16)}`);
    }
  }

  // Low-level read operations with bounds checking

  /**
   * Read unsigned 8-bit integer
   * @returns {number} Value
   */
  readU8() {
    this.ensureBytes(1);
    return this.buffer[this.pos++];
  }

  /**
   * Read signed 16-bit integer
   * @returns {number} Value
   */
  readI16() {
    this.alignPos(2);
    this.ensureBytes(2);
    const value = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return value;
  }

  /**
   * Read unsigned 16-bit integer
   * @returns {number} Value
   */
  readU16() {
    this.alignPos(2);
    this.ensureBytes(2);
    const value = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return value;
  }

  /**
   * Read signed 32-bit integer
   * @returns {number} Value
   */
  readI32() {
    this.alignPos(4);
    this.ensureBytes(4);
    const value = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /**
   * Read unsigned 32-bit integer
   * @returns {number} Value
   */
  readU32() {
    this.alignPos(4);
    this.ensureBytes(4);
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /**
   * Read 32-bit float
   * @returns {number} Value
   */
  readF32() {
    this.alignPos(4);
    this.ensureBytes(4);
    const value = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /**
   * Read 64-bit float
   * @returns {number} Value
   */
  readF64() {
    this.alignPos(8);
    this.ensureBytes(8);
    const value = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return value;
  }

  /**
   * Read BigInt64
   * @returns {BigInt} Value
   */
  readBigInt64() {
    this.alignPos(8);
    this.ensureBytes(8);
    const value = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return value;
  }

  /**
   * Read variable-length integer
   * @returns {number} Value
   */
  readVarint() {
    let value = 0;
    let shift = 0;
    let byte;
    
    do {
      this.ensureBytes(1);
      byte = this.buffer[this.pos++];
      value |= (byte & 0x7F) << shift;
      shift += 7;
    } while (byte & 0x80);
    
    return value >>> 0;
  }

  /**
   * Align read position
   * @param {number} alignment - Required alignment
   */
  alignPos(alignment) {
    const mask = (alignment - 1)|0;
    this.pos = ((this.pos + mask) & ~mask) >>> 0;
  }

  /**
   * Ensure bytes available
   * @param {number} count - Required bytes
   */
  ensureBytes(count) {
    if (this.pos + count > this.buffer.length) {
      throw new Error(`Buffer underflow: need ${count}, available ${this.buffer.length - this.pos}`);
    }
  }
}

// Export the optimized library
export default TurboSerial;
