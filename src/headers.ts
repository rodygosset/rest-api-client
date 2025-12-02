import { Data, Effect } from "effect"
import { Headers } from "@effect/platform"

/**
 * Represents static headers.
 */
export class Value extends Data.TaggedClass("@RestApiClient/Headers/Value")<{
	headers: Headers.Headers
}> {}

/**
 * Creates static headers.
 *
 * @param headers - Static headers object
 * @returns A Value instance with the headers
 *
 * @example
 * ```ts
 * import { Headers } from "@effect/platform"
 * import { value } from "./headers"
 *
 * const headers = value(Headers.fromInput({ "Content-Type": "application/json" }))
 * ```
 */
export const value = (headers: Headers.Headers) => new Value({ headers })

/**
 * Function type for dynamic header computation.
 * Takes header parameters and returns an Effect that produces Headers.
 */
export type MakerHeadersFn = (arg: any) => Effect.Effect<Headers.Headers, any, any>

/**
 * Represents dynamic headers computed via an Effect function.
 *
 * @template T - Header computation function type
 */
export class Fn<T extends MakerHeadersFn = MakerHeadersFn> extends Data.TaggedClass("@RestApiClient/Headers/Fn")<{
	fn: T
}> {}

/**
 * Creates dynamic headers from an Effect function.
 *
 * @template T - Header computation function type
 * @param fn - Function that takes header parameters and returns an Effect producing Headers
 * @returns A Fn header maker instance
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { Headers } from "@effect/platform"
 * import { fn } from "./headers"
 *
 * const headers = fn((params: { apiKey: string }) =>
 *   Effect.succeed(Headers.fromInput({ "X-API-Key": params.apiKey }))
 * )
 * ```
 */
export const fn = <T extends MakerHeadersFn>(fn: T) => new Fn({ fn })

/**
 * Internal headers representation union type.
 */
export type Headers = Value | Fn

/**
 * Union type for header makers: static Headers or Effect function.
 *
 * @example
 * ```ts
 * import type { MakerHeaders } from "./headers"
 * import type { Headers } from "@effect/platform"
 * import type { Effect } from "effect"
 *
 * type Headers1 = MakerHeaders<Headers.Headers>
 * type Headers2 = MakerHeaders<(params: any) => Effect.Effect<Headers.Headers, never, never>>
 * ```
 */
export type MakerHeaders = Headers.Headers | MakerHeadersFn

/**
 * Converts a MakerHeaders to its internal representation.
 *
 * @template H - Headers maker type
 */
export type ToHeaders<H extends MakerHeaders> = H extends Headers.Headers
	? Value
	: H extends MakerHeadersFn
	? Fn<H>
	: never

/**
 * Converts a MakerHeaders to its internal Route representation.
 *
 * @template H - Headers maker type
 * @param headers - Headers maker (Headers object or function)
 * @returns Internal headers representation
 *
 * @example
 * ```ts
 * import { Headers } from "@effect/platform"
 * import { fromMakerHeaders } from "./headers"
 *
 * const headers = Headers.fromInput({ "Content-Type": "application/json" })
 * const headerMaker = fromMakerHeaders(headers)
 * ```
 */
export const fromMakerHeaders = <H extends MakerHeaders>(headers: H) =>
	Headers.isHeaders(headers) ? value(headers) : fn(headers)
