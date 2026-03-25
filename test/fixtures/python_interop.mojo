## python_interop.mojo — patterns from mojo-python-interop skill (modular/skills)
## Tests Python extension module patterns: @export fn, PythonModuleBuilder,
## @fieldwise_init struct with py methods, PythonObject params

from std.os import abort
from std.python import Python, PythonObject
from std.python.bindings import PythonModuleBuilder
from std.collections import OwnedKwargsDict

# ── Simple function exports ───────────────────────────────────────────────

fn add(a: PythonObject, b: PythonObject) raises -> PythonObject:
    return a + b

fn greet(name: PythonObject) raises -> PythonObject:
    var s = String(py=name)
    return PythonObject("Hello, " + s + "!")

# ── Bound type with methods ──────────────────────────────────────────────

@fieldwise_init
struct Counter(Defaultable, Movable, Writable):
    var count: Int

    fn __init__(out self):
        self.count = 0

    @staticmethod
    fn py_init(
        out self: Counter,
        args: PythonObject,
        kwargs: PythonObject,
    ) raises:
        if len(args) == 1:
            self = Self(Int(py=args[0]))
        else:
            self = Self()

    @staticmethod
    fn increment(py_self: PythonObject) raises -> PythonObject:
        var self_ptr = py_self.downcast_value_ptr[Self]()
        self_ptr[].count += 1
        return PythonObject(self_ptr[].count)

    @staticmethod
    fn get_count(self_ptr: UnsafePointer[Self, MutAnyOrigin]) -> PythonObject:
        return PythonObject(self_ptr[].count)

    @staticmethod
    fn config(
        py_self: PythonObject,
        kwargs: OwnedKwargsDict[PythonObject],
    ) raises -> PythonObject:
        for entry in kwargs.items():
            print(entry.key, "=", entry.value)
        return py_self

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Counter(", self.count, ")")

# ── Module init (PyInit_) ────────────────────────────────────────────────

@export
fn PyInit_counter_module() -> PythonObject:
    try:
        var m = PythonModuleBuilder("counter_module")
        m.def_function[add]("add")
        m.def_function[greet]("greet")
        _ = (
            m.add_type[Counter]("Counter")
            .def_py_init[Counter.py_init]()
            .def_method[Counter.increment]("increment")
            .def_method[Counter.get_count]("get_count")
            .def_method[Counter.config]("config")
        )
        return m.finalize()
    except e:
        abort(String("failed to create module: ", e))

# ── Python usage from Mojo ───────────────────────────────────────────────

def use_python() raises:
    var np = Python.import_module("numpy")
    var arr = np.array([1, 2, 3])
    var result = Python.evaluate("1 + 2")

def convert_types() raises:
    var py_obj = PythonObject(42)
    var i = Int(py=py_obj)
    var f = Float64(py=py_obj)
    var s = String(py=PythonObject("hello"))
