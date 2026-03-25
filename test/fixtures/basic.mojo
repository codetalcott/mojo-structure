## basic.mojo — test fixture covering core Mojo constructs

from std.ffi import OwnedDLHandle
from std.memory import alloc
from std.collections import (
    Optional,
    List,
)

comptime MyEnv = OpaquePointer[MutAnyOrigin]
comptime MAX_SIZE: Int = 128
alias OldAlias = Int32

## A simple trait for conversion
trait Convertible:
    def convert(self, env: MyEnv) raises -> MyEnv: ...

trait Buildable(Convertible):
    @staticmethod
    def build(env: MyEnv) raises -> Self: ...

## Point — a 2D coordinate
struct Point(Movable):
    ## x coordinate
    var x: Float64
    ## y coordinate
    var y: Float64

    def __init__(out self, x: Float64, y: Float64):
        self.x = x
        self.y = y

    def __moveinit__(out self, deinit take: Self):
        self.x = take.x
        self.y = take.y

    def distance(self) -> Float64:
        """Compute distance from origin."""
        return (self.x * self.x + self.y * self.y).sqrt()

    @staticmethod
    def origin() -> Point:
        return Point(0.0, 0.0)

## Container with type-level constant
struct Config:
    var name: String
    comptime VERSION: Int = 1

    def __init__(out self, name: String):
        self.name = name

def greet(name: String) -> String:
    """Return a greeting."""
    return "Hello, " + name

def add[T: AnyType](a: T, b: T) -> T:
    return a + b

@export("my_func", ABI="C")
def my_exported_func(env: MyEnv, val: MyEnv) -> MyEnv:
    return val

def multi_line_params(
    env: MyEnv,
    name: String,
    count: Int,
) raises -> String:
    return name
