/**
 * Main entry point for the REST API client library.
 * Exports all core modules for building type-safe HTTP clients with Effect.
 *
 * @example
 * ```ts
 * import { Client } from "./src"
 * import { Effect, Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
 * const getTodo = Client.get({ url: "/todos/1", response: Todo })
 * const todo = Effect.gen(function* () {
 *   return yield* getTodo()
 * })
 * ```
 */
import * as Client from "./client"
import * as Headers from "./headers"
import * as Url from "./url"
import * as Input from "./input"
import * as Output from "./output"
import * as Error from "./error"
import * as Route from "./route"

export { Client, Headers, Url, Input, Output, Error, Route }
