import { Headers, HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import type { HttpMethod } from "@effect/platform/HttpMethod"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"

type IsEmptyObject<T> = T extends object ? (keyof T extends never ? true : false) : false

/**
 * Represents a URL that can be either a static string or a function that dynamically generates a URL.
 *
 * @example
 * ```ts
 * // Static URL
 * url: "/todos"
 *
 * // Dynamic URL function
 * url: (params: { id: string }) => `/todos/${params.id}`
 * ```
 */
export type UrlFunction = string | ((arg: any) => string)

/**
 * Represents headers that can be:
 * - `undefined` (no headers)
 * - A static `Headers.Headers` instance
 * - A function that takes a record parameter and returns an `Effect` that produces `Headers.Headers`
 *
 * @example
 * ```ts
 * // No headers
 * headers: undefined
 *
 * // Static headers
 * headers: Headers.fromInput({ Accept: "application/json" })
 *
 * // Dynamic headers function
 * headers: (params: { contentType: string }) =>
 *   Effect.succeed(Headers.fromInput({ "Content-Type": params.contentType }))
 * ```
 */
export type HeadersFunction = Headers.Headers | ((arg: any) => Effect.Effect<Headers.Headers, any, any>) | undefined

/**
 * Represents a static request body with a schema and its corresponding data.
 * The `data` property is type-checked against the schema type to ensure type safety.
 *
 * @template T - The schema type that validates the data
 *
 * @example
 * ```ts
 * body: { schema: Todo, data: { id: "123", title: "Todo", description: "Description", completed: false } }
 * ```
 */
export type StaticBody<T extends Schema.Schema<any> = Schema.Schema<any>> = { schema: T; data: Schema.Schema.Type<T> }

/**
 * Creates a type-safe static body with schema and data.
 * Ensures the data matches the schema type at compile time.
 *
 * @template T - The schema type
 * @param schema - The schema to validate the data
 * @param data - The data that must match the schema type
 * @returns A StaticBody instance with type-safe schema and data
 *
 * @example
 * ```ts
 * body(Todo, { id: "123", title: "Todo", description: "Description", completed: false })
 * ```
 */
export const body = <T extends Schema.Schema<any>>(schema: T, data: Schema.Schema.Type<T>): StaticBody<T> => ({
	schema,
	data,
})

/**
 * Represents request body handling that can be:
 * - A `StaticBody` with schema and data for type-safe static bodies
 * - A `Schema.Schema` for automatic JSON encoding and validation
 * - A function that takes a record parameter and returns an `Effect` that produces `HttpBody.HttpBody`
 *
 * When a StaticBody is provided, the data is encoded as JSON using the schema.
 * When a Schema is provided, the body will be automatically encoded as JSON in the request.
 * When a function is provided, it allows for custom body encoding (e.g., form data, binary, etc.).
 *
 * @example
 * ```ts
 * // StaticBody for type-safe static data
 * body: { schema: Todo, data: { id: "123", title: "Todo", description: "Description", completed: false } }
 *
 * // Schema for automatic JSON encoding
 * body: NewTodo
 *
 * // Custom body function
 * body: (params: { file: File }) =>
 *   Effect.gen(function* () {
 *     const formData = new FormData()
 *     formData.append("file", params.file)
 *     return HttpBody.formData(formData)
 *   })
 * ```
 */
export type InputFunction = StaticBody | Schema.Schema<any> | ((arg: any) => Effect.Effect<HttpBody.HttpBody, any, any>)

/**
 * Represents response handling that can be:
 * - `never` (response returned as-is as `HttpClientResponse`)
 * - A `Schema.Schema` for automatic JSON parsing and validation
 * - A function that takes the `HttpClientResponse` and returns an `Effect` for custom processing
 *
 * @example
 * ```ts
 * // No response handler (returns HttpClientResponse)
 * response: undefined
 *
 * // Schema for automatic parsing
 * response: Todo.pipe(Schema.Array)
 *
 * // Custom response function
 * response: (res: HttpClientResponse.HttpClientResponse) =>
 *   Effect.gen(function* () {
 *     const data = yield* res.json
 *     return { data, status: res.status }
 *   })
 * ```
 */
export type OutputFunction =
	| Schema.Schema<any>
	| ((res: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any, any>)

/**
 * Represents error handling that can be:
 * - A `Schema.Schema` for automatic JSON parsing and validation of error responses
 * - A function that takes the `HttpClientResponse` and returns an error value
 *
 * Error handling is only triggered when `filterStatusOk` is false (the default) and the response
 * status is outside the 200-299 range. When an error occurs, the error schema/function is used to
 * parse or transform the error response, and the Effect fails with the resulting error.
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Schema for automatic error parsing
 * const createTodo = RestApiClient.post({
 *   url: "/todos",
 *   body: NewTodo,
 *   response: Todo,
 *   error: ApiError
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Custom error function
 * const createTodo = RestApiClient.post({
 *   url: "/todos",
 *   body: NewTodo,
 *   response: Todo,
 *   error: (res: HttpClientResponse.HttpClientResponse) =>
 *     new ApiError({
 *       method: "POST",
 *       endpoint: "/todos",
 *       statusCode: res.status,
 *       statusText: res.statusText,
 *       message: `Failed to create todo: ${res.status}`
 *     })
 * })
 * ```
 */
export type ErrorFunction = Schema.Schema<any> | ((res: HttpClientResponse.HttpClientResponse) => any)

/**
 * Represents an HTTP route configuration with type-safe URL, headers, body, response handling, and error handling.
 *
 * @template M - The HTTP method (GET, POST, PUT, DELETE, etc.)
 * @template U - The URL function type (string or function)
 * @template H - The headers function type (undefined, Headers instance, or function)
 * @template I - The input body schema type
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @property url - The URL endpoint. Can be a static string or a function that takes a record parameter and returns a string.
 * @property method - The HTTP method for this route
 * @property headers - Optional headers. Can be a static Headers instance or a function that takes a record parameter and returns an Effect<Headers>.
 * @property body - Optional body handler. Can be a Schema.Schema for automatic JSON encoding and validation, or a function that takes a record parameter and returns an Effect<HttpBody> for custom encoding.
 * @property response - Optional response handler. Can be a Schema for automatic parsing or a function that takes HttpClientResponse and returns an Effect.
 * @property error - Optional error handler. Can be a Schema for automatic error parsing or a function that takes HttpClientResponse and returns an error value. Only triggered when filterStatusOk is false and response status is outside 200-299 range.
 * @property filterStatusOk - Whether to filter non-OK status codes (defaults to false)
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * const route = new RestApiClient.Route({
 *   method: "GET",
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   headers: Headers.fromInput({ Accept: "application/json" }),
 *   response: Todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Route with error handling and body schema (encoded as JSON)
 * const route = new RestApiClient.Route({
 *   method: "POST",
 *   url: "/todos",
 *   body: NewTodo, // Schema will be automatically encoded as JSON
 *   response: Todo,
 *   error: ApiError
 * })
 * ```
 */
export class Route<
	M extends HttpMethod,
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
> extends Data.TaggedClass("@RestApiClient/Route")<{
	/** The URL endpoint. Can be a static string or a function that takes a record parameter and returns a string. */
	url: U
	/** The HTTP method for this route */
	method: M
	/** Optional headers. Can be a static Headers instance or a function that takes a record parameter and returns an Effect<Headers>. */
	headers?: H
	/** Optional body handler. Can be a Schema.Schema for automatic JSON encoding and validation, or a function that takes a record parameter and returns an Effect<HttpBody> for custom encoding. */
	body?: I
	/** Optional response handler. Can be a Schema for automatic parsing or a function that takes HttpClientResponse and returns an Effect. */
	response?: O
	/** Optional error handler. Can be a Schema for automatic error parsing or a function that takes HttpClientResponse and returns an error value. Only triggered when filterStatusOk is false and response status is outside 200-299 range. */
	error?: E
	/** Whether to filter non-OK status codes (defaults to false) */
	filterStatusOk?: boolean
}> {}

export type MakerUrl<U extends UrlFunction> = U extends (arg: any) => string ? { url: Parameters<U>[0] } : {}
export type MakerHeaders<H extends HeadersFunction = undefined> = H extends (
	arg: any
) => Effect.Effect<Headers.Headers, any, any>
	? { headers: Parameters<H>[0] }
	: {}
export type MakerBody<I extends InputFunction = never> = [I] extends [never]
	? {}
	: I extends (arg: any) => Effect.Effect<HttpBody.HttpBody, any, any>
	? { body: Parameters<I>[0] }
	: I extends Schema.Schema<any>
	? { body: Schema.Schema.Type<I> }
	: {}

export type MakerParams<
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never
> = IsEmptyObject<MakerUrl<U> & MakerHeaders<H> & MakerBody<I>> extends true
	? void
	: MakerUrl<U> & MakerHeaders<H> & MakerBody<I>

type InferOutput<O extends OutputFunction> = [O] extends [never]
	? HttpClientResponse.HttpClientResponse
	: O extends (...args: any[]) => Effect.Effect<any, any, any>
	? Effect.Effect.Success<ReturnType<O>>
	: Schema.Schema.Type<O>

type InferEffectError<E> = E extends (...args: any[]) => Effect.Effect<any, infer F, any> ? F : never

type InferEffectRequirements<E> = E extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R : never

/**
 * Creates a type-safe HTTP client function from a Route specification.
 *
 * The returned function handles:
 * - Dynamic URL construction when `url` is a function
 * - Static or dynamic headers based on the `headers` configuration
 * - Request body encoding when a `body` is provided (Schema.Schema is automatically encoded as JSON, or a function can return custom HttpBody)
 * - Response parsing/transformation based on the `response` configuration
 * - Error handling when `error` is provided and `filterStatusOk` is false (default). Error handling is triggered when response status is outside the 200-299 range.
 *
 * @template M - The HTTP method type
 * @template U - The URL function type
 * @template H - The headers function type
 * @template I - The input body schema type
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @param spec - The Route specification containing method, url, headers, body, response, and optional error configuration
 * @returns A function that takes parameters (if needed) and returns an Effect that executes the HTTP request
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * const getTodo = RestApiClient.make(new RestApiClient.Route({
 *   method: "GET",
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo
 * }))
 *
 * // Usage
 * const program = Effect.gen(function* () {
 *   const todo = yield* getTodo({ url: { id: "123" } })
 *   return todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // With dynamic headers and body schema (encoded as JSON)
 * const createTodo = RestApiClient.make(new RestApiClient.Route({
 *   method: "POST",
 *   url: "/todos",
 *   headers: (params: { contentType: string }) =>
 *     Effect.succeed(Headers.fromInput({ "Content-Type": params.contentType })),
 *   body: NewTodo, // Schema will be automatically encoded as JSON
 *   response: Todo
 * }))
 *
 * const program = Effect.gen(function* () {
 *   const todo = yield* createTodo({
 *     headers: { contentType: "application/json" },
 *     body: { title: "New Todo", description: "Description" }
 *   })
 *   return todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // With custom response handler
 * const getTodoWithMetadata = RestApiClient.make(new RestApiClient.Route({
 *   method: "GET",
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: (res: HttpClientResponse.HttpClientResponse) =>
 *     Effect.gen(function* () {
 *       const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
 *       return { todo, status: res.status }
 *     })
 * }))
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // With error handling (filterStatusOk defaults to false) and body schema (encoded as JSON)
 * const createTodo = RestApiClient.make(new RestApiClient.Route({
 *   method: "POST",
 *   url: "/todos",
 *   body: NewTodo, // Schema will be automatically encoded as JSON
 *   response: Todo,
 *   error: ApiError
 * }))
 *
 * // If the request fails with a non-OK status, the error schema will parse the response
 * // and the Effect will fail with the parsed error
 * const program = Effect.gen(function* () {
 *   const todo = yield* createTodo({ body: { title: "New Todo", description: "Description" } })
 *   return todo
 * })
 * ```
 */
export function make<
	M extends HttpMethod,
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
>(spec: Route<M, U, H, I, O, E>) {
	const getHeaders = (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			if (!spec.headers) return Headers.empty

			if (typeof spec.headers === "function" && params && "headers" in params)
				return yield* spec.headers(params.headers)

			return spec.headers as Headers.Headers
		}).pipe(
			Effect.flatMap((headers) =>
				Effect.gen(function* () {
					const contentType = Option.getOrUndefined(Headers.get("Content-Type")(headers))

					if (!contentType && Schema.isSchema(spec.body))
						return Headers.set("Content-Type", "application/json")(headers)
					return headers
				})
			)
		) as Effect.Effect<Headers.Headers, InferEffectError<H>, InferEffectRequirements<H>>

	const parseBody = (schema: Schema.Schema<any>, body: Schema.Schema.Type<I>) =>
		Schema.encode(schema)(body).pipe(HttpBody.json)

	const getBody = (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			if (spec.body && "data" in spec.body) return yield* parseBody(spec.body.schema, spec.body.data)

			if (!spec.body || !params || !("body" in params)) return undefined

			if (Schema.isSchema(spec.body)) return yield* parseBody(spec.body, params.body)

			return yield* spec.body(params.body)
		}) as Effect.Effect<
			HttpBody.Uint8Array | undefined,
			InferEffectError<I> | InferEffectError<typeof parseBody>,
			InferEffectRequirements<I> | InferEffectRequirements<typeof parseBody>
		>

	const parseResponse = (schema: Schema.Schema<any>, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const json = yield* response.json

			return yield* schema.pipe(Schema.decodeUnknown)(json)
		})

	const getResponse = (getter: O | undefined, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			if (!getter) return response

			if (Schema.isSchema(getter)) return yield* parseResponse(getter, response)

			return yield* getter(response)
		}) as Effect.Effect<
			InferOutput<O>,
			InferEffectError<O> | InferEffectError<typeof parseResponse>,
			InferEffectRequirements<O> | InferEffectRequirements<typeof parseResponse>
		>

	type InferResponseError<T extends ErrorFunction> = T extends Schema.Schema<any>
		? Schema.Schema.Type<T>
		: T extends (res: HttpClientResponse.HttpClientResponse) => any
		? ReturnType<T>
		: never

	const getError = (getter: E, response: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			if (Schema.isSchema(getter)) {
				const error = yield* parseResponse(getter, response)

				yield* Effect.fail(error)
			} else return yield* Effect.fail(getter(response))
		}) as Effect.Effect<
			never,
			InferResponseError<E> | InferEffectError<typeof parseResponse>,
			InferEffectRequirements<typeof parseResponse>
		>

	return (params: MakerParams<U, H, I>) =>
		Effect.gen(function* () {
			const url =
				typeof spec.url === "function" && params && "url" in params
					? spec.url(params.url)
					: (spec.url as string)

			const headers = yield* getHeaders(params)

			const body = yield* getBody(params)

			const request = HttpClientRequest.make(spec.method)(url).pipe(
				(req) => (body ? HttpClientRequest.setBody(req, body) : req),
				HttpClientRequest.setHeaders(headers)
			)

			const client = (yield* HttpClient.HttpClient).pipe((client) =>
				!spec.filterStatusOk ? client : HttpClient.filterStatusOk(client)
			)

			const response = yield* client.execute(request)

			if (!spec.filterStatusOk && spec.error && (response.status < 200 || response.status >= 300))
				yield* getError(spec.error, response)

			return yield* getResponse(spec.response, response)
		})
}

