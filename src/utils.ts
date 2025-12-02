import type { Effect } from "effect"

/**
 * Checks if a type is an empty object.
 *
 * @template T - Type to check
 * @returns true if T is an empty object, false otherwise
 *
 * @example
 * ```ts
 * import type { IsEmptyObject } from "./utils"
 *
 * type Test1 = IsEmptyObject<{}>
 * // Test1 = true
 *
 * type Test2 = IsEmptyObject<{ id: string }>
 * // Test2 = false
 * ```
 */
export type IsEmptyObject<T> = T extends object ? (keyof T extends never ? true : false) : false

/**
 * Extracts the error type from an Effect-returning function.
 *
 * @template E - Effect-returning function type
 * @returns The error type of the Effect
 *
 * @example
 * ```ts
 * import type { InferEffectError } from "./utils"
 * import type { Effect } from "effect"
 *
 * type ErrorType = InferEffectError<() => Effect.Effect<number, string, never>>
 * // ErrorType = string
 * ```
 */
export type InferEffectError<E> = E extends (...args: any[]) => Effect.Effect<any, infer F, any> ? F : never

/**
 * Extracts the requirements (dependencies) type from an Effect-returning function.
 *
 * @template E - Effect-returning function type
 * @returns The requirements type of the Effect
 *
 * @example
 * ```ts
 * import type { InferEffectRequirements } from "./utils"
 * import type { Effect } from "effect"
 *
 * type Reqs = InferEffectRequirements<() => Effect.Effect<number, never, { http: HttpClient.HttpClient }>>
 * // Reqs = { http: HttpClient.HttpClient }
 * ```
 */
export type InferEffectRequirements<E> = E extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R : never
