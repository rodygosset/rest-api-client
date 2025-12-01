import { FetchHttpClient, Headers, HttpBody, HttpClientResponse } from "@effect/platform"
import { Config, Console, Effect, Layer, Schema } from "effect"
import { RestApiClient } from "."

// simply describe the api endpoints and their responses (declaratively)
// get back a type-safe function to create the request and send it

export class Todo extends Schema.TaggedClass<Todo>("@app/schemas/Todo")("Todo", {
	id: Schema.UUID,
	title: Schema.String,
	description: Schema.String,
	completed: Schema.Boolean,
}) {}

const getTodos = RestApiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

const NewTodo = Todo.pipe(Schema.omit("id", "completed", "_tag"))

// Error handling can be specified using an error schema
// When filterStatusOk is false (default) and the response status is outside 200-299,
// the error schema will parse the error response and the Effect will fail with the parsed error

export class ApiError extends Schema.TaggedError<ApiError>()("@app/errors/ApiError", {
	method: Schema.String,
	endpoint: Schema.String,
	statusCode: Schema.Number,
	statusText: Schema.String,
	requestBody: Schema.Unknown.pipe(Schema.optional),
	message: Schema.String.pipe(Schema.optional),
}) {}

const createTodo = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: ApiError,
})

const updateTodo = RestApiClient.put({
	url: (params: { id: string }) => `/todos/${params.id}`,
	body: Todo,
	response: Todo,
})

// when no response schema or function is provided, the response is returned as is
const deleteTodo = RestApiClient.del({
	url: (params: { id: string }) => `/todos/${params.id}`,
})

// URL can be a function that takes a record parameter and returns a string
// This allows dynamic URL construction based on parameters
const getTodoWithUrlFunction = RestApiClient.get({
	url: (params: { id: string; version?: number }) =>
		`/todos/${params.id}${params.version ? `?version=${params.version}` : ""}`,
	response: Todo,
})

// Headers can be a static Headers instance
// Useful when headers don't depend on request parameters
const getTodoWithStaticHeaders = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-Custom-Header": "static-value",
	}),
	response: Todo,
})

// Headers can be a function that takes a record parameter and returns an Effect<Headers>
// This allows dynamic header construction based on request parameters
const createTodoWithDynamicHeaders = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	headers: (params: { contentType: string; apiVersion: string }) =>
		Effect.succeed(
			Headers.fromInput({
				"Content-Type": params.contentType,
				"X-API-Version": params.apiVersion,
			})
		),
	response: Todo,
})

// Response can be a function that takes the received HttpClientResponse and returns an Effect
// This allows custom response processing, transformation, or extraction of specific data
const getTodoWithCustomResponse = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
			// Extract additional metadata from response headers
			const etag = Headers.get("ETag")(res.headers)
			const lastModified = Headers.get("Last-Modified")(res.headers)

			return {
				todo,
				metadata: {
					etag,
					lastModified,
					status: res.status,
				},
			}
		}),
})

// Error can also be a function that takes the HttpClientResponse and returns an error value
// This allows custom error transformation based on the response
const createTodoWithCustomError = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: "POST",
			endpoint: "/todos",
			statusCode: res.status,
			statusText: String(res.status),
			message: `Failed to create todo: ${res.status}`,
		}),
})

// Body can be a function that takes a record parameter and returns an Effect<HttpBody>
// This allows custom body encoding (e.g., form data, text, binary, etc.)
// When a Schema is provided, the body is automatically encoded as JSON
// When a function is provided, you have full control over the body encoding

// Example: Form data upload
const uploadFile = RestApiClient.post({
	url: "/upload",
	body: (params: { file: File; description: string }) =>
		Effect.gen(function* () {
			const formData = new FormData()
			formData.append("file", params.file)
			formData.append("description", params.description)
			return HttpBody.formData(formData)
		}),
	response: Schema.Struct({ id: Schema.String, url: Schema.String }),
})

// Example: Text body
const sendMessage = RestApiClient.post({
	url: "/messages",
	body: (params: { message: string }) => Effect.succeed(HttpBody.text(params.message)),
	response: Schema.Struct({ id: Schema.String, delivered: Schema.Boolean }),
})

// Example: Binary/uint8Array body
const uploadBinary = RestApiClient.post({
	url: "/binary",
	body: (params: { data: Uint8Array; contentType: string }) => Effect.succeed(HttpBody.uint8Array(params.data)),
	response: Schema.Struct({ id: Schema.String }),
})

const test = Effect.gen(function* () {
	const todos = yield* getTodos()

	const todo = yield* getTodo({ url: { id: "123" } })

	const newTodo = yield* createTodo({
		body: { title: "New Todo", description: "New Todo Description" },
	})

	const updatedTodo = yield* updateTodo({
		url: { id: newTodo.id },
		body: { ...newTodo, completed: true },
	})

	const response = yield* deleteTodo({ url: { id: newTodo.id } })

	yield* Console.log("response status: ", response.status)

	// Example: URL as function with parameters
	const todoWithVersion = yield* getTodoWithUrlFunction({
		url: { id: "123", version: 2 },
	})

	// Example: Static headers
	const todoWithStaticHeaders = yield* getTodoWithStaticHeaders({
		url: { id: "123" },
	})

	// Example: Dynamic headers
	const todoWithDynamicHeaders = yield* createTodoWithDynamicHeaders({
		body: { title: "New Todo", description: "Description" },
		headers: { contentType: "application/json", apiVersion: "v2" },
	})

	// Example: Custom response processing
	const { todo: processedTodo, metadata } = yield* getTodoWithCustomResponse({
		url: { id: "123" },
	})
	yield* Console.log("Processed todo with metadata: ", {
		processedTodo,
		metadata,
	})

	// Example: Form data upload
	const file = new File(["content"], "test.txt", { type: "text/plain" })
	const uploadResult = yield* uploadFile({
		body: { file, description: "Test file upload" },
	})
	yield* Console.log("Upload result: ", uploadResult)

	// Example: Text body
	const messageResult = yield* sendMessage({
		body: { message: "Hello, world!" },
	})
	yield* Console.log("Message result: ", messageResult)

	// Example: Binary body
	const binaryData = new Uint8Array([1, 2, 3, 4, 5])
	const binaryResult = yield* uploadBinary({
		body: { data: binaryData, contentType: "application/octet-stream" },
	})
	yield* Console.log("Binary upload result: ", binaryResult)
})

