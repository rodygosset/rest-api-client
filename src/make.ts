import { fromMakerHeaders, type MakerHeaders, type MakerHeadersFn, type ToHeaders } from "./headers"
import { fromMakerUrl, type MakerUrl, type MakerUrlFn, type ToUrl } from "./url"
import { fromMakerInput, value, type MakerInput, type MakerInputFn, type ToInput } from "./input"
import type { MakerSchema } from "./common"
import { Effect, Schema, Option } from "effect"
import type { IsEmptyObject } from "./utils"
import { type InferOutput, type MakerOutput, fromMakerOutput, type ToOutput } from "./output"
import { HttpClientResponse, Headers, HttpBody, HttpClient, HttpClientRequest } from "@effect/platform"
import type { InferEffectError, InferEffectRequirements } from "./utils"
import type { HttpMethod } from "@effect/platform/HttpMethod"
import { type InferResponseError, type MakerError, fromMakerError, type ToError } from "./error"
import { Route } from "./route"

/**
 * Extracts URL parameters from a MakerUrl type.
 *
 * @template U - URL maker type
 * @returns An object with `url` property if U is a function, otherwise empty object
 *
 * @example
 * ```ts
 * import type { MakerUrlParams } from "./make"
 *
 * type Params = MakerUrlParams<(params: { id: string }) => string>
 * // Params = { url: { id: string } }
 * ```
 */
export type MakerUrlParams<U extends MakerUrl> = U extends MakerUrlFn ? { url: Parameters<U>[0] } : {}

/**
 * Default headers type used when no headers are specified.
 */
export type DefaultMakerHeaders = Headers.Headers

/**
 * Extracts header parameters from a MakerHeaders type.
 *
 * @template H - Headers maker type
 * @returns An object with `headers` property if H is a function, otherwise empty object
 *
 * @example
 * ```ts
 * import type { MakerHeadersParams } from "./make"
 * import type { Effect } from "effect"
 * import type { Headers } from "@effect/platform"
 *
 * type Params = MakerHeadersParams<(params: { apiKey: string }) => Effect.Effect<Headers.Headers, never, never>>
 * // Params = { headers: { apiKey: string } }
 * ```
 */
export type MakerHeadersParams<H extends MakerHeaders = DefaultMakerHeaders> = H extends MakerHeadersFn
	? { headers: Parameters<H>[0] }
	: {}

/**
 * Extracts body parameters from a MakerInput type.
 *
 * @template I - Input encoder type
 * @returns An object with `body` property if I requires body parameters, otherwise empty object
 *
 * @example
 * ```ts
 * import type { MakerBodyParams } from "./make"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ title: Schema.String })
 * type Params = MakerBodyParams<typeof Todo>
 * // Params = { body: { title: string } }
 * ```
 */
export type MakerBodyParams<I extends MakerInput = never> = [I] extends [never]
	? {}
	: I extends MakerInputFn
	? { body: Parameters<I>[0] }
	: I extends MakerSchema
	? { body: Schema.Schema.Type<I> }
	: {}

/**
 * Combined parameters type for a route.
 * Infers all required parameters from URL, headers, and body makers.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @returns Combined parameters object, or void if no parameters are required
 *
 * @example
 * ```ts
 * import type { MakerParams } from "./make"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ title: Schema.String })
 * type Params = MakerParams<
 *   (params: { id: string }) => string,
 *   never,
 *   typeof Todo
 * >
 * // Params = { url: { id: string }, body: { title: string } }
 * ```
 */
export type MakerParams<
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never
> = IsEmptyObject<MakerUrlParams<U> & MakerHeadersParams<H> & MakerBodyParams<I>> extends true
	? void
	: MakerUrlParams<U> & MakerHeadersParams<H> & MakerBodyParams<I>

/**
 * Core function that creates an Effect from a route specification.
 * Returns a function that takes route parameters and executes the HTTP request.
 *
 * @template M - HTTP method type
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - Route specification with method, URL, headers, body, response, and error parsers
 * @returns A function that takes route parameters and returns an Effect executing the HTTP request
 *
 * @example
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { Route } from "./route"
 * import { value } from "./url"
 * import { schema } from "./output"
 * import { make } from "./make"
 *
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
 * const route = new Route({
 *   method: "GET",
 *   url: value("/todos/1"),
 *   response: schema(Todo)
 * })
 * const getTodo = make(route)
 * const test = Effect.gen(function* () {
 *   const todo = yield* getTodo()
 *   return todo
 * })
 * ```
 */
