import type { HttpMethod } from "@effect/platform/HttpMethod"
import { Data } from "effect"
import type { Url } from "./url"
import type { Headers } from "./headers"
import type { Input } from "./input"
import type { Output } from "./output"
import type { Error } from "./error"

/**
 * Internal representation of an HTTP route specification.
 * Contains method, URL, headers, body, response, and error parsers.
 *
 * @template M - HTTP method type
 * @template U - URL representation type
 * @template H - Headers representation type
 * @template I - Input representation type
 * @template O - Output representation type
 * @template E - Error representation type
 *
 * @example
 * ```ts
 * import { Route } from "./route"
 * import { value } from "./url"
 * import { schema } from "./output"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * const route = new Route({
 *   method: "GET",
 *   url: value("/todos/1"),
 *   response: schema(Todo)
 * })
 * ```
 */
export class Route<
	M extends HttpMethod,
	U extends Url,
	H extends Headers = never,
	I extends Input = never,
	O extends Output = never,
	E extends Error = never
> extends Data.TaggedClass("@RestApiClient/Route")<{
	url: U
	method: M
	headers?: H
	body?: I
	response?: O
	error?: E
}> {}
