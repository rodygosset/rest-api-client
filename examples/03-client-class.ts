import { FetchHttpClient, Headers, HttpClientResponse } from "@effect/platform"
import { Console, Effect, Schema } from "effect"
import { Client } from "../src"
import { ApiError, NewTodo, Todo } from "./common"

// Client class examples: preset defaults for headers and error handling

// Client with default error handler
const clientWithError = new Client.Client({
	error: (res: HttpClientResponse.HttpClientResponse) =>
		new ApiError({
			method: res.request.method,
			endpoint: res.request.url,
			statusCode: res.status,
			statusText: String(res.status),
			message: `Request failed with status ${res.status}`,
		}),
})

// Routes inherit default error handler
// Error type inferred from client default: ApiError
const getTodo = clientWithError.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Client with default static headers
const clientWithHeaders = new Client.Client({
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-API-Version": "v2",
	}),
})

const getTodos = clientWithHeaders.get({
	url: "/todos",
	response: Todo.pipe(Schema.Array),
})

// Client with default dynamic headers
const clientWithDynamicHeaders = new Client.Client({
	headers: (params: { apiVersion: string }) =>
		Effect.succeed(
			Headers.fromInput({
				Accept: "application/json",
				"X-API-Version": params.apiVersion,
			})
		),
})

const createTodo = clientWithDynamicHeaders.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
})

// Client with both headers and error handler
const apiClient = new Client.Client({
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
			message: `API request failed: ${res.request.method} ${res.request.url}`,
		}),
})

// Routes inherit both defaults
const updateTodo = apiClient.put({
	url: (params: { id: string }) => `/todos/${params.id}`,
	body: Todo,
	response: Todo,
})

// Override default error handler per route
// Error type inferred from route override: string (not ApiError)
const getPublicData = apiClient.get({
	url: "/public/data",
	response: Schema.String,
	error: (res: HttpClientResponse.HttpClientResponse) => `Public endpoint failed: ${res.status}`,
})

const example = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	yield* Console.log("Todo:", todo)

	const todos = yield* getTodos()
	yield* Console.log("Todos:", todos)

	const created = yield* createTodo({
		body: { title: "New Todo", description: "Description" },
		headers: { apiVersion: "v2" },
	})
	yield* Console.log("Created:", created)

	const updated = yield* updateTodo({
		url: { id: "123" },
		body: {
			id: "123",
			title: "Updated Todo",
			description: "Updated Description",
			completed: true,
		},
	})
	yield* Console.log("Updated:", updated)

	const publicData = yield* getPublicData()
	yield* Console.log("Public data:", publicData)
})

example.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
