import { FetchHttpClient } from "@effect/platform"
import { Console, Effect, Schema } from "effect"
import { Request, Service } from "../src"
import { ApiError, NewTodo, Todo } from "./common"

// Request batching: create request classes for Effect's batching and caching

// GET with static URL
class GetTodos extends Request.Get("app/GetTodos", {
	spec: { url: "/todos", response: Todo.pipe(Schema.Array) },
}) {}

// GET with dynamic URL and layer (removes HttpClient dependency)
class GetTodo extends Request.Get("app/GetTodo", {
	spec: { url: (params: { id: string }) => `/todos/${params.id}`, response: Todo },
	layer: FetchHttpClient.layer,
}) {}

// POST with body and response
class CreateTodo extends Request.Post("app/CreateTodo", {
	spec: {
		url: "/todos",
		body: NewTodo,
		response: Todo,
	},
}) {}

// PUT with dynamic URL and body
class UpdateTodo extends Request.Put("app/UpdateTodo", {
	spec: {
		url: (params: { id: string }) => `/todos/${params.id}`,
		body: Todo,
		response: Todo,
	},
}) {}

// DELETE with dynamic URL
class DeleteTodo extends Request.Del("app/DeleteTodo", {
	spec: {
		url: (params: { id: string }) => `/todos/${params.id}`,
	},
}) {}

const example = Effect.gen(function* () {
	const todos = yield* Effect.request(new GetTodos(), GetTodos.resolver)
	yield* Console.log("Todos:", todos)

	const todo = yield* Effect.request(new GetTodo({ url: { id: "123" } }), GetTodo.resolver)
	yield* Console.log("Todo:", todo)

	const created = yield* Effect.request(
		new CreateTodo({ body: { title: "New Todo", description: "Description" } }),
		CreateTodo.resolver
	)
	yield* Console.log("Created:", created)

	const updated = yield* Effect.request(
		new UpdateTodo({
			url: { id: "123" },
			body: { id: "123", title: "Updated", description: "Updated", completed: true },
		}),
		UpdateTodo.resolver
	)
	yield* Console.log("Updated:", updated)

	yield* Effect.request(new DeleteTodo({ url: { id: "123" } }), DeleteTodo.resolver)
	yield* Console.log("Deleted")
})

// example 2: using the ApiClient service

class ApiClient extends Effect.Service<ApiClient>()("@app/ApiClient", {
	effect: Service.make({ error: ApiError }),
	dependencies: [Service.layerConfig({ url: "https://example.com", getAccessToken: Effect.succeed("token") })],
}) {}

class TodoRepo extends Effect.Service<TodoRepo>()("@app/TodoRepo", {
	effect: Effect.gen(function* () {
		const client = yield* ApiClient

		// here, use client.Request.<Method> to create request classes
		// the client errors, headers and layers are provided to the request classes

		class GetTodos extends client.Request.Get("app/GetTodos", {
			url: "/todos",
			response: Todo.pipe(Schema.Array),
		}) {}

		class GetTodo extends client.Request.Get("app/GetTodo", {
			url: (params: { id: string }) => `/todos/${params.id}`,
			response: Todo,
		}) {}

		class CreateTodo extends client.Request.Post("app/CreateTodo", {
			url: "/todos",
			body: NewTodo,
			response: Todo,
		}) {}

		class UpdateTodo extends client.Request.Put("app/UpdateTodo", {
			url: (params: { id: string }) => `/todos/${params.id}`,
			body: Todo,
			response: Todo,
		}) {}

		class DeleteTodo extends client.Request.Del("app/DeleteTodo", {
			url: (params: { id: string }) => `/todos/${params.id}`,
		}) {}

		return {
			getTodos: Effect.request(new GetTodos(), GetTodos.resolver),
			getTodo: (id: string) => Effect.request(new GetTodo({ url: { id } }), GetTodo.resolver),
			createTodo: (body: NewTodo) => Effect.request(new CreateTodo({ body }), CreateTodo.resolver),
			updateTodo: (id: string, body: Todo) =>
				Effect.request(new UpdateTodo({ url: { id }, body }), UpdateTodo.resolver),
			deleteTodo: (id: string) => Effect.request(new DeleteTodo({ url: { id } }), DeleteTodo.resolver),
		}
	}),
	dependencies: [ApiClient.Default],
}) {}

const example2 = Effect.gen(function* () {
	const todoRepo = yield* TodoRepo
	const todos = yield* todoRepo.getTodos
	yield* Console.log("Todos:", todos)
	const todo = yield* todoRepo.getTodo("123")
	yield* Console.log("Todo:", todo)
	const created = yield* todoRepo.createTodo({ title: "New Todo", description: "Description" })
	yield* Console.log("Created:", created)
})

example.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)

example2.pipe(
	Effect.provide(TodoRepo.Default),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