/**
 * Creates a type-safe GET request handler.
 *
 * GET requests cannot have a body, so the `body` property is omitted from the spec.
 *
 * @template U - The URL function type (string or function)
 * @template H - The headers function type (undefined, Headers instance, or function)
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @param spec - Route specification without method, body, and _tag (method is set to "GET")
 * @returns A function that executes the GET request and returns an Effect
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Simple GET with static URL
 * const getTodos = RestApiClient.get({
 *   url: "/todos",
 *   response: Todo.pipe(Schema.Array)
 * })
 *
 * const program = Effect.gen(function* () {
 *   const todos = yield* getTodos()
 *   return todos
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // GET with dynamic URL and static headers
 * const getTodo = RestApiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   headers: Headers.fromInput({ Accept: "application/json" }),
 *   response: Todo
 * })
 *
 * const program = Effect.gen(function* () {
 *   const todo = yield* getTodo({ url: { id: "123" } })
 *   return todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // GET with custom response handler
 * const getTodoWithMetadata = RestApiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: (res: HttpClientResponse.HttpClientResponse) =>
 *     Effect.gen(function* () {
 *       const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
 *       return { todo, etag: Headers.get("ETag")(res.headers) }
 *     })
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // GET with error handling
 * const getTodo = RestApiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo,
 *   error: ApiError
 * })
 *
 * // If the request fails with a non-OK status, the error schema will parse the response
 * const program = Effect.gen(function* () {
 *   const todo = yield* getTodo({ url: { id: "123" } })
 *   return todo
 * })
 * ```
 */