export function make<
	M extends HttpMethod,
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
>(spec: Route<M, ToUrl<U>, ToHeaders<H>, ToInput<I>, ToOutput<O>, ToError<E>>) {
	const getHeaders = (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			if (!spec.headers) return Headers.empty

			switch (spec.headers._tag) {
				case "@RestApiClient/Headers/Value":
					return spec.headers.headers
				case "@RestApiClient/Headers/Fn":
					if (params && "headers" in params) return yield* spec.headers.fn(params.headers)
					return Headers.empty
			}
		}).pipe(
			Effect.flatMap((headers) =>
				Effect.gen(function* () {
					const contentType = Option.getOrUndefined(Headers.get("Content-Type")(headers))

					if (
						!contentType &&
						spec.body &&
						(spec.body._tag === "@RestApiClient/Input/Schema" ||
							spec.body._tag === "@RestApiClient/Input/Value")
					)
						return Headers.set("Content-Type", "application/json")(headers)

					return headers
				})
			)
		) as Effect.Effect<Headers.Headers, InferEffectError<H>, InferEffectRequirements<H>>

	const parseBody = (schema: MakerSchema, body: Schema.Schema.Type<I>) =>
		Schema.encode(schema)(body).pipe(HttpBody.json)

	const getBody = (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			if (spec.body?._tag === "@RestApiClient/Input/Value")
				return yield* parseBody(spec.body.schema, spec.body.value)

			if (!spec.body || !params || !("body" in params)) return undefined

			if (spec.body._tag === "@RestApiClient/Input/Schema") return yield* parseBody(spec.body.schema, params.body)

			return yield* spec.body.fn(params.body)
		}) as Effect.Effect<
			HttpBody.Uint8Array | undefined,
			InferEffectError<I> | InferEffectError<typeof parseBody>,
			InferEffectRequirements<I> | InferEffectRequirements<typeof parseBody>
		>

	const parseResponse = (schema: MakerSchema, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const json = yield* response.json

			return yield* schema.pipe(Schema.decodeUnknown)(json)
		})

	const getResponse = (getter: ToOutput<O> | undefined, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			if (!getter) return response

			switch (getter._tag) {
				case "@RestApiClient/Output/Schema":
					return yield* parseResponse(getter.schema, response)
				case "@RestApiClient/Output/Fn":
					return yield* getter.fn(response)
			}
		}) as Effect.Effect<
			InferOutput<O>,
			InferEffectError<O> | InferEffectError<typeof parseResponse>,
			InferEffectRequirements<O> | InferEffectRequirements<typeof parseResponse>
		>

	const getError = (getter: ToError<E>, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			switch (getter._tag) {
				case "@RestApiClient/Error/Schema":
					const error = yield* parseResponse(getter.schema, response)
					return yield* Effect.fail(error)
				case "@RestApiClient/Error/Fn":
					return yield* Effect.fail(getter.fn(response))
			}
		}) as Effect.Effect<
			never,
			InferResponseError<E> | InferEffectError<typeof parseResponse>,
			InferEffectRequirements<typeof parseResponse>
		>

	return (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			const url =
				spec.url._tag === "@RestApiClient/Url/Value"
					? spec.url.url
					: spec.url.fn(params && "url" in params ? params.url : undefined)

			const headers = yield* getHeaders(params)

			const body = yield* getBody(params)

			const request = HttpClientRequest.make(spec.method)(url).pipe(
				(req) => (body ? HttpClientRequest.setBody(req, body) : req),
				HttpClientRequest.setHeaders(headers)
			)

			const client = yield* HttpClient.HttpClient

			const response = yield* client.execute(request)

			if (spec.error && (response.status < 200 || response.status >= 300)) yield* getError(spec.error, response)

			return yield* getResponse(spec.response, response)
		})
}

/**
 * Specification type for creating routes.
 * Used to define HTTP method, URL, headers, body, response, and error parsers.
 *
 * @template M - HTTP method type
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 *
 * @example
 * ```ts
 * import type { MakerSpec } from "./make"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * type Spec = MakerSpec<"GET", "/todos/1", never, never, typeof Todo, never>
 * ```
 */
export type MakerSpec<
	M extends HttpMethod,
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
> = {
	method: M
	url: U
	headers?: H
	body?: I
	response?: O
	error?: E
}

/**
 * Converts a MakerSpec to a Route instance.
 * Internal helper used by HTTP method builders.
 *
 * @template M - HTTP method type
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - Route specification
 * @returns A Route instance
 */
export const toRoute = <
	M extends HttpMethod,
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
>(
	spec: MakerSpec<M, U, H, I, O, E>
) =>
	new Route<M, ToUrl<U>, ToHeaders<H>, ToInput<I>, ToOutput<O>, ToError<E>>({
		method: spec.method,
		url: fromMakerUrl(spec.url) as ToUrl<U>,
		headers: spec.headers ? (fromMakerHeaders(spec.headers) as ToHeaders<H>) : undefined,
		body: spec.body ? (fromMakerInput(spec.body) as ToInput<I>) : undefined,
		response: spec.response ? (fromMakerOutput(spec.response) as ToOutput<O>) : undefined,
		error: spec.error ? (fromMakerError(spec.error) as ToError<E>) : undefined,
	})

