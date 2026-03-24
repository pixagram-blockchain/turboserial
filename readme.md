# TurboSerial V 0.2.0 - Ultra-Optimized JavaScript Serializer
 
![Logo](https://github.com/pixagram-blockchain/turboserial/blob/main/logo.jpg?raw=true)
 
![npm version](https://img.shields.io/npm/v/@pixagram/turboserial)
![license](https://img.shields.io/npm/l/@pixagram/turboserial)
![size](https://img.shields.io/bundlephobia/minzip/@pixagram/turboserial)
 
**TurboSerial** is a cutting-edge JavaScript serialization library designed for maximum performance and comprehensive type support. Built with an asm.js-style `Int32Array` heap architecture, SIMD-lane-style block processing, generation-gated view caching, and getter/setter property accessors for hot-path memory performance, it delivers exceptional speed while supporting virtually all JavaScript data types including circular references, BigInt, typed arrays, and complex object structures.
 
## 🚀 Key Features
 
- **Ultra-Fast Performance**: SIMD-optimized processing with 128-bit alignment and 4-wide lane block analysis
- **asm.js-Style Heap Architecture**: `Int32Array` control heap for JIT-optimized position tracking and integer specialization
- **Getter/Setter Memory Accessors**: Property accessors proxy through typed heap arrays, eliminating hidden class lookups on hot paths
- **Generation-Gated View Cache**: Typed array views lazily created and cached, automatically invalidated on reallocation
- **Comprehensive Type Support**: 140+ data types and edge cases
- **Circular Reference Handling**: Automatic detection and resolution
- **Memory Efficient**: Advanced pooling, deduplication, and full `resetMemory()` lifecycle control
- **BigInt Support**: Full BigInt serialization including large values
- **Typed Array Optimization**: Native support for all typed array types
- **String Optimization**: ASCII/UTF-8 detection with size-based encoding
- **Array Packing**: Automatic optimization for numeric arrays with SIMD-lane-style analysis
- **Secure by Default**: No `eval()` or `new Function()` calls unless explicitly opted in
- **Zero Dependencies**: Lightweight, self-contained library
 
## 📦 Installation
 
```bash
npm install @pixagram/turboserial
```
 
## 🔧 Usage
 
### Basic Serialization
 
```javascript
import TurboSerial from '@pixagram/turboserial';
 
const serializer = new TurboSerial();
 
// Serialize any JavaScript value
const data = {
  string: 'Hello, World!',
  number: 42,
  bigint: 123456789012345678901234567890n,
  array: [1, 2, 3, 4, 5],
  date: new Date(),
  map: new Map([['key', 'value']]),
  typedArray: new Float32Array([1.1, 2.2, 3.3])
};
 
const serialized = serializer.serialize(data);
const deserialized = serializer.deserialize(serialized);
```
 
### Advanced Configuration
 
```javascript
const serializer = new TurboSerial({
  compression: false,           // Enable compression
  deduplication: true,          // Enable reference deduplication
  shareArrayBuffers: true,      // Share ArrayBuffer references
  simdOptimization: true,       // Enable SIMD optimizations
  detectCircular: true,         // Detect circular references
  allowFunction: false,         // Allow function storage/retrieval (security gate)
  serializeFunctions: false,    // Capture and reconstruct function source
  preservePropertyDescriptors: true, // Preserve property descriptors
  memoryPoolSize: 65536         // Initial memory pool size
});
```
 
### Function Handling
 
By default, TurboSerial never calls `eval()` or `new Function()`. Function-valued properties are silently omitted during serialization and return as `undefined` on deserialization. This is controlled by the `allowFunction` option which acts as a security gate.
 
```javascript
// Default — safe, no eval() ever
const safe = new TurboSerial();
 
// Functions exist as throwing placeholders, but still no eval()
const withPlaceholders = new TurboSerial({
  allowFunction: true
});
 
// Full round-trip — function source is captured and reconstructed via new Function()
const withFunctions = new TurboSerial({
  allowFunction: true,
  serializeFunctions: true
});
```
 
| `allowFunction` | `serializeFunctions` | Behavior |
|---|---|---|
| `false` (default) | *(forced false)* | Functions ignored entirely. No `eval()`. Properties become `undefined`. |
| `true` | `false` | Functions stored as **placeholders** that throw when called. No `eval()`. |
| `true` | `true` | Full round-trip. Function source captured and reconstructed via `new Function()`. |
 
> ⚠️ **Security Note**: Only enable `allowFunction: true` with `serializeFunctions: true` when you fully trust the serialized data. Reconstructing functions from arbitrary source strings via `new Function()` can execute arbitrary code.
 
### Circular References
 
```javascript
const obj = { name: 'parent' };
obj.self = obj;  // Circular reference
 
const serialized = serializer.serialize(obj);
const deserialized = serializer.deserialize(serialized);
// deserialized.self === deserialized (circular reference preserved)
```
 
### Memory Lifecycle Control
 
TurboSerial distinguishes between two levels of reset:
 
- **`resetState()`** — Called automatically between `serialize()` calls. Clears tracking maps and resets the write cursor. The underlying buffer is kept intact for reuse.
- **`resetMemory()`** — Full deep reset. Zeros the buffer, clears all internal state (serialization + deserialization), invalidates typed view caches, and optionally shrinks oversized buffers. Use between independent workloads to reclaim memory and prevent cross-operation data leakage.
 
```javascript
const ts = new TurboSerial();
 
// Heavy workload that grows the internal buffer
ts.serialize(new Uint8Array(1_000_000));
 
// Full reset — zeros buffer, clears all state
ts.resetMemory();
 
// Full reset with buffer shrink — reclaims oversized allocations
ts.resetMemory({ shrink: true });
 
// Skip zeroing for pure performance (no security concern)
ts.resetMemory({ zero: false });
 
// Nuclear option — also rebuilds type detector internal maps
ts.resetMemory({ recreateDetector: true });
 
// Chainable
const result = ts.resetMemory().serialize({ fresh: true });
```
 
| Option | Default | Description |
|---|---|---|
| `shrink` | `false` | Shrink buffer back toward `memoryPoolSize` if oversized (>4× initial) and peak usage was below 50% capacity |
| `zero` | `true` | Zero the used buffer region (prevents stale data leakage, helps GC) |
| `recreateDetector` | `false` | Rebuild `UltraTypeDetector` and `SIMDProcessor` (clears their internal lookup maps) |
 
> 💡 **When to use**: Call `resetMemory()` between independent batches (e.g. processing different files, switching contexts in a long-lived server). For rapid serialize/deserialize cycles on related data, the automatic `resetState()` is sufficient.
 
## 🧪 Compatibility Test Results
 
TurboSerial has been extensively tested with 140+ test cases covering all JavaScript data types and edge cases:
 
| Test Category | Test Count | Status | Description |
|---------------|------------|--------|-------------|
| **Primitives** | 8 | ✅ Pass | null, undefined, boolean, NaN, Infinity |
| **Numbers** | 12 | ✅ Pass | int8, int16, int32, float32, float64, special values |
| **BigInt** | 6 | ✅ Pass | Small/large positive/negative BigInt values |
| **Strings** | 10 | ✅ Pass | Empty, ASCII, UTF-8, various sizes, unicode |
| **Arrays** | 15 | ✅ Pass | Dense, sparse, empty, packed numeric arrays |
| **Objects** | 12 | ✅ Pass | Plain, constructor, empty, nested objects |
| **Typed Arrays** | 11 | ✅ Pass | All typed array types, DataView, alignment |
| **Collections** | 8 | ✅ Pass | Map, Set, WeakMap, WeakSet with complex keys |
| **Dates** | 4 | ✅ Pass | Valid dates, invalid dates, edge cases |
| **Errors** | 9 | ✅ Pass | All error types, AggregateError, custom errors |
| **RegExp** | 3 | ✅ Pass | Various patterns and flags |
| **ArrayBuffer** | 5 | ✅ Pass | ArrayBuffer, SharedArrayBuffer, views |
| **Symbols** | 4 | ✅ Pass | Local and global symbols |
| **Binary Objects** | 4 | ✅ Pass | Blob, File objects (browser environment) |
| **Circular References** | 8 | ✅ Pass | Object/array circular references |
| **References** | 6 | ✅ Pass | Object deduplication, shared references |
| **SIMD Optimization** | 5 | ✅ Pass | Packed arrays, SIMD-compatible data |
| **Large Objects** | 4 | ✅ Pass | Large arrays, deep nesting, memory stress |
| **Complex Structures** | 6 | ✅ Pass | Mixed types, deep nesting, real-world data |
| **Edge Cases** | 4 | ✅ Pass | Sparse arrays, deleted properties, prototypes |
 
**Total: 140 tests passed** ✅
 
## ⚡ Performance Comparison
 
TurboSerial is designed to be one of the fastest JavaScript serializers available, comparable to MessagePack in speed while supporting significantly more data types and features:
 
| Feature | TurboSerial | MessagePack | JSON | Others |
|---------|-------------|-------------|------|--------|
| **Speed** | 🔥🔥 | 🔥🔥 | 🔥🔥 | 🔥+ |
| **Type Support** | ✅ Comprehensive | ❌ Limited | ❌ Very Limited | ❌ Varies |
| **Memory Lifecycle** | ✅ `resetMemory()` | ❌ None | ❌ None | ❌ Varies |
| **JIT Optimization** | ✅ asm.js heap | ❌ Plain props | ❌ N/A | ❌ Varies |
 
## 🎯 Supported Data Types
 
### Core Types
- `null`, `undefined`
- `boolean` (true/false)
- `number` (int8, int16, int32, uint32, float32, float64, NaN, ±Infinity, -0)
- `bigint` (small and large values)
- `string` (ASCII/UTF-8 optimized)
- `symbol` (local, global, and well-known)
 
### Complex Types
- `Array` (dense, sparse, packed numeric)
- `Object` (plain, literal, constructor, with descriptors, with methods)
- `Date` (valid and invalid)
- `RegExp` (all patterns and flags)
- `Error` (all standard error types + AggregateError)
- `Function` (opt-in via `allowFunction` + `serializeFunctions`)
 
### Binary Types
- `ArrayBuffer`, `SharedArrayBuffer`
- All typed arrays (`Uint8Array`, `Float32Array`, etc.)
- `DataView`
- `Blob`, `File` (browser environment)
 
### Collections
- `Map`, `Set`
- `WeakMap`, `WeakSet`
 
### Advanced Features
- Circular references
- Object deduplication
- ArrayBuffer sharing
- SIMD-optimized packed arrays with 4-wide lane analysis
- Property descriptor preservation
- Full memory lifecycle control (`resetMemory()` with shrink/zero options)
- asm.js-style `Int32Array` heap with generation-gated view caching
 
## 🏗️ Architecture
 
TurboSerial employs several advanced techniques for optimal performance:
 
### asm.js-Style Heap Architecture
The memory pool's hot state (`pos`, `size`, `generation`, `peakPos`) lives in a single `Int32Array(4)` control heap rather than plain object properties. JIT engines compile typed array element access to near-register-speed loads and stores, eliminating the hidden class lookups and polymorphic inline cache misses that plain property access can cause under serialization pressure. All arithmetic uses `|0` coercion throughout for integer specialization — the same pattern that asm.js uses to hint the engine toward integer-only codegen.
 
### Getter/Setter Property Accessors
`pos`, `size`, and all typed views (`f32View`, `f64View`, `i32View`, `u32View`) are implemented as get/set accessors that proxy through the `_heap` control array and a generation-gated view cache. This gives external code clean property syntax (`pool.pos`, `pool.i32View`) while all internal hot paths read/write `_heap[0]` directly — keeping the JIT monomorphic and avoiding the accessor overhead on the tightest loops.
 
### Generation-Gated View Cache
Typed array views (`Float32Array`, `Int32Array`, etc.) over the pool buffer are lazily created on first access and cached until a buffer reallocation bumps the generation counter in `_heap[2]`. This means repeated access during packed array writes hits the cache instead of constructing new typed views on every call, while still guaranteeing stale views are never used after a realloc.
 
### SIMD-Lane-Style Block Processing
The `SIMDProcessor.analyzeNumericArray()` method processes arrays in 4-wide blocks that simulate 128-bit SIMD lanes — 4 elements are loaded, integer-checked, min/max-reduced, and float32-precision-tested per iteration with pairwise reduction. A pre-allocated `Float32Array(1)` scratch buffer avoids per-call allocation for precision checks. Scalar tail handling covers non-multiple-of-4 lengths.
 
### Memory Lifecycle
Two reset tiers: `resetState()` is the fast path called between `serialize()` cycles (clears tracking maps, resets cursor, keeps the buffer). `resetMemory()` is the full deep reset — zeros the used buffer region, resets all heap counters, invalidates view caches, clears both serialization and deserialization state, and optionally shrinks oversized buffers using a peak-usage heuristic (>4× initial size with <50% peak utilization triggers shrink).
 
### SIMD Optimization
- 128-bit alignment for optimal memory access
- Vectorized processing for numeric arrays
- Automatic detection of SIMD-compatible data
 
### Type Detection
- Ultra-fast type detection using bitwise operations
- Optimized constructor lookup tables
- Branchless optimization paths
 
### Encoding Strategy
- Variable-length encoding for optimal space usage
- Type-specific optimizations (ASCII vs UTF-8)
- Packed arrays for homogeneous numeric data
 
## 🔧 API Reference
 
### Constructor Options
 
```javascript
new TurboSerial({
  compression: boolean,              // Enable compression (default: false)
  deduplication: boolean,            // Enable object deduplication (default: true)
  shareArrayBuffers: boolean,        // Share ArrayBuffer references (default: true)
  simdOptimization: boolean,         // Enable SIMD optimizations (default: true)
  detectCircular: boolean,           // Detect circular references (default: true)
  allowFunction: boolean,            // Allow function storage/retrieval (default: false)
  serializeFunctions: boolean,       // Capture and reconstruct function source (default: false)
  preservePropertyDescriptors: boolean, // Preserve property descriptors (default: true)
  memoryPoolSize: number             // Initial memory pool size (default: 65536)
})
```
 
### Methods
 
#### `serialize(value: any): Uint8Array`
Serializes a JavaScript value to a binary format.
 
#### `deserialize(buffer: ArrayBuffer | Uint8Array): any`
Deserializes binary data back to a JavaScript value.
 
#### `resetMemory(opts?: object): TurboSerial`
Full deep reset of all internal state. Zeros the pool buffer, clears serialization and deserialization tracking structures, invalidates typed view caches, and optionally shrinks oversized buffers. Returns `this` for chaining.
 
**Options:**
- `shrink` (boolean, default `false`) — Shrink buffer if oversized
- `zero` (boolean, default `true`) — Zero the used buffer region
- `recreateDetector` (boolean, default `false`) — Rebuild type detector and SIMD processor
 
#### `resetState(): void`
Lightweight reset called automatically between `serialize()` calls. Clears tracking maps and resets the write cursor without touching the underlying buffer.
 
## 🔒 Security
 
TurboSerial is **secure by default**. The `allowFunction` option defaults to `false`, which guarantees that no calls to `eval()` or `new Function()` are ever made during serialization or deserialization. Function-valued properties are silently omitted and deserialized as `undefined`.
 
To enable function serialization, you must explicitly opt in by setting both `allowFunction: true` and `serializeFunctions: true`. Only do this when you fully trust the source of the serialized data, as reconstructing functions from stored source strings can execute arbitrary code.
 
## 🤝 Contributing
 
Contributions are welcome! Please ensure all tests pass and add new tests for any new features.
 
```bash
# Run tests
npm test
 
# Build
npm run build
 
# Benchmark
npm run benchmark
```
 
## 📄 License
 
MIT License - see LICENSE file for details.
 