export const get = <
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
>(
	spec: Omit<Route<"GET", U, H, never, O, E>, "method" | "body" | "_tag">
) => make(new Route({ ...spec, method: "GET" }))

/**
 * Creates a type-safe POST request handler.
 *
 * POST requests can include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
 *
 * @template U - The URL function type (string or function)
 * @template H - The headers function type (undefined, Headers instance, or function)
 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>)
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @param spec - Route specification without method and _tag (method is set to "POST")
 * @returns A function that executes the POST request and returns an Effect
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // POST with static body (encoded as JSON)
 * const createTodo = RestApiClient.post({
 *   url: "/todos",
 *   body: { schema: NewTodo, data: { title: "New Todo", description: "Description" } },
 *   response: Todo
 * })
 *
 * const program = Effect.gen(function* () {
 *   const todo = yield* createTodo({ body: { title: "New Todo", description: "Description" } })
 *   return todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // POST with dynamic URL, headers, and static body (encoded as JSON)
 * const createTodoWithHeaders = RestApiClient.post({
 *   url: (params: { userId: string }) => `/users/${params.userId}/todos`,
 *   headers: (params: { contentType: string }) =>
 *     Effect.succeed(Headers.fromInput({ "Content-Type": params.contentType })),
 *   body: { schema: NewTodo, data: { title: "New Todo", description: "Description" } },
 *   response: Todo
 * })
 *
 * const program = Effect.gen(function* () {
 *   const todo = yield* createTodoWithHeaders({
 *     url: { userId: "123" },
 *     headers: { contentType: "application/json" },
 *     body: { title: "New Todo", description: "Description" }
 *   })
 *   return todo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // POST with error handling and static body (encoded as JSON)
 * const createTodo = RestApiClient.post({
 *   url: "/todos",
 *   body: { schema: NewTodo, data: { title: "New Todo", description: "Description" } },
 *   response: Todo,
 *   error: ApiError
 * })
 *
 * // If the request fails with a non-OK status, the error schema will parse the response
 * const program = Effect.gen(function* () {
 *   const todo = yield* createTodo()
 *   return todo
 * })
 * ```
 */