/**
 * Specification type for HTTP methods without the method field.
 *
 * @template M - HTTP method type
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 */
export type MethodMakerSpec<
	M extends HttpMethod,
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
> = Omit<MakerSpec<M, U, H, I, O, E>, "method">

/**
 * Specification type for GET requests.
 * GET requests cannot have a body.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template O - Output parser type
 * @template E - Error parser type
 *
 * @example
 * ```ts
 * import type { GetMakerSpec } from "./make"
 * import { Schema } from "effect"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * type Spec = GetMakerSpec<"/todos/1", never, typeof Todo, never>
 * ```
 */
export type GetMakerSpec<
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	O extends MakerOutput = never,
	E extends MakerError = never
> = Omit<MethodMakerSpec<"GET", U, H, never, O, E>, "body">

/**
 * Creates a GET request function.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - GET request specification
 * @returns A function that executes the GET request and returns an Effect
 *
 * @example
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { get } from "./make"
 *
 * const Todo = Schema.Struct({ id: Schema.String })
 * const getTodo = get({ url: "/todos/1", response: Todo })
 * const test = Effect.gen(function* () {
 *   const todo = yield* getTodo()
 *   return todo
 * })
 * ```
 */
export const get = <
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	O extends MakerOutput = never,
	E extends MakerError = never
>(
	spec: GetMakerSpec<U, H, O, E>
) => make(toRoute({ ...spec, method: "GET" }))

/**
 * Specification type for POST requests.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 *
 * @example
 * ```ts
 * import type { PostMakerSpec } from "./make"
 * import { Schema } from "effect"
 *
 * const NewTodo = Schema.Struct({ title: Schema.String })
 * const Todo = Schema.Struct({ id: Schema.String })
 * type Spec = PostMakerSpec<"/todos", never, typeof NewTodo, typeof Todo, never>
 * ```
 */
export type PostMakerSpec<
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
> = MethodMakerSpec<"POST", U, H, I, O, E>

/**
 * Creates a POST request function.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - POST request specification
 * @returns A function that executes the POST request and returns an Effect
 *
 * @example
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { post } from "./make"
 *
 * const NewTodo = Schema.Struct({ title: Schema.String })
 * const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
 * const createTodo = post({ url: "/todos", body: NewTodo, response: Todo })
 * const test = Effect.gen(function* () {
 *   const todo = yield* createTodo({ body: { title: "My Todo" } })
 *   return todo
 * })
 * ```
 */
export const post = <
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
>(
	spec: PostMakerSpec<U, H, I, O, E>
) => make(toRoute({ ...spec, method: "POST" }))

/**
 * Specification type for PUT requests.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 */
export type PutMakerSpec<
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
> = MethodMakerSpec<"PUT", U, H, I, O, E>

/**
 * Creates a PUT request function.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - PUT request specification
 * @returns A function that executes the PUT request and returns an Effect
 *
 * @example
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { put } from "./make"
 *
 * const UpdateTodo = Schema.Struct({ title: Schema.String })
 * const updateTodo = put({ url: "/todos/1", body: UpdateTodo })
 * Effect.gen(function* () {
 *   const todo = yield* updateTodo({ body: { title: "Updated" } })
 *   return todo
 * })
 * ```
 */
export const put = <
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
>(
	spec: PutMakerSpec<U, H, I, O, E>
) => make(toRoute({ ...spec, method: "PUT" }))

/**
 * Specification type for DELETE requests.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 */
export type DelMakerSpec<
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
> = MethodMakerSpec<"DELETE", U, H, I, O, E>

/**
 * Creates a DELETE request function.
 *
 * @template U - URL maker type
 * @template H - Headers maker type
 * @template I - Input encoder type
 * @template O - Output parser type
 * @template E - Error parser type
 * @param spec - DELETE request specification
 * @returns A function that executes the DELETE request and returns an Effect
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { del } from "./make"
 *
 * const deleteTodo = del({ url: "/todos/1" })
 * Effect.gen(function* () {
 *   yield* deleteTodo()
 * })
 * ```
 */
export const del = <
	U extends MakerUrl,
	H extends MakerHeaders = DefaultMakerHeaders,
	I extends MakerInput = never,
	O extends MakerOutput = never,
	E extends MakerError = never
>(
	spec: DelMakerSpec<U, H, I, O, E>
) => make(toRoute({ ...spec, method: "DELETE" }))
