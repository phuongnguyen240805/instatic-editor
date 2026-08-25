/**
 * NDJSON stream reader.
 *
 * The agent chat endpoint streams newline-delimited JSON (one event per line).
 * `readNdjsonStream` owns the byte-decoding + line-buffering loop and yields
 * each line validated against a TypeBox schema — malformed or partial lines are
 * skipped rather than throwing, which is the failure mode a streaming reader has
 * to defend against. Pulling this out of `sendAgentMessage` lets the slice
 * `for await` over typed events instead of inlining a decoder state machine.
 */
import { safeParseJson } from '@core/utils/jsonValidate'
import type { Static, TSchema } from '@core/utils/typeboxHelpers'

export async function* readNdjsonStream<T extends TSchema>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  schema: T,
): AsyncGenerator<Static<T>> {
  const decoder = new TextDecoder()
  let lineBuffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    lineBuffer += decoder.decode(value, { stream: true })
    const lines = lineBuffer.split('\n')
    // The last element is a (possibly empty) partial line — hold it back until
    // the next chunk completes it.
    lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parsed = safeParseJson(trimmed, schema)
      if (!parsed.ok) continue
      yield parsed.value
    }
  }
}