export const post = <
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
>(
	spec: Omit<Route<"POST", U, H, I, O, E>, "method" | "_tag">
) => make(new Route({ ...spec, method: "POST" }))

/**
 * Creates a type-safe PUT request handler.
 *
 * PUT requests can include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
 * Typically used for updating existing resources.
 *
 * @template U - The URL function type (string or function)
 * @template H - The headers function type (undefined, Headers instance, or function)
 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>)
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @param spec - Route specification without method and _tag (method is set to "PUT")
 * @returns A function that executes the PUT request and returns an Effect
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // PUT with dynamic URL and static body (encoded as JSON)
 * const updateTodo = RestApiClient.put({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   body: { schema: Todo, data: { id: "123", title: "Updated", description: "Updated", completed: true } },
 *   response: Todo
 * })
 *
 * const program = Effect.gen(function* () {
 *   const updatedTodo = yield* updateTodo({ url: { id: "123" } })
 *   return updatedTodo
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // PUT with error handling and static body (encoded as JSON)
 * const updateTodo = RestApiClient.put({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   body: { schema: Todo, data: { id: "123", title: "Updated", description: "Updated", completed: true } },
 *   response: Todo,
 *   error: ApiError
 * })
 *
 * // If the request fails with a non-OK status, the error schema will parse the response
 * const program = Effect.gen(function* () {
 *   const updatedTodo = yield* updateTodo({ url: { id: "123" } })
 *   return updatedTodo
 * })
 * ```
 */
