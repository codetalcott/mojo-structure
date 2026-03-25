## old_syntax.mojo — test fixture for older Mojo (fn keyword, alias)

from memory import alloc

alias MyType = Int32
alias LIMIT: Int = 256

struct Counter:
    var count: Int

    fn __init__(inout self):
        self.count = 0

    fn increment(inout self):
        self.count += 1

    fn get(self) -> Int:
        return self.count

fn add(a: Int, b: Int) -> Int:
    return a + b

fn do_stuff(x: Int) raises -> String:
    if x < 0:
        raise Error("negative")
    return String(x)
