import { Effect, Data, Schema as S } from "effect"
import { HttpBody } from "@effect/platform"
import type { MakerSchema } from "./common"

/**
 * Represents a static body value with its schema.
 *
 * @template T - Schema type for the body value
 */
export class Value<T extends MakerSchema = MakerSchema> extends Data.TaggedClass("@RestApiClient/Input/Value")<{
	schema: T
	value: S.Schema.Type<T>
}> {}

/**
 * Creates a static body value.
 *
 * @template T - Schema type for the body value
 * @param schema - Schema to validate the body value
 * @param value - Static body value conforming to the schema
 * @returns A Value instance with the schema and value
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { value } from "./input"
 *
 * const Todo = Schema.Struct({ title: Schema.String })
 * const body = value(Todo, { title: "My Todo" })
 * ```
 */
export const value = <T extends MakerSchema>(schema: T, value: S.Schema.Type<T>) => new Value({ schema, value })

/**
 * Represents a body that will be validated and encoded using a Schema.
 *
 * @template T - Schema type for body validation and encoding
 */
export class Schema<T extends MakerSchema = MakerSchema> extends Data.TaggedClass("@RestApiClient/Input/Schema")<{
	schema: T
}> {}

/**
 * Creates a Schema-based body encoder.
 *
 * @template T - Schema type for body validation and encoding
 * @param schema - Schema to use for validating and encoding the body
 * @returns A Schema body encoder instance
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { schema } from "./input"
 *
 * const Todo = Schema.Struct({ title: Schema.String })
 * const bodyEncoder = schema(Todo)
 * ```
 */
export const schema = <T extends MakerSchema>(schema: T) => new Schema({ schema })

/**
 * Function type for custom body encoding.
 * Takes body parameters and returns an Effect that produces an HttpBody.
 */
export type MakerInputFn = (arg: any) => Effect.Effect<HttpBody.HttpBody, any, any>

/**
 * Represents a body encoded via a custom Effect function.
 *
 * @template T - Body encoding function type
 */
export class Fn<T extends MakerInputFn = MakerInputFn> extends Data.TaggedClass("@RestApiClient/Input/Fn")<{
	fn: T
}> {}

/**
 * Creates a custom body encoder function.
 *
 * @template T - Body encoding function type
 * @param fn - Function that takes body parameters and returns an Effect producing HttpBody
 * @returns A Fn body encoder instance
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { HttpBody } from "@effect/platform"
 * import { fn } from "./input"
 *
 * const bodyEncoder = fn((params: { file: File }) =>
 *   Effect.gen(function* () {
 *     const formData = new FormData()
 *     formData.append("file", params.file)
 *     return HttpBody.formData(formData)
 *   })
 * )
 * ```
 */
export const fn = <T extends MakerInputFn>(fn: T) => new Fn({ fn })

/**
 * Internal input representation union type.
 */
export type Input = Value | Schema | Fn

/**
 * Union type for body makers: static Value, Schema, or Effect function.
 *
 * @example
 * ```ts
 * import type { MakerInput } from "./input"
 * import { Schema } from "effect"
 * import type { Effect } from "effect"
 * import type { HttpBody } from "@effect/platform"
 *
 * type Input1 = MakerInput<typeof Schema.Struct({ title: Schema.String })>
 * type Input2 = MakerInput<(params: any) => Effect.Effect<HttpBody.HttpBody, never, never>>
 * ```
 */
export type MakerInput = Value | MakerSchema | MakerInputFn

/**
 * Converts a MakerInput to its internal representation.
 *
 * @template I - Input maker type
 */
export type ToInput<I extends MakerInput> = I extends Value
	? I
	: I extends MakerSchema
	? Schema<I>
	: I extends MakerInputFn
	? Fn<I>
	: never

/**
 * Converts a MakerInput to its internal Route representation.
 *
 * @template I - Input maker type
 * @param input - Input maker (Value, Schema, or function)
 * @returns Internal input representation
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { fromMakerInput } from "./input"
 *
 * const Todo = Schema.Struct({ title: Schema.String })
 * const inputEncoder = fromMakerInput(Todo)
 * ```
 */
export const fromMakerInput = <I extends MakerInput>(input: I) =>
	input instanceof Value ? (input as Value<typeof input.schema>) : S.isSchema(input) ? schema(input) : fn(input)