export const put = <
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
>(
	spec: Omit<Route<"PUT", U, H, I, O, E>, "method" | "_tag">
) => make(new Route({ ...spec, method: "PUT" }))

/**
 * Creates a type-safe DELETE request handler.
 *
 * DELETE requests can optionally include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
 * Body usage is uncommon for DELETE requests.
 * When no response schema or function is provided, the raw HttpClientResponse is returned.
 *
 * @template U - The URL function type (string or function)
 * @template H - The headers function type (undefined, Headers instance, or function)
 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>, optional, rarely used for DELETE)
 * @template O - The output/response handler type
 * @template E - The error handler type (Schema or function)
 *
 * @param spec - Route specification without method and _tag (method is set to "DELETE")
 * @returns A function that executes the DELETE request and returns an Effect
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Simple DELETE without response handler
 * const deleteTodo = RestApiClient.del({
 *   url: (params: { id: string }) => `/todos/${params.id}`
 * })
 *
 * const program = Effect.gen(function* () {
 *   const response = yield* deleteTodo({ url: { id: "123" } })
 *   yield* Console.log("Status:", response.status)
 *   return response
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // DELETE with response schema
 * const deleteTodoWithResponse = RestApiClient.del({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Schema.Object({ deleted: Schema.Boolean })
 * })
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* deleteTodoWithResponse({ url: { id: "123" } })
 *   return result
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // DELETE with error handling
 * const deleteTodo = RestApiClient.del({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   error: ApiError
 * })
 *
 * // If the request fails with a non-OK status, the error schema will parse the response
 * const program = Effect.gen(function* () {
 *   const response = yield* deleteTodo({ url: { id: "123" } })
 *   return response
 * })
 * ```
 */
export const del = <
	U extends UrlFunction,
	H extends HeadersFunction = undefined,
	I extends InputFunction = never,
	O extends OutputFunction = never,
	E extends ErrorFunction = never
>(
	spec: Omit<Route<"DELETE", U, H, I, O, E>, "method" | "_tag">
) => make(new Route({ ...spec, method: "DELETE" }))

/**
 * A client instance that provides default headers and error handling for all routes created from it.
 *
 * The `Client` class allows you to define shared configuration (default headers and error handlers)
 * that are automatically applied to all routes created using its methods (`get`, `post`, `put`, `del`).
 *
 * **Key Benefits:**
 * - **Centralized Configuration**: Define error handling and headers once, reuse across all routes
 * - **Type Safety**: Defaults are type-checked and flow through to route methods
 * - **Flexibility**: Routes can override defaults when needed
 * - **Composability**: Create multiple clients for different API services or environments
 *
 * @template DefaultHeaders - The default headers type (undefined, Headers instance, or function)
 * @template DefaultError - The default error handler type (Schema or function)
 *
 * @property headers - Optional default headers applied to all routes. Can be a static Headers instance or a function that returns an Effect<Headers>.
 * @property error - Optional default error handler applied to all routes. Can be a Schema for automatic parsing or a function that transforms the error response.
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 * import { ApiError } from "@/lib/app-error"
 * import { Headers } from "@effect/platform"
 *
 * // Create a client with default error handling
 * const apiClient = new RestApiClient.Client({
 *   error: (res: HttpClientResponse.HttpClientResponse) =>
 *     new ApiError({
 *       method: res.request.method,
 *       endpoint: res.request.url,
 *       statusCode: res.status,
 *       statusText: String(res.status),
 *       message: `Request failed: ${res.status}`,
 *     }),
 * })
 *
 * // All routes created from this client inherit the error handler
 * const getTodo = apiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo,
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 * import { Headers } from "@effect/platform"
 *
 * // Create a client with default headers
 * const apiClient = new RestApiClient.Client({
 *   headers: Headers.fromInput({
 *     Accept: "application/json",
 *     "X-API-Version": "v2",
 *   }),
 * })
 *
 * const getTodos = apiClient.get({
 *   url: "/todos",
 *   response: Todo.pipe(Schema.Array),
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 * import { ApiError } from "@/lib/app-error"
 * import { Headers, Effect } from "@effect/platform"
 *
 * // Create a client with both default headers and error handler
 * const apiClient = new RestApiClient.Client({
 *   headers: (params: { apiVersion: string }) =>
 *     Effect.succeed(
 *       Headers.fromInput({
 *         Accept: "application/json",
 *         "X-API-Version": params.apiVersion,
 *       })
 *     ),
 *   error: (res: HttpClientResponse.HttpClientResponse) =>
 *     new ApiError({
 *       method: res.request.method,
 *       endpoint: res.request.url,
 *       statusCode: res.status,
 *       statusText: String(res.status),
 *       message: `API request failed: ${res.status}`,
 *     }),
 * })
 *
 * // Multiple routes using the same client - all inherit defaults
 * const getTodo = apiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo,
 * })
 *
 * const createTodo = apiClient.post({
 *   url: "/todos",
 *   body: NewTodo, // Schema will be automatically encoded as JSON
 *   response: Todo,
 * })
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Routes can override defaults when needed
 * const apiClient = new RestApiClient.Client({
 *   error: ApiError, // default error handler
 * })
 *
 * // This route uses the default error handler
 * const getTodo = apiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo,
 * })
 *
 * // This route overrides the error handler
 * const getPublicData = apiClient.get({
 *   url: "/public/data",
 *   response: Schema.String,
 *   error: (res: HttpClientResponse.HttpClientResponse) =>
 *     new CustomError({ message: "Public endpoint failed" }),
 * })
 * ```
 */