// ============================================================================
// Client Class Examples
// ============================================================================
// The Client class allows you to define default error handling and headers
// that are automatically applied to all routes created from that client instance.
// This reduces repetition and ensures consistency across your API endpoints.

class User extends Schema.TaggedClass<User>("@app/schemas/User")("User", {
	id: Schema.UUID,
	name: Schema.String,
	email: Schema.String,
}) {}

// Example 1: Client with default error handler only
// All routes created from this client will use the same error handler
const clientWithDefaultError = new RestApiClient.Client({
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `Request failed with status ${res.status}`,
		}),
})

// Routes inherit the default error handler - no need to specify it per route
const getUser = clientWithDefaultError.get({
	url: (params: { id: string }) => `/users/${params.id}`,
	response: User,
})

const getUsers = clientWithDefaultError.get({
	url: "/users",
	response: User.pipe(Schema.Array),
})

// Example 2: Client with default static headers
// Useful for API versioning or consistent headers across all requests
const clientWithDefaultHeaders = new RestApiClient.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-API-Version": "v2",
		"X-Client-Type": "web",
	}),
})

const getTodosWithDefaultHeaders = clientWithDefaultHeaders.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Example 3: Client with default dynamic headers
// Headers can be computed based on request parameters
const clientWithDynamicHeaders = new RestApiClient.Client({
	headers: (params: { apiVersion: string; clientId: string }) =>
		Effect.succeed(
			Headers.fromInput({
				Accept: "application/json",
				"X-API-Version": params.apiVersion,
				"X-Client-ID": params.clientId,
			})
		),
})

const getTodosWithDynamicHeaders = clientWithDynamicHeaders.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Example 4: Client with both default headers and error handler
// This is the most common pattern - centralized configuration for consistency
const apiClient = new RestApiClient.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-API-Version": "v1",
	}),
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `API request failed: ${res.request.method} ${res.request.url} returned ${res.status}`,
		}),
})

// Multiple routes using the same client - all inherit defaults
const getTodoFromClient = apiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

const createTodoFromClient = apiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

const updateTodoFromClient = apiClient.put({
	url: (params: { id: string }) => `/todos/${params.id}`,
	body: Todo,
	response: Todo,
})

const deleteTodoFromClient = apiClient.del({
	url: (params: { id: string }) => `/todos/${params.id}`,
})

// Example 5: Overriding defaults per route
// Sometimes a specific route needs different error handling or headers
const getPublicData = apiClient.get({
	url: "/public/data",
	response: Schema.String,
	// Override the default error handler for this specific route
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `Public endpoint failed: ${res.status}`,
		}),
})

const initialTodo = new Todo({
	id: "example-id",
	title: "Example Todo",
	description: "Example Description",
	completed: false,
})

const updateTodoStatic = Effect.gen(function* () {
	const updatedTodo = yield* apiClient.put({
		url: `/todos/${initialTodo.id}`,
		body: RestApiClient.body(Todo, initialTodo),
		response: Todo,
	})()

	return updatedTodo
})

// Example 6: Complete example with Client and Layer
const clientExample = Effect.gen(function* () {
	// All routes created from apiClient inherit the default error handler and headers
	const todo = yield* getTodoFromClient({ url: { id: "123" } })
	const todos = yield* getTodosWithDefaultHeaders()
	const publicData = yield* getPublicData()

	return { todo, todos, publicData }
})

// ============================================================================
// Layer Configuration
// ============================================================================
// Provide an implementation for the config tag
// It needs to return the base url and an access token (can be undefined) for the api

class AuthError extends Schema.TaggedClass<AuthError>("@app/errors/AuthError")("AuthError", {
	message: Schema.String,
}) {}

const ApiClientConfigLive = Layer.effect(
	RestApiClient.Config,
	Effect.gen(function* () {
		// get the base url for the api, for example from the environment variables
		const url = yield* Config.string("NEXT_PUBLIC_API_URL")

		// get the access token for the api, for example from next-auth
		const accessToken = yield* Effect.tryPromise({
			try: async () => "ey...." as const,
			catch: (error) => new AuthError({ message: String(error) }),
		})

		return { url, accessToken }
	})
)

// provide the api client layer with the fetch http client and the api client config
const layer = RestApiClient.layer.pipe(Layer.provide([FetchHttpClient.layer, ApiClientConfigLive]))

// Run examples with the layer
test.pipe(
	Effect.provide(layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)

// Example: Using Client with layer
clientExample.pipe(
	Effect.provide(layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
