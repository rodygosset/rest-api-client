# RestApiClient

A type-safe HTTP client library built on [Effect](https://effect.website) that transforms declarative route descriptions into fully type-safe, composable callable functions.

## Value Proposition

Instead of manually constructing HTTP requests with scattered type assertions and error handling, `RestApiClient` lets you **describe your API routes declaratively** and get back **fully type-safe, Effect-based functions** that handle:

-   **Type-safe URL construction** - Dynamic URLs with compile-time parameter validation
-   **Automatic request/response encoding/decoding** - Using Effect Schema for validation
-   **Structured error handling** - Provide an Effect Schema to get back type-safe errors from responses outside of 200 status range.
-   **Dependency injection** - Leverage Effect's Layer system for testability and flexibility

### The Core Idea

```ts
// Describe your route declaratively
const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
	error: ApiError, // a Schema.TaggedError class
})

// Get a fully type-safe function that returns an Effect
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } }) // non 2XX responses will fail this effect with an ApiError
	//    ^? Type: Todo (inferred from schema)
	return todo
})
```

The function signature, parameter types, return types, and error types are all **inferred automatically** from your route description.

## Quick Start

### Installation

```bash
bun add effect @effect/platform
```

### Basic Example

```ts
import { FetchHttpClient, Headers } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { RestApiClient } from "."

// Define your data schemas
class Todo extends Schema.TaggedClass<Todo>("@app/Todo")("Todo", {
	id: Schema.UUID,
	title: Schema.String,
	completed: Schema.Boolean,
}) {}

// Describe your API route
const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Use it in an Effect
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	console.log(todo.title)
})

// Provide the HTTP client layer
program.pipe(Effect.provide(RestApiClient.layer.pipe(Layer.provide(FetchHttpClient.layer))), Effect.runPromise)
```

## Core Concepts

### Route Class

The `Route` class is the foundation - it describes an HTTP endpoint with:

-   **`url`** - Static string or function for dynamic URLs
-   **`method`** - HTTP method (GET, POST, PUT, DELETE, etc.)
-   **`headers`** - Optional static or dynamic headers
-   **`body`** - Optional request body schema
-   **`response`** - Optional response handler (Schema or function)
-   **`error`** - Optional error handler (Schema or function)
-   **`filterStatusOk`** - Whether to filter non-OK status codes (default: `false`)

### Creating Route Functions

Use the provided convenience methods

```ts
const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})
```

The convenience methods (`get`, `post`, `put`, `del`) automatically set the HTTP method.

## Common Use Cases

### 1. Simple GET Request

```ts
const getTodos = RestApiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

const program = Effect.gen(function* () {
	const todos = yield* getTodos()
	return todos
})
```

### 2. POST with Body

```ts
const NewTodo = Todo.pipe(Schema.omit("id", "completed", "_tag"))

const createTodo = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

const program = Effect.gen(function* () {
	const todo = yield* createTodo({
		body: { title: "New Todo", description: "Description" },
	})
	return todo
})
```

### 3. Dynamic URLs

```ts
const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// TypeScript ensures you provide the required parameters
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	return todo
})
```

You can also include optional parameters:

```ts
const getTodo = RestApiClient.get({
	url: (params: { id: string; version?: number }) =>
		`/todos/${params.id}${params.version ? `?version=${params.version}` : ""}`,
	response: Todo,
})

const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123", version: 2 } })
	return todo
})
```

### 4. Static Headers

```ts
const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-Custom-Header": "static-value",
	}),
	response: Todo,
})
```

### 5. Dynamic Headers

Headers can be functions that return `Effect<Headers>`:

```ts
const createTodo = RestApiClient.post({
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
		headers: { contentType: "application/json", apiVersion: "v2" },
	})
	return todo
})
```

### 6. Response Schemas

Response schemas automatically parse and validate JSON responses:

```ts
const getTodos = RestApiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Type is automatically inferred as Array<Todo>
const program = Effect.gen(function* () {
	const todos = yield* getTodos()
	return todos
})
```

### 7. Error Handling

Error handling is triggered when `filterStatusOk` is `false` (the default) and the response status is outside the 200-299 range.

**With Error Schema:**

```ts
import { ApiError } from "@/lib/app-error"

const createTodo = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: ApiError, // Automatically parses error response
})

// If the request fails, Effect will fail with the parsed ApiError
const program = Effect.gen(function* () {
	const todo = yield* createTodo({ body: { title: "New Todo" } })
	return todo
})
```

**With Custom Error Function:**

```ts
const createTodo = RestApiClient.post({
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
```

**Handling Errors:**

When errors occur, they can be handled using the `_tag` property or `catchTag`:

```ts
const program = Effect.gen(function* () {
	const todo = yield* createTodo({ body: { title: "New Todo" } })
	return todo
})

// Using _tag property in catchAll
program.pipe(
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			if (error._tag === "ApiError") yield* Console.error("API Error:", error.statusCode, error.message)

			return "Oh no !"
		})
	),
	Effect.runPromise
)

// Or using catchTag (more idiomatic for tagged errors)
program.pipe(
	Effect.catchTag("ApiError", (error) =>
		Effect.gen(function* () {
			yield* Console.error("API Error:", error.statusCode, error.message)
			return "Oh no !"
		})
	),
	Effect.runPromise
)
```

### 8. Custom Body Functions

While body schemas are automatically encoded as JSON, you can also provide a function that returns an `Effect<HttpBody>` for custom body encoding. This is useful for form data, text, binary, or other non-JSON payloads.

**When to use body functions vs schemas:**

-   **Use a Schema** when sending JSON data (most common case)
-   **Use a function** when you need form data, text, binary, or other custom encoding

**Form Data Example:**

```ts
import { HttpBody } from "@effect/platform"
import { Effect, Schema } from "effect"

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

const program = Effect.gen(function* () {
	const file = new File(["content"], "test.txt", { type: "text/plain" })
	const result = yield* uploadFile({
		body: { file, description: "Test file upload" },
	})
	return result
})
```

**Text Body Example:**

```ts
import { HttpBody } from "@effect/platform"
import { Effect, Schema } from "effect"

const sendMessage = RestApiClient.post({
	url: "/messages",
	body: (params: { message: string }) => Effect.succeed(HttpBody.text(params.message)),
	response: Schema.Struct({ id: Schema.String, delivered: Schema.Boolean }),
})

const program = Effect.gen(function* () {
	const result = yield* sendMessage({
		body: { message: "Hello, world!" },
	})
	return result
})
```

**Binary Body Example:**

```ts
import { HttpBody } from "@effect/platform"
import { Effect, Schema } from "effect"

const uploadBinary = RestApiClient.post({
	url: "/binary",
	body: (params: { data: Uint8Array; contentType: string }) => Effect.succeed(HttpBody.uint8Array(params.data)),
	response: Schema.Struct({ id: Schema.String }),
})

const program = Effect.gen(function* () {
	const binaryData = new Uint8Array([1, 2, 3, 4, 5])
	const result = yield* uploadBinary({
		body: { data: binaryData, contentType: "application/octet-stream" },
	})
	return result
})
```

## Advanced Patterns

### Custom Response Handlers

For complex response processing, use a function that returns an `Effect`:

```ts
const getTodoWithMetadata = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
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

const program = Effect.gen(function* () {
	const { todo, metadata } = yield* getTodoWithMetadata({ url: { id: "123" } })
	return { todo, metadata }
})
```

### Binary Response Handling

For non-JSON responses (like PDFs, images, etc.):

```ts
const getDocument = RestApiClient.get({
	url: (params: { id: string }) => `/documents/${params.id}`,
	headers: Headers.fromInput({ Accept: "application/octet-stream" }),
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const contentType = Headers.get("Content-Type")(res.headers).pipe(
				Option.getOrElse(() => "application/octet-stream")
			)

			return {
				contentType,
				body: res.stream,
			}
		}),
})

const program = Effect.gen(function* () {
	const { contentType, body } = yield* getDocument({
		url: { id: "123" },
	})
	return { contentType, body }
})
```

### Effect-Based Composition

One of the most powerful features is composing multiple API calls using Effect's composition:

```ts
const getTodos = RestApiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

const getTodo = RestApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

const createTodo = RestApiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: ApiError,
})

// Compose multiple API calls
const program = Effect.gen(function* () {
	// Fetch all todos
	const todos = yield* getTodos()

	// Get a specific todo
	const todo = yield* getTodo({ url: { id: todos[0].id } })

	// Create a new todo
	const newTodo = yield* createTodo({
		body: { title: "New", description: "Description" },
	})

	return { todos, todo, newTodo }
})

// All errors are automatically propagated through Effect's error channel
program.pipe(
	Effect.provide(layer),
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			// Handle all errors in one place using _tag property
			if (error._tag === "ApiError") yield* Console.error("API Error:", error.statusCode)

			return "Oh no!"
		})
	),
	Effect.runPromise
)
```

**Alternative: Using `catchTag` (more idiomatic for tagged errors):**

```ts
// catchTag is more type-safe and idiomatic for tagged errors
program.pipe(
	Effect.provide(layer),
	Effect.catchTag("ApiError", (error) =>
		Effect.gen(function* () {
			yield* Console.error("API Error:", error.statusCode)
			return "Oh no!"
		})
	),
	Effect.runPromise
)
```

### Dependency Injection with Layers

The library leverages Effect's Layer system for dependency injection, making your code highly testable:

```ts
import { FetchHttpClient } from "@effect/platform"
import { Config, Effect, Layer } from "effect"
import { auth } from "@/auth"

// Using Next.js + Auth.js for example
const ApiClientConfigLive = Layer.effect(
	RestApiClient.Config,
	Effect.gen(function* () {
		// Read from environment variables
		const url = yield* Config.string("NEXT_PUBLIC_API_URL")

		// Get access token (could be async, from cache, etc.)
		const accessToken = yield* Effect.tryPromise({
			try: () => auth().then((session) => session?.accessToken),
			catch: (error) => new Error(String(error)),
		})

		return { url, accessToken }
	})
)

// Compose all layers
const apiLayer = RestApiClient.layer.pipe(Layer.provide([FetchHttpClient.layer, ApiClientConfigLive]))

// Use in your application
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	return todo
})

program.pipe(Effect.provide(apiLayer), Effect.runPromise)
```

**Benefits of this approach:**

1. **Testability** - Easily swap implementations:

```ts
// In tests, provide a mock layer
const mockLayer = RestApiClient.layer.pipe(Layer.provide(MockHttpClient.layer))
```

2. **Flexibility** - Configuration can come from anywhere (env vars, config files, remote services)

3. **Composability** - Layers can be composed and reused across your application

### Using the Client Class for Shared Configuration

The `Client` class allows you to define default headers and error handling that are automatically applied to all routes created from that client instance.

**Why use the Client class?**

-   **Avoid Repetition**: Define error handlers and headers once, reuse across all routes
-   **Consistency**: Ensure all routes use the same error handling strategy and headers
-   **Centralized Configuration**: Update error handling or headers in one place
-   **Type Safety**: Defaults are type-checked and flow through to route methods
-   **Flexibility**: Routes can override defaults when needed

#### Creating a Client with Default Error Handler

```ts
import { RestApiClient } from "."
import { ApiError } from "@/lib/app-error"
import { HttpClientResponse } from "@effect/platform"

// Create a client with a default error handler
const apiClient = new RestApiClient.Client({
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `Request failed with status ${res.status}`,
		}),
})

// All routes created from this client inherit the error handler
const getTodo = apiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})
// Type inference:
// getTodo returns an Effect that may fail with ApiError:
//
//    ^? Type: (input: { url: { id: string } }) => Effect<Todo, ApiError | ..., HttpClient>
//

const createTodo = apiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

// No need to specify error handler for each route
const program = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	const newTodo = yield* createTodo({
		body: { title: "New Todo", description: "Description" },
	})
	return { todo, newTodo }
})
```

#### Creating a Client with Default Headers

```ts
import { RestApiClient } from "."
import { Headers } from "@effect/platform"

// Create a client with default static headers
const apiClient = new RestApiClient.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-API-Version": "v2",
		"X-Client-Type": "web",
	}),
})

const getTodos = apiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Headers are automatically included in all requests
const todos = yield * getTodos()
```

#### Creating a Client with Dynamic Default Headers

```ts
import { RestApiClient } from "."
import { Headers, Effect } from "@effect/platform"

// Create a client with default dynamic headers
const apiClient = new RestApiClient.Client({
	headers: (params: { apiVersion: string; clientId: string }) =>
		Effect.succeed(
			Headers.fromInput({
				Accept: "application/json",
				"X-API-Version": params.apiVersion,
				"X-Client-ID": params.clientId,
			})
		),
})

const getTodos = apiClient.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Provide header parameters when calling the route
const todos = yield * getTodos({ headers: { apiVersion: "v2", clientId: "web-app" } })
```

#### Creating a Client with Both Default Headers and Error Handler

This is the most common pattern - centralized configuration for consistency:

```ts
import { RestApiClient } from "."
import { ApiError } from "@/lib/app-error"
import { Headers, HttpClientResponse } from "@effect/platform"

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
const getTodo = apiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

const createTodo = apiClient.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

const updateTodo = apiClient.put({
	url: (params: { id: string }) => `/todos/${params.id}`,
	body: Todo,
	response: Todo,
})

const deleteTodo = apiClient.del({
	url: (params: { id: string }) => `/todos/${params.id}`,
})
```

#### Overriding Defaults Per Route

Sometimes a specific route needs different error handling or headers:

```ts
import { RestApiClient } from "."
import { ApiError } from "@/lib/app-error"

const apiClient = new RestApiClient.Client({
	error: ApiError, // default error handler
})

// This route uses the default error handler
const getTodo = apiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// This route overrides the error handler
const getPublicData = apiClient.get({
	url: "/public/data",
	response: Schema.String,
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `Public endpoint failed: ${res.status}`,
		}),
})
```

#### Real-World Example: Multiple API Services

You can create multiple clients for different API services:

```ts
import { RestApiClient } from "."
import { ApiError } from "@/lib/app-error"
import { Headers } from "@effect/platform"

// Main API client
const mainApiClient = new RestApiClient.Client({
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
			message: `Main API failed: ${res.status}`,
		}),
})

// External API client with different configuration
const externalApiClient = new RestApiClient.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-Source": "web-app",
	}),
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `External API failed: ${res.status}`,
		}),
})

// Routes for main API
const getTodo = mainApiClient.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Routes for external API
const getExternalData = externalApiClient.get({
	url: "/external/data",
	response: Schema.String,
})
```

### Automatic Base URL and Authentication

The `RestApiClient.layer` automatically:

-   **Prepends base URL** to relative URLs (those starting with `/`)
-   **Adds Bearer token** to requests when `accessToken` is provided
-   **Leaves absolute URLs unchanged**

```ts
// If config.url is "https://api.example.com"
// and your route uses "/todos"
// The final URL will be "https://api.example.com/todos"

// But if your route uses "https://external-api.com/data"
// The URL remains unchanged
```

### Type-Safe Literal Arrays

You can use Schema literals for type-safe enums:

```ts
import { Schema } from "effect"

const priorities = ["low", "medium", "high", "urgent"] as const

const setTodoPriorities = RestApiClient.post({
	url: (params: { todoId: string }) => `/todos/${params.todoId}/priorities`,
	body: Schema.Array(Schema.Literal(...priorities)),
	response: Schema.Array(Schema.Literal(...priorities)),
})

// TypeScript ensures only valid priority values
const program = Effect.gen(function* () {
	const result = yield* setTodoPriorities({
		url: { todoId: "123" },
		body: ["high", "urgent"], // ✅ Valid
		// body: ["invalid"] // ❌ Type error
	})
	return result
})
```

## Why Effect?

Effect provides powerful inversion of control through its Effect type and Layer system:

-   **Explicit dependencies** - All dependencies are visible in the type signature
-   **Testability** - Swap implementations easily with Layers
-   **Composability** - Build complex workflows from simple pieces
-   **Error handling** - Structured error handling with the error channel
-   **Resource safety** - Automatic cleanup and error recovery
-   **Observability** - Built-in tracing and monitoring

This makes `RestApiClient` not just a type-safe HTTP client, but a foundation for building robust, maintainable applications.

## See Also

-   [Effect Documentation](https://effect.website)
-   [Effect Schema](https://effect.website/docs/schema/introduction/)
