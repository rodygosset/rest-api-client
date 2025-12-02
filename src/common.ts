import { Schema as S } from "effect"

/**
 * Type alias for Effect Schema used throughout the library.
 * Used for request body validation, response parsing, and error handling.
 *
 * @example
 * ```ts
 * import type { MakerSchema } from "./common"
 * import { Schema } from "effect"
 *
 * const Todo: MakerSchema = Schema.Struct({ id: Schema.String, title: Schema.String })
 * ```
 */
export type MakerSchema = S.Schema<any>
