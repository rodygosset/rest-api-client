import { FetchHttpClient, Headers } from "@effect/platform"
import { Console, Effect, Layer } from "effect"
import { Client, Input } from "../src"
import { ApiError, NewTodo, Todo } from "./common"

// Inline static examples: all values defined directly in the route spec

// Static URL, body, response, error
// Error type inferred from ApiError schema
const createTodo = Client.post({
	url: "/todos",
	body: NewTodo,
	response: Todo,
	error: ApiError,
})

// Static URL with static body value
const updateTodo = Client.put({
	url: "/todos/123",
	body: Input.value(Todo, {
		id: "123",
		title: "Updated Todo",
		description: "Updated Description",
		completed: true,
	}),
	response: Todo,
})

// GET with static headers
const getTodo = Client.get({
	url: "/todos/123",
	headers: Headers.fromInput({
		Accept: "application/json",
		"X-Custom-Header": "static-value",
	}),
	response: Todo,
})

// DELETE without response schema
// Return type: HttpClientResponse (no schema = raw response)
const deleteTodo = Client.del({
	url: "/todos/123",
})

const example = Effect.gen(function* () {
	const created = yield* createTodo({ body: { title: "New Todo", description: "Description" } })
	yield* Console.log("Created:", created)

	const updated = yield* updateTodo()
	yield* Console.log("Updated:", updated)

	const fetched = yield* getTodo()
	yield* Console.log("Fetched:", fetched)

	const deleted = yield* deleteTodo()
	yield* Console.log("Deleted:", deleted)
})

example.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