export class Client<
	DefaultHeaders extends HeadersFunction = undefined,
	DefaultError extends ErrorFunction = never
> extends Data.TaggedClass("@RestApiClient/Client")<{
	headers?: DefaultHeaders
	error?: DefaultError
}> {
	/**
	 * Creates a type-safe GET request handler that inherits the client's default headers and error handler.
	 *
	 * GET requests cannot have a body, so the `body` property is omitted from the spec.
	 * The route will automatically use the client's default headers and error handler unless overridden.
	 *
	 * @template U - The URL function type (string or function)
	 * @template H - The headers function type (defaults to DefaultHeaders from the client)
	 * @template O - The output/response handler type
	 * @template E - The error handler type (defaults to DefaultError from the client)
	 *
	 * @param spec - Route specification without method, body, and _tag (method is set to "GET")
	 * @returns A function that executes the GET request and returns an Effect
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { ApiError } from "@/lib/app-error"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   error: ApiError,
	 * })
	 *
	 * // Inherits the default error handler from the client
	 * const getTodo = apiClient.get({
	 *   url: (params: { id: string }) => `/todos/${params.id}`,
	 *   response: Todo,
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const todo = yield* getTodo({ url: { id: "123" } })
	 *   return todo
	 * })
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { Headers } from "@effect/platform"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   headers: Headers.fromInput({ Accept: "application/json" }),
	 * })
	 *
	 * // Inherits default headers from the client
	 * const getTodos = apiClient.get({
	 *   url: "/todos",
	 *   response: Todo.pipe(Schema.Array),
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const todos = yield* getTodos()
	 *   return todos
	 * })
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   error: ApiError,
	 * })
	 *
	 * // Override the default error handler for this specific route
	 * const getPublicData = apiClient.get({
	 *   url: "/public/data",
	 *   response: Schema.String,
	 *   error: (res: HttpClientResponse.HttpClientResponse) =>
	 *     new CustomError({ message: "Public endpoint failed" }),
	 * })
	 * ```
	 */
	get = <
		U extends UrlFunction,
		H extends HeadersFunction = DefaultHeaders,
		O extends OutputFunction = never,
		E extends ErrorFunction = DefaultError
	>(
		spec: Omit<Route<"GET", U, H, never, O, E>, "method" | "body" | "_tag">
	) =>
		make(
			new Route({
				headers: this.headers,
				error: this.error,
				...spec,
				method: "GET",
			}) as Route<"GET", U, H, never, O, E>
		)

	/**
	 * Creates a type-safe POST request handler that inherits the client's default headers and error handler.
	 *
	 * POST requests can include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
	 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
	 * The route will automatically use the client's default headers and error handler unless overridden.
	 *
	 * @template U - The URL function type (string or function)
	 * @template H - The headers function type (defaults to DefaultHeaders from the client)
	 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>)
	 * @template O - The output/response handler type
	 * @template E - The error handler type (defaults to DefaultError from the client)
	 *
	 * @param spec - Route specification without method and _tag (method is set to "POST")
	 * @returns A function that executes the POST request and returns an Effect
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { ApiError } from "@/lib/app-error"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   error: ApiError,
	 * })
	 *
	 * // Inherits the default error handler from the client, static body encoded as JSON
	 * const createTodo = apiClient.post({
	 *   url: "/todos",
	 *   body: { schema: NewTodo, data: { title: "New Todo", description: "Description" } },
	 *   response: Todo,
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const todo = yield* createTodo()
	 *   return todo
	 * })
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { Headers, Effect } from "@effect/platform"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   headers: (params: { contentType: string }) =>
	 *     Effect.succeed(Headers.fromInput({ "Content-Type": params.contentType })),
	 * })
	 *
	 * // Inherits default dynamic headers from the client, static body encoded as JSON
	 * const createTodo = apiClient.post({
	 *   url: "/todos",
	 *   body: { schema: NewTodo, data: { title: "New Todo", description: "Description" } },
	 *   response: Todo,
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const todo = yield* createTodo({
	 *     headers: { contentType: "application/json" },
	 *   })
	 *   return todo
	 * })
	 * ```
	 */
	post = <
		U extends UrlFunction,
		H extends HeadersFunction = DefaultHeaders,
		I extends InputFunction = never,
		O extends OutputFunction = never,
		E extends ErrorFunction = DefaultError
	>(
		spec: Omit<Route<"POST", U, H, I, O, E>, "method" | "_tag">
	) =>
		make(
			new Route({
				headers: this.headers,
				error: this.error,
				...spec,
				method: "POST",
			}) as Route<"POST", U, H, I, O, E>
		)

	/**
	 * Creates a type-safe PUT request handler that inherits the client's default headers and error handler.
	 *
	 * PUT requests can include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
	 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
	 * Typically used for updating existing resources.
	 * The route will automatically use the client's default headers and error handler unless overridden.
	 *
	 * @template U - The URL function type (string or function)
	 * @template H - The headers function type (defaults to DefaultHeaders from the client)
	 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>)
	 * @template O - The output/response handler type
	 * @template E - The error handler type (defaults to DefaultError from the client)
	 *
	 * @param spec - Route specification without method and _tag (method is set to "PUT")
	 * @returns A function that executes the PUT request and returns an Effect
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { ApiError } from "@/lib/app-error"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   error: ApiError,
	 * })
	 *
	 * // Inherits the default error handler from the client, static body encoded as JSON
	 * const updateTodo = apiClient.put({
	 *   url: (params: { id: string }) => `/todos/${params.id}`,
	 *   body: { schema: Todo, data: { id: "123", title: "Updated", description: "Updated", completed: true } },
	 *   response: Todo,
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const updatedTodo = yield* updateTodo({ url: { id: "123" } })
	 *   return updatedTodo
	 * })
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   headers: Headers.fromInput({ "X-API-Version": "v2" }),
	 * })
	 *
	 * // Inherits default headers from the client, static body encoded as JSON
	 * const updateTodo = apiClient.put({
	 *   url: (params: { id: string }) => `/todos/${params.id}`,
	 *   body: { schema: Todo, data: { id: "123", title: "Updated", description: "Updated", completed: true } },
	 *   response: Todo,
	 * })
	 * ```
	 */
	put = <
		U extends UrlFunction,
		H extends HeadersFunction = DefaultHeaders,
		I extends InputFunction = never,
		O extends OutputFunction = never,
		E extends ErrorFunction = DefaultError
	>(
		spec: Omit<Route<"PUT", U, H, I, O, E>, "method" | "_tag">
	) =>
		make(
			new Route({
				headers: this.headers,
				error: this.error,
				...spec,
				method: "PUT",
			}) as Route<"PUT", U, H, I, O, E>
		)

	/**
	 * Creates a type-safe DELETE request handler that inherits the client's default headers and error handler.
	 *
	 * DELETE requests can optionally include a body handler. When a `Schema.Schema` is provided, it will be automatically encoded as JSON.
	 * Alternatively, a function can be provided to return a custom `HttpBody` (e.g., form data, binary, etc.).
	 * Body usage is uncommon for DELETE requests.
	 * When no response schema or function is provided, the raw HttpClientResponse is returned.
	 * The route will automatically use the client's default headers and error handler unless overridden.
	 *
	 * @template U - The URL function type (string or function)
	 * @template H - The headers function type (defaults to DefaultHeaders from the client)
	 * @template I - The input body handler type (Schema.Schema or function returning Effect<HttpBody>, optional, rarely used for DELETE)
	 * @template O - The output/response handler type
	 * @template E - The error handler type (defaults to DefaultError from the client)
	 *
	 * @param spec - Route specification without method and _tag (method is set to "DELETE")
	 * @returns A function that executes the DELETE request and returns an Effect
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 * import { ApiError } from "@/lib/app-error"
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   error: ApiError,
	 * })
	 *
	 * // Inherits the default error handler from the client
	 * const deleteTodo = apiClient.del({
	 *   url: (params: { id: string }) => `/todos/${params.id}`,
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const response = yield* deleteTodo({ url: { id: "123" } })
	 *   yield* Console.log("Status:", response.status)
	 *   return response
	 * })
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { RestApiClient } from "."
	 *
	 * const apiClient = new RestApiClient.Client({
	 *   headers: Headers.fromInput({ "X-API-Version": "v2" }),
	 * })
	 *
	 * // Inherits default headers from the client
	 * const deleteTodo = apiClient.del({
	 *   url: (params: { id: string }) => `/todos/${params.id}`,
	 *   response: Schema.Object({ deleted: Schema.Boolean }),
	 * })
	 *
	 * const program = Effect.gen(function* () {
	 *   const result = yield* deleteTodo({ url: { id: "123" } })
	 *   return result
	 * })
	 * ```
	 */
	del = <
		U extends UrlFunction,
		H extends HeadersFunction = DefaultHeaders,
		I extends InputFunction = never,
		O extends OutputFunction = never,
		E extends ErrorFunction = DefaultError
	>(
		spec: Omit<Route<"DELETE", U, H, I, O, E>, "method" | "_tag">
	) =>
		make(
			new Route({
				headers: this.headers,
				error: this.error,
				...spec,
				method: "DELETE",
			}) as Route<"DELETE", U, H, I, O, E>
		)
}

