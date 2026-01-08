import { Effect, Schema, Layer, Console } from "effect"
import { Client, Service } from "../src"
import { ApiError, NewTodo, Todo } from "./common"
import { HttpClientResponse } from "@effect/platform"

// dumb example of a logger service for illustration purposes

class Logger extends Effect.Service<Logger>()("@app/Logger", {
	sync: () => ({ log: Console.log }),
}) {}

// Service providing a client instance with custom error handling
// Client.make() does two things:
// 1. Returns an effect that provides a client
// 2. Removes the HttpClient dependency from the client methods, adding it to the client providing effect, and thus to the client providing service (ApiClient)
// That allows us to avoid leaking the HttpClient dependency to consumers of the ApiClient service
class ApiClient extends Effect.Service<ApiClient>()("@app/ApiClient", {
	effect: Effect.gen(function* () {
		// if we yielded the logger service in the error handler effect, we'd be leaking the dependency to consumers of the ApiClient service
		// instead, we lift the dependency -- now ApiClient depends on Logger, and we can provide it only once to the ApiClient
		// see: https://effect.website/docs/requirements-management/layers/#avoiding-requirement-leakage

		const logger = yield* Logger

		const client = yield* Service.make({
			error: (res: HttpClientResponse.HttpClientResponse) =>
				Effect.fail(
					new ApiError({
						method: res.request.method,
						endpoint: res.request.url,
						statusCode: res.status,
						statusText: String(res.status),
						message: `Request failed: ${res.status}`,
					})
				).pipe(Effect.tapError((error) => logger.log(error))),
		})

		return client
	}),
	dependencies: [
		Logger.Default,
		Service.layerConfig({ url: "https://example.com", getAccessToken: Effect.succeed("token") }),
	],
}) {}

// Service depending on ApiClient, exposing CRUD operations as accessor functions
export class TodoRepo extends Effect.Service<TodoRepo>()("@app/TodoRepo", {
	effect: Effect.gen(function* () {
		// Yield client dependency from the service context
		const client = yield* ApiClient

		// Build route functions using the injected client
		const getTodos = client.get({ url: "/todos", response: Todo.pipe(Schema.Array) })

		const getTodo = client.get({ url: (params: { id: string }) => `/todos/${params.id}`, response: Todo })

		const createTodo = client.post({ url: "/todos", body: NewTodo, response: Todo })

		const updateTodo = client.put({
			url: (params: { id: string }) => `/todos/${params.id}`,
			body: Todo,
			response: Todo,
		})

		const deleteTodo = client.del({ url: (params: { id: string }) => `/todos/${params.id}` })

		return {
			getTodos,
			getTodo,
			createTodo,
			updateTodo,
			deleteTodo,
		}
	}),
	dependencies: [ApiClient.Default], // Provide the ApiClient service dependency
	accessors: true, // Generate static accessor functions (e.g., TodoRepo.getTodo)
}) {}

// Use accessor functions in Effect.gen, providing merged layers
const example = Effect.gen(function* () {
	const todo = yield* TodoRepo.getTodo({ url: { id: "123" } })
	yield* Console.log("Todo:", todo)
}).pipe(
	Effect.provide(
		// Merge repository layer with client config layer
		TodoRepo.Default
	),
	Effect.catchAll((error) => Console.error("Error:", error))
)

example.pipe(Effect.runPromise)
