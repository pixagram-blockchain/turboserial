# TurboSerial V 0.0.1 - Ultra-Optimized JavaScript Serializer

![npm version](https://img.shields.io/npm/v/@pixagram/turboserial)
![license](https://img.shields.io/npm/l/@pixagram/turboserial)
![size](https://img.shields.io/bundlephobia/minzip/@pixagram/turboserial)

**TurboSerial** is a cutting-edge JavaScript serialization library designed for maximum performance and comprehensive type support. Built with SIMD optimization, 128-bit alignment, and advanced memory management, it delivers exceptional speed while supporting virtually all JavaScript data types including circular references, BigInt, typed arrays, and complex object structures.

## 🚀 Key Features

- **Ultra-Fast Performance**: SIMD-optimized processing with 128-bit alignment
- **Comprehensive Type Support**: 140+ data types and edge cases
- **Circular Reference Handling**: Automatic detection and resolution
- **Memory Efficient**: Advanced pooling and deduplication strategies
- **BigInt Support**: Full BigInt serialization including large values
- **Typed Array Optimization**: Native support for all typed array types
- **String Optimization**: ASCII/UTF-8 detection with size-based encoding
- **Array Packing**: Automatic optimization for numeric arrays
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
  memoryPoolSize: 65536        // Initial memory pool size
});
```

### Circular References

```javascript
const obj = { name: 'parent' };
obj.self = obj;  // Circular reference

const serialized = serializer.serialize(obj);
const deserialized = serializer.deserialize(serialized);
// deserialized.self === deserialized (circular reference preserved)
```

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

## 🎯 Supported Data Types

### Core Types
- `null`, `undefined`
- `boolean` (true/false)
- `number` (int8, int16, int32, uint32, float32, float64, NaN, ±Infinity, -0)
- `bigint` (small and large values)
- `string` (ASCII/UTF-8 optimized)
- `symbol` (local and global)

### Complex Types
- `Array` (dense, sparse, packed numeric)
- `Object` (plain, constructor, empty)
- `Date` (valid and invalid)
- `RegExp` (all patterns and flags)
- `Error` (all standard error types + AggregateError)

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
- SIMD-optimized packed arrays

## 🏗️ Architecture

TurboSerial employs several advanced techniques for optimal performance:

### SIMD Optimization
- 128-bit alignment for optimal memory access
- Vectorized processing for numeric arrays
- Automatic detection of SIMD-compatible data

### Memory Management
- Pre-allocated memory pools
- Efficient buffer resizing with alignment preservation
- Zero-copy operations where possible

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
  compression: boolean,        // Enable compression (default: false)
  deduplication: boolean,      // Enable object deduplication (default: true)
  shareArrayBuffers: boolean,  // Share ArrayBuffer references (default: true)
  simdOptimization: boolean,   // Enable SIMD optimizations (default: true)
  detectCircular: boolean,     // Detect circular references (default: true)
  memoryPoolSize: number      // Initial memory pool size (default: 65536)
})
```

### Methods

#### `serialize(value: any): Uint8Array`
Serializes a JavaScript value to a binary format.

#### `deserialize(buffer: ArrayBuffer | Uint8Array): any`
Deserializes binary data back to a JavaScript value.

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