// services & layers

/**
 * Configuration tag for the API HTTP client.
 *
 * This Context.Tag provides the base URL and optional access token for API requests.
 * The layer uses this configuration to:
 * - Prepend the base URL to relative URLs (those starting with "/")
 * - Add a Bearer token to requests when an access token is provided
 *
 * @property url - The base URL for the API (e.g., "https://api.example.com")
 * @property accessToken - Optional Bearer token for authentication. If undefined, no authorization header is added.
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Provide the config using a Layer
 * const ApiClientConfigLive = Layer.effect(
 *   RestApiClient.Config,
 *   Effect.gen(function* () {
 *     const url = yield* Config.string("NEXT_PUBLIC_API_URL")
 *     const accessToken = yield* Effect.tryPromise({
 *       try: () => auth().then((session) => session?.accessToken),
 *       catch: (error) => new Error(String(error))
 *     })
 *     return { url, accessToken }
 *   })
 * )
 * ```
 *
 * @example
 * ```ts
 * import { RestApiClient } from "."
 *
 * // Use with the layer
 * const layer = RestApiClient.layer.pipe(
 *   Layer.provide([FetchHttpClient.layer, ApiClientConfigLive])
 * )
 * ```
 */
export class Config extends Context.Tag("@RestApiClient/Config")<
	Config,
	{ url: string; accessToken: string | undefined }
