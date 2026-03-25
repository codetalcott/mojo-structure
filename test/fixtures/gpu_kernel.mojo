## gpu_kernel.mojo — patterns from mojo-gpu-fundamentals skill (modular/skills)
## Tests GPU kernel syntax: plain def kernels, LayoutTensor params,
## comptime constants, shared memory, DeviceContext host code

from std.math import ceildiv
from std.sys import has_accelerator
from std.gpu import global_idx, block_dim, block_idx, thread_idx
from std.gpu import barrier, lane_id, WARP_SIZE
from std.gpu.primitives import warp
from std.gpu.memory import AddressSpace
from std.gpu.host import DeviceContext, DeviceBuffer
from std.os.atomic import Atomic
from layout import Layout, LayoutTensor

# ── Compile-time constants ────────────────────────────────────────────────

comptime dtype = DType.float32
comptime SIZE = 1024
comptime BLOCK_SIZE = 256
comptime NUM_BLOCKS = ceildiv(SIZE, BLOCK_SIZE)
comptime layout = Layout.row_major(SIZE)
comptime TILE_M = 16
comptime TILE_K = 16

comptime a_layout = Layout.row_major(64, 64)
comptime b_layout = Layout.row_major(64, 64)
comptime c_layout = Layout.row_major(64, 64)
comptime tile_a = Layout.row_major(TILE_M, TILE_K)
comptime tile_b = Layout.row_major(TILE_K, TILE_M)

# ── Simple 1D kernel (vector add) ────────────────────────────────────────

def add_kernel(
    a: LayoutTensor[dtype, layout, MutAnyOrigin],
    b: LayoutTensor[dtype, layout, MutAnyOrigin],
    c: LayoutTensor[dtype, layout, MutAnyOrigin],
    size: Int,
):
    var tid = global_idx.x
    if tid < UInt(size):
        c[tid] = a[tid] + b[tid]

# ── Kernel with shared memory ────────────────────────────────────────────

def tiled_kernel(
    input: LayoutTensor[dtype, a_layout, MutAnyOrigin],
    output: LayoutTensor[dtype, c_layout, MutAnyOrigin],
):
    var tx = thread_idx.x
    var ty = thread_idx.y

    var shared_tile = LayoutTensor[
        dtype,
        tile_a,
        MutAnyOrigin,
        address_space=AddressSpace.SHARED,
    ].stack_allocation()

    shared_tile[ty, tx] = input[block_idx.y * TILE_M + ty, block_idx.x * TILE_K + tx]
    barrier()
    output[block_idx.y * TILE_M + ty, block_idx.x * TILE_K + tx] = shared_tile[ty, tx]

# ── Reduction kernel with atomics ────────────────────────────────────────

def reduce_kernel(
    output: UnsafePointer[Int32, MutAnyOrigin],
    input: UnsafePointer[Int32, MutAnyOrigin],
    size: Int,
):
    var tid = global_idx.x
    if tid < UInt(size):
        _ = Atomic.fetch_add(output, input[Int(tid)])

# ── Host-side launcher ───────────────────────────────────────────────────

def main() raises:
    var ctx = DeviceContext()
    var a_buf = ctx.enqueue_create_buffer[dtype](SIZE)
    var b_buf = ctx.enqueue_create_buffer[dtype](SIZE)
    var c_buf = ctx.enqueue_create_buffer[dtype](SIZE)
    a_buf.enqueue_fill(1.0)
    b_buf.enqueue_fill(2.0)

    var a = LayoutTensor[dtype, layout](a_buf)
    var b = LayoutTensor[dtype, layout](b_buf)
    var c = LayoutTensor[dtype, layout](c_buf)

    ctx.enqueue_function[add_kernel, add_kernel](
        a, b, c, SIZE,
        grid_dim=NUM_BLOCKS,
        block_dim=BLOCK_SIZE,
    )

    with c_buf.map_to_host() as host:
        var result = LayoutTensor[dtype, layout](host)
        print(result)
