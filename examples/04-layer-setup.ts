import { FetchHttpClient } from "@effect/platform"
import { Config, Console, Effect, Layer, Schema } from "effect"
import { Client } from "../src"
import { Todo } from "./common"

// Layer setup: providing configuration and HTTP client to Effect runtime

class AuthError extends Schema.TaggedClass<AuthError>("@app/errors/AuthError")("AuthError", {
	message: Schema.String,
}) {}

// Create API client config layer
const ApiClientConfigLive = Layer.effect(
	Client.Config,
	Effect.gen(function* () {
		const url = yield* Config.string("API_URL")
		// wrap auth library like auth.js in an Effect.tryPromise
		const accessToken = yield* Effect.tryPromise({
			try: async () => "ey...." as const,
			catch: (error) => new AuthError({ message: String(error) }),
		})
		return { url, accessToken }
	})
)

// Compose layers: HTTP client + config
const layer = Client.layer.pipe(Layer.provide([FetchHttpClient.layer, ApiClientConfigLive]))

// Define routes
const getTodo = Client.get({
	url: (params: { id: string }) => `/todos/${params.id}`,
	response: Todo,
})

// Use routes with layer
const example = Effect.gen(function* () {
	const todo = yield* getTodo({ url: { id: "123" } })
	yield* Console.log("Todo:", todo)
	return todo
})

// Run with layer
example.pipe(
	Effect.provide(layer),
	Effect.catchAll((error) => Console.error("Error:", error)),
	Effect.runPromise
)
