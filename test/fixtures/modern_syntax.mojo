## modern_syntax.mojo — patterns from mojo-syntax skill (modular/skills)
## Tests current Mojo syntax: comptime, @fieldwise_init, Self.T,
## argument conventions, Writable, iterators, closures, error handling

from std.testing import assert_equal, TestSuite
from std.algorithm import vectorize
from std.python import PythonObject
from std.collections import OwnedKwargsDict

# ── comptime replaces alias and @parameter ────────────────────────────────

comptime N = 1024
comptime MyType = Int
comptime KeyElement = Copyable & Hashable & Equatable
comptime GREETING: StaticString = "Hello, World"

# ── @fieldwise_init + trait composition ───────────────────────────────────

@fieldwise_init
struct Point(Copyable, Movable, Writable):
    var x: Float64
    var y: Float64

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Point(", self.x, ", ", self.y, ")")

# ── Self-qualified parameters ─────────────────────────────────────────────

struct Container[T: Writable]:
    var data: Self.T

    def __init__(out self, value: Self.T):
        self.data = value

    def get(self) -> Self.T:
        return self.data

# ── Multi-line struct with parametric traits ──────────────────────────────

struct Span[mut: Bool, //, T: AnyType, origin: Origin[mut=mut]](
    ImplicitlyCopyable, Sized,
):
    var data: UnsafePointer[Self.T]
    var size: Int

    def __init__(out self, data: UnsafePointer[Self.T], size: Int):
        self.data = data
        self.size = size

    def __len__(self) -> Int:
        return self.size

# ── Argument conventions ──────────────────────────────────────────────────

struct ManagedBuffer:
    var ptr: UnsafePointer[UInt8, MutExternalOrigin]
    var size: Int

    def __init__(out self, var value: String):
        self.size = len(value)
        self.ptr = alloc[UInt8](self.size)

    def modify(mut self):
        self.size = 0

    def consume(deinit self):
        self.ptr.free()

    def view(ref self) -> ref[self] Int:
        return self.size

# ── Lifecycle methods (current syntax) ────────────────────────────────────

struct Resource(Movable):
    var data: Int

    def __init__(out self, x: Int):
        self.data = x

    def __init__(out self, *, copy: Self):
        self.data = copy.data

    def __init__(out self, *, deinit take: Self):
        self.data = take.data

    def __del__(deinit self):
        pass

# ── Writable trait ────────────────────────────────────────────────────────

struct MyType2(Writable):
    var x: Int

    def __init__(out self, x: Int):
        self.x = x

    def write_to(self, mut writer: Some[Writer]):
        writer.write("MyType2(", self.x, ")")

    def write_repr_to(self, mut writer: Some[Writer]):
        writer.write("MyType2(x=", self.x, ")")

# ── Iterator protocol ────────────────────────────────────────────────────

struct MyCollection(Iterable):
    var items: List[Int]

    def __init__(out self):
        self.items = List[Int]()

    def __iter__(ref self) -> MyIter:
        return MyIter(self.items)

struct MyIter:
    var data: List[Int]
    var index: Int

    comptime Element: Movable = Int

    def __init__(out self, data: List[Int]):
        self.data = data
        self.index = 0

    def __next__(mut self) raises -> Int:
        if self.index >= len(self.data):
            raise Error("StopIteration")
        var val = self.data[self.index]
        self.index += 1
        return val

# ── Error handling with typed raises ──────────────────────────────────────

def might_fail() raises -> Int:
    raise Error("something went wrong")

def parse_int(s: String) raises -> Int:
    if len(s) == 0:
        raise Error("empty string")
    return 42

# ── @implicit constructor ─────────────────────────────────────────────────

struct Wrapper:
    var value: Int

    @implicit
    def __init__(out self, value: Int):
        self.value = value

# ── Common decorators ─────────────────────────────────────────────────────

@always_inline
def fast_add(a: Int, b: Int) -> Int:
    return a + b

@no_inline
def slow_path(x: Int) -> Int:
    return x * x

@deprecated("use new_api instead")
def old_api(x: Int) -> Int:
    return x

# ── Numeric conversions ──────────────────────────────────────────────────

def convert_types(my_int: Int, my_uint: UInt) -> Float32:
    var f = Float32(my_int)
    var i = Int(my_uint)
    return f

# ── SIMD operations ──────────────────────────────────────────────────────

def simd_example() -> Scalar[DType.float32]:
    var v = SIMD[DType.float32, 4](1.0, 2.0, 3.0, 4.0)
    return v.reduce_add()

# ── Function types and closures ──────────────────────────────────────────

comptime MyFunc = fn(Int) capturing[_] -> None
comptime SIMDFunc = fn[width: Int](Int) capturing[_] -> None

# ── Testing ──────────────────────────────────────────────────────────────

def test_my_feature() raises:
    assert_equal(fast_add(2, 3), 5)

def main() raises:
    var p = Point(1.0, 2.0)
    print(p)
