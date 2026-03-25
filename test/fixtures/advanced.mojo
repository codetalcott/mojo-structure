## advanced.mojo — tests for nested structs, comptime if, module-level var

from std.sys.info import is_nvidia_gpu, is_amd_gpu

## Global registry
var global_count: Int = 0
var _registry: Dict[String, Int] = Dict[String, Int]()

# ── Nested structs ────────────────────────────────────────────────────────

struct Outer:
    var x: Int

    struct Inner:
        var y: Int

        def __init__(out self, y: Int):
            self.y = y

        def get(self) -> Int:
            return self.y

    def __init__(out self, x: Int):
        self.x = x

    def get_inner(self) -> Inner:
        return Inner(self.x)

struct Tree:
    var value: Int

    struct Node:
        var left: Int
        var right: Int

    struct Leaf:
        var data: String

        def __init__(out self, data: String):
            self.data = data

    def __init__(out self, value: Int):
        self.value = value

# ── comptime if — extract from all branches ───────────────────────────────

comptime if is_nvidia_gpu():
    struct NeonVector:
        var data: SIMD[DType.float32, 4]

        def __init__(out self):
            self.data = SIMD[DType.float32, 4](0)

    def neon_add(a: NeonVector, b: NeonVector) -> NeonVector:
        return NeonVector()
elif is_amd_gpu():
    struct AmdVector:
        var data: SIMD[DType.float32, 4]
else:
    struct FallbackVector:
        var data: List[Float32]

        def __init__(out self):
            self.data = List[Float32]()

# ── @parameter if (old syntax) ────────────────────────────────────────────

@parameter
if True:
    comptime OLD_PARAM_VALUE = 42

    def param_guarded_fn() -> Int:
        return OLD_PARAM_VALUE
