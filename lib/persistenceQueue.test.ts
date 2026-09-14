import { describe, it, expect, vi } from 'vitest'
import { createKeyedQueue } from './persistenceQueue'

// A controllable "deferred" promise so tests can decide exactly when a task resolves, to prove ordering
// rather than relying on incidental microtask timing.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// createKeyedQueue() chains multiple .then()/.catch() hops per handoff between tasks, each its own
// microtask tick — a fixed number of `await Promise.resolve()` calls is brittle against that. A macrotask
// flush (setTimeout) reliably waits until every pending microtask has drained, regardless of chain depth.
function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('createKeyedQueue', () => {
  it('runs two tasks for the same key strictly in enqueue order, never overlapping', async () => {
    const queue = createKeyedQueue()
    const events: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()

    const resultA = queue.enqueue('exercise-1', async () => {
      events.push('a-start')
      await a.promise
      events.push('a-end')
    })
    const resultB = queue.enqueue('exercise-1', async () => {
      events.push('b-start')
      await b.promise
      events.push('b-end')
    })

    // b must not start until a has fully finished, even though a is still pending
    await flushMicrotasks()
    expect(events).toEqual(['a-start'])

    a.resolve()
    await resultA
    await flushMicrotasks()
    expect(events).toEqual(['a-start', 'a-end', 'b-start'])

    b.resolve()
    await resultB
    expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('does not serialize tasks for different keys — they run concurrently', async () => {
    const queue = createKeyedQueue()
    const events: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()

    queue.enqueue('exercise-1', async () => {
      events.push('a-start')
      await a.promise
      events.push('a-end')
    })
    queue.enqueue('exercise-2', async () => {
      events.push('b-start')
      await b.promise
      events.push('b-end')
    })

    await Promise.resolve()
    await Promise.resolve()
    // both start immediately — different keys don't wait on each other
    expect(events).toEqual(['a-start', 'b-start'])

    a.resolve()
    b.resolve()
  })

  it('a failed task still rejects for its own caller, with the original error', async () => {
    const queue = createKeyedQueue()
    const boom = new Error('boom')
    await expect(
      queue.enqueue('exercise-1', async () => {
        throw boom
      })
    ).rejects.toBe(boom)
  })

  it('a failed task does not block the next task for the same key from running', async () => {
    const queue = createKeyedQueue()
    const events: string[] = []

    const first = queue.enqueue('exercise-1', async () => {
      events.push('first')
      throw new Error('first failed')
    })
    const second = queue.enqueue('exercise-1', async () => {
      events.push('second')
      return 'ok'
    })

    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBe('ok')
    expect(events).toEqual(['first', 'second'])
  })

  it('three sequential tasks for the same key run in the exact order enqueued', async () => {
    const queue = createKeyedQueue()
    const order: number[] = []
    const tasks = [1, 2, 3].map((n) => queue.enqueue('exercise-1', async () => {
      order.push(n)
    }))
    await Promise.all(tasks)
    expect(order).toEqual([1, 2, 3])
  })

  it('normal sequential usage (no concurrency at all) behaves exactly as calling the task directly', async () => {
    const queue = createKeyedQueue()
    const spy = vi.fn(async (n: number) => n * 2)
    const a = await queue.enqueue('k', () => spy(1))
    const b = await queue.enqueue('k', () => spy(2))
    expect(a).toBe(2)
    expect(b).toBe(4)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
