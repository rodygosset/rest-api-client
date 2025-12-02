import { FetchHttpClient, Headers, HttpClientResponse, HttpBody } from "@effect/platform"
import { Console, Effect, Schema } from "effect"
import { Client } from "../src"
import { NewTodo, Todo } from "./common"

// Reusable dynamic examples: parameters make routes reusable

// URL as function - dynamic route construction
// Parameter type inferred: { url: { id: string } }
// Return type inferred: Effect<Todo, ...>
const getTodo = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// URL function with optional query params
const getTodoWithVersion = Client.get({
	url: (params: { id: string; version?: number }) =>
		`/todos/${params.id}${params.version ? `?version=${params.version}` : ""}`,
	response: Todo,
})

// Headers as function - dynamic header construction
// Parameter type inferred: { headers: { contentType: string; apiVersion: string } }
// Errors from headers fn are inferred in Effect error type
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

// Body as function - custom body encoding
// Parameter type inferred: { body: { file: File; description: string } }
// Errors from body fn are inferred in Effect error type
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

// Response as function - custom response processing
// Return type inferred from response fn: Effect<{ todo: Todo; etag: Option<string>; status: number }, ...>
// Errors from response fn are inferred in Effect error type
const getTodoWithMetadata = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: (res: HttpClientResponse.HttpClientResponse) =>
		Effect.gen(function* () {
			const todo = yield* res.json.pipe(Schema.decodeUnknown(Todo))
			const etag = Headers.get("ETag")(res.headers)
			return { todo, etag, status: res.status }
		}),
})

// Error as function - custom error transformation
// Error type inferred from error fn return: string
const createTodoWithCustomError = Client.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: (res: HttpClientResponse.HttpClientResponse) => `Request failed: ${res.status}`,
})

const example = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	yield* Console.log("Todo:", todo)

	const todoWithVersion = yield* getTodoWithVersion({ url: { id: "123", version: 2 } })
	yield* Console.log("Todo with version:", todoWithVersion)

	const created = yield* createTodo({
		body: { title: "New Todo", description: "Description" },
		headers: { contentType: "application/json", apiVersion: "v1" },
	})
	yield* Console.log("Created:", created)

	const uploaded = yield* uploadFile({
		body: { file: new File([], "test.txt"), description: "Test file" },
	})
	yield* Console.log("Uploaded:", uploaded)

	const todoWithMetadata = yield* getTodoWithMetadata({ url: { id: "123" } })
	yield* Console.log("Todo with metadata:", todoWithMetadata)

	const createdWithCustomError = yield* createTodoWithCustomError({
		body: { title: "New Todo", description: "Description" },
	})
	yield* Console.log("Created with custom error:", createdWithCustomError)
})

example.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
