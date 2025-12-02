import { Effect, Data, Schema as S } from "effect"
import { HttpClientResponse } from "@effect/platform"
import type { MakerSchema } from "./common"

/**
 * Response parser that parses responses using a Schema.
 *
 * @template T - Schema type for response parsing
 */
export class Schema<T extends MakerSchema = MakerSchema> extends Data.TaggedClass("@RestApiClient/Output/Schema")<{
	schema: T
}> {}

/**
 * Creates a response parser from a Schema.
 *
 * @template T - Schema type for response parsing
 * @param schema - Schema to use for parsing responses
 * @returns A Schema response parser instance
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { schema } from "./output"
 *
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
 * const responseParser = schema(Todo)
 * ```
 */
export const schema = <T extends MakerSchema>(schema: T) => new Schema({ schema })

/**
 * Function type for custom response processing.
 * Takes an HTTP response and returns an Effect that processes it.
 */
export type MakerOutputFn = (res: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any, any>

/**
 * Response processor that processes responses using a custom Effect function.
 *
 * @template T - Response processing function type
 */
export class Fn<T extends MakerOutputFn = MakerOutputFn> extends Data.TaggedClass("@RestApiClient/Output/Fn")<{
	fn: T
}> {}

/**
 * Creates a response processor from a custom Effect function.
 *
 * @template T - Response processing function type
 * @param fn - Function that processes HTTP response and returns an Effect
 * @returns A Fn response processor instance
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { HttpClientResponse } from "@effect/platform"
 * import { fn } from "./output"
 *
 * const responseProcessor = fn((res: HttpClientResponse.HttpClientResponse) =>
 *   Effect.gen(function* () {
 *     const json = yield* res.json
 *     return { data: json, status: res.status }
 *   })
 * )
 * ```
 */
export const fn = <T extends MakerOutputFn>(fn: T) => new Fn({ fn })

/**
 * Internal output representation union type.
 */
export type Output = Schema | Fn

/**
 * Union type for response parsers: Schema or Effect function.
 *
 * @example
 * ```ts
 * import type { MakerOutput } from "./output"
 * import { Schema } from "effect"
 * import type { HttpClientResponse } from "@effect/platform"
 * import type { Effect } from "effect"
 *
 * type Output1 = MakerOutput<typeof Schema.Struct({ id: Schema.String })>
 * type Output2 = MakerOutput<(res: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, never, never>>
 * ```
 */
export type MakerOutput = MakerSchema | MakerOutputFn

/**
 * Converts a MakerOutput to its internal Route representation.
 *
 * @template O - Output maker type
 * @param output - Output maker (Schema or function)
 * @returns Internal output representation
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { fromMakerOutput } from "./output"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * const outputParser = fromMakerOutput(Todo)
 * ```
 */
export const fromMakerOutput = <O extends MakerOutput>(output: O) => (S.isSchema(output) ? schema(output) : fn(output))

/**
 * Converts a MakerOutput to its internal representation.
 *
 * @template O - Output maker type
 */
export type ToOutput<O extends MakerOutput> = O extends MakerSchema
	? Schema<O>
	: O extends MakerOutputFn
	? Fn<O>
	: never

/**
 * Infers the output type from a MakerOutput.
 *
 * @template O - Output maker type
 * @returns The inferred output type
 *
 * @example
 * ```ts
 * import type { InferOutput } from "./output"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * type OutputType = InferOutput<typeof Todo>
 * // OutputType = { id: string }
 * ```
 */
export type InferOutput<O extends MakerOutput> = [O] extends [never]
	? HttpClientResponse.HttpClientResponse
	: O extends MakerOutputFn
	? Effect.Effect.Success<ReturnType<O>>
	: S.Schema.Type<O>