>() {}

/**
 * Layer that provides a configured HttpClient for API requests.
 *
 * This layer creates an HttpClient that:
 * - Automatically prepends the base URL from `RestApiClient.Config` to relative URLs (those starting with "/")
 * - Automatically adds a Bearer token authorization header when `accessToken` is provided in the config
 * - Leaves absolute URLs unchanged
 *
 * Requires:
 * - `RestApiClient.Config` - Configuration with base URL and optional access token
 * - `HttpClient.HttpClient` - Base HTTP client implementation (e.g., `FetchHttpClient.layer`)
 *
 * @returns A Layer that provides `HttpClient.HttpClient` with API-specific configuration applied
 *
 * @example
 * ```ts
 * import { FetchHttpClient } from "@effect/platform"
 * import { RestApiClient } from "."
 *
 * // Provide the API client config
 * const ApiClientConfigLive = Layer.effect(
 *   RestApiClient.Config,
 *   Effect.gen(function* () {
 *     const url = yield* Config.string("NEXT_PUBLIC_API_URL")
 *     const accessToken = yield* Effect.tryPromise({
 *       try: () => auth().then((session) => session?.accessToken),
 *       catch: (error) => new Error(String(error))
 *     })
 *     return { url, accessToken }
 *   })
 * )
 *
 * // Provide the layer with FetchHttpClient and config
 * const apiLayer = RestApiClient.layer.pipe(
 *   Layer.provide([FetchHttpClient.layer, ApiClientConfigLive])
 * )
 *
 * // Use in your application
 * const getTodo = RestApiClient.get({
 *   url: (params: { id: string }) => `/todos/${params.id}`,
 *   response: Todo
 * })
 *
 * const program = Effect.gen(function* () {
 *   const todo = yield* getTodo({ url: { id: "123" } })
 *   return todo
 * })
 *
 * program.pipe(Effect.provide(apiLayer), Effect.runPromise)
 * ```
 *
 * @example
 * ```ts
 * // Relative URLs are automatically prefixed with the base URL
 * // If config.url is "https://api.example.com" and route uses "/todos"
 * // The final URL will be "https://api.example.com/todos"
 *
 * // Absolute URLs are left unchanged
 * // If route uses "https://external-api.com/data"
 * // The final URL remains "https://external-api.com/data"
 * ```
 */
export const layer = Layer.effect(
	HttpClient.HttpClient,
	Effect.gen(function* () {
		const config = yield* Config

		const client = (yield* HttpClient.HttpClient).pipe(
			// set the base url to the request url if it starts with a slash
			HttpClient.mapRequestInput((req) =>
				req.url.startsWith("/") ? req.pipe(HttpClientRequest.setUrl(config.url + req.url)) : req
			),
			// set the bearer token to the request headers if the session is present
			HttpClient.mapRequestInput((req) =>
				config.accessToken ? req.pipe(HttpClientRequest.bearerToken(config.accessToken)) : req
			)
		)

		return client
	})
)
