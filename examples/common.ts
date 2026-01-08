import { Schema } from "effect"

export class Todo extends Schema.Class<Todo>("@app/schemas/Todo")({
	id: Schema.UUID,
	title: Schema.String,
	description: Schema.String,
	completed: Schema.Boolean,
}) {}

export const NewTodo = Todo.pipe(Schema.omit("id", "completed"))
export type NewTodo = typeof NewTodo.Type

export class ApiError extends Schema.TaggedError<ApiError>()("@app/errors/ApiError", {
	method: Schema.String,
	endpoint: Schema.String,
	statusCode: Schema.Number,
	statusText: Schema.String,
	message: Schema.String.pipe(Schema.optional),
}) {}
