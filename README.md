# RestApiClient

A type-safe HTTP client built on [Effect](https://effect.website) that transforms declarative route descriptions into fully type-safe, composable Effect functions. Describe your API routes once, get back type-safe functions that handle URL construction, request/response encoding, and error handling automatically.

## Why

Instead of manually constructing HTTP requests with scattered type assertions, `RestApiClient` lets you **describe your API routes declaratively** and get back **fully type-safe Effect functions**:

```ts
const getTodo = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
	error: ApiError,
})

// Fully typed: Effect<Todo, ApiError | ..., HttpClient>
getTodo({ url: { id: "123" } }).pipe(Effect.tap((todo) => Effect.log(`Got todo: ${todo}`)))
```

## Quick Start

### Installation

```bash
bun add effect @effect/platform
```

### Basic Example

```ts
import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { Client } from "rest-api-client"

// Define your data schemas
class Todo extends Schema.Class<Todo>("@app/Todo")({
	id: Schema.UUID,
	title: Schema.String,
	completed: Schema.Boolean,
}) {}

// Describe your API route
const getTodo = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Use it in an Effect
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	return todo
})

// Provide the HTTP client layer
program.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
```

See the [`examples`](./examples) folder for more complete examples.

## Common Use Cases

### Static Routes

```ts
const getTodos = Client.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

const program = Effect.gen(function* () {
	const todos = yield* getTodos()
	return todos
})
```

### Dynamic URLs

```ts
const getTodo = Client.get({
	url: (params: { id: string; version?: number }) =>
		`/todos/${params.id}${params.version ? `?version=${params.version}` : ""}`,
	response: Todo,
})

const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123", version: 2 } })
	return todo
})
```

### Request Bodies

**Schema-based (JSON):**

```ts
const NewTodo = Todo.pipe(Schema.omit("id", "completed"))

const createTodo = Client.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

const program = Effect.gen(function* () {
	const todo = yield* createTodo({ body: { title: "New Todo" } })
	return todo
})
```

**Custom encoding (FormData):**

```ts
import { HttpBody } from "@effect/platform"

const uploadFile = Client.post({
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

const program = Effect.gen(function* () {
	const result = yield* uploadFile({
		body: { file: new File([], "test.txt"), description: "Test" },
	})
	return result
})
```

### Response Parsing

**Schema-based:**

```ts
const getTodo = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})
```

**Custom function:**

```ts
import { HttpClientResponse } from "@effect/platform"

const getTodoWithMetadata = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
			const etag = Headers.get("ETag")(res.headers)
			return { todo, etag, status: res.status }
		}),
})
```

### Error Handling

**Schema-based:**

```ts
class ApiError extends Schema.TaggedError<ApiError>()("@app/errors/ApiError", {
	message: Schema.String,
	statusCode: Schema.Number,
}) {}

const createTodo = Client.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: ApiError,
})

// Errors are automatically parsed and typed
const program = Effect.gen(function* () {
	const todo = yield* createTodo({ body: { title: "New Todo" } })
	return todo
})

program.pipe(
	Effect.catchTag("ApiError", (error) =>
		Effect.gen(function* () {
			yield* Console.error("API Error:", error.statusCode, error.message)
			return "Failed"
		})
	),
	Effect.runPromise
)
```

**Custom function:**

```ts
const createTodo = Client.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: (res: HttpClientResponse.HttpClientResponse) => `Request failed: ${res.status}`,
})
```

### Headers

**Static:**

```ts
import { Headers } from "@effect/platform"

const getTodo = Client.get({
	url: "/todos/123",
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-Custom-Header": "value",
	}),
	response: Todo,
})
```

**Dynamic:**

```ts
const createTodo = Client.post({
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

const program = Effect.gen(function* () {
	const todo = yield* createTodo({
		body: { title: "New Todo" },
		headers: { contentType: "application/json", apiVersion: "v1" },
	})
	return todo
})
```

## Core Concepts

### Route Specification

A route is described by:

-   **`url`** - Static string or function for dynamic URLs
-   **`method`** - HTTP method (GET, POST, PUT, DELETE)
-   **`headers`** - Optional static or dynamic headers
-   **`body`** - Optional request body (Schema or custom function)
-   **`response`** - Optional response parser (Schema or custom function)
-   **`error`** - Optional error parser (Schema or custom function)

### Type Inference

All types are inferred automatically:

-   Parameter types from URL/headers/body functions
-   Return types from response schemas
-   Error types from error schemas
-   Effect requirements from dependencies

### Effect-Based Execution

Routes return `Effect` values that can be:

-   Composed with `Effect.gen`
-   Handled with `catchAll` or `catchTag`
-   Provided dependencies via Layers
-   Tested by swapping implementations

### Layer System

Configuration is provided via Effect Layers:

```ts
import { Config, Layer } from "effect"

const ApiClientConfigLive = Layer.effect(
	Client.Config,
	Effect.gen(function* () {
		const url = yield* Config.string("API_URL")
		const accessToken = yield* Effect.tryPromise({
			try: async () => "token...",
			catch: (error) => new Error(String(error)),
		})
		return { url, accessToken }
	})
)

const layer = Client.layer.pipe(Layer.provide([FetchHttpClient.layer, ApiClientConfigLive]))

program.pipe(Effect.provide(layer), Effect.runPromise)
```

The layer automatically:

-   Prepends base URL to relative URLs (those starting with `/`)
-   Adds Bearer token when `accessToken` is provided
-   Leaves absolute URLs unchanged

## Features

### Client Class

Create a client with default headers and error handlers:

```ts
import { Headers, HttpClientResponse } from "@effect/platform"

const apiClient = new Client.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-API-Version": "v1",
	}),
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			message: `Request failed: ${res.status}`,
			statusCode: res.status,
		}),
})

// All routes inherit defaults
const getTodo = apiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Override defaults per route if needed
const getPublicData = apiClient.get({
	url: "/public/data",
	response: Schema.String,
	error: (res) => `Public endpoint failed: ${res.status}`,
})
```

### Static Body Values

Use `Input.value()` for static body values:

```ts
import { Input } from "rest-api-client"

const updateTodo = Client.put({
	url: "/todos/123",
	body: Input.value(Todo, {
		id: "123",
		title: "Updated Todo",
		completed: true,
	}),
	response: Todo,
})

const program = Effect.gen(function* () {
	const updated = yield* updateTodo()
	return updated
})
```

### Custom Body Encoding

Use functions for non-JSON bodies:

```ts
// Form data
const uploadFile = Client.post({
	url: "/upload",
	body: (params: { file: File }) =>
		Effect.gen(function* () {
			const formData = new FormData()
			formData.append("file", params.file)
			return HttpBody.formData(formData)
		}),
	response: Schema.Struct({ id: Schema.String }),
})

// Text
const sendMessage = Client.post({
	url: "/messages",
	body: (params: { message: string }) => Effect.succeed(HttpBody.text(params.message)),
	response: Schema.Struct({ id: Schema.String }),
})

// Binary
const uploadBinary = Client.post({
	url: "/binary",
	body: (params: { data: Uint8Array }) => Effect.succeed(HttpBody.uint8Array(params.data)),
	response: Schema.Struct({ id: Schema.String }),
})
```

### Custom Response Handlers

Extract metadata or process responses:

```ts
const getTodoWithMetadata = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
			const etag = Headers.get("ETag")(res.headers)
			return { todo, etag, status: res.status }
		}),
})
```

## Why Effect?

-   **Explicit dependencies** - All dependencies visible in type signatures
-   **Testability** - Swap implementations easily with Layers
-   **Composability** - Build complex workflows from simple pieces
-   **Structured error handling** - Type-safe errors via the error channel

## See Also

-   [Effect Documentation](https://effect.website)
-   [Effect Schema](https://effect.website/docs/schema/introduction/)
-   [Examples](./examples) - Complete working examples
