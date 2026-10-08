/** localStorage key for Todo date grouping (§1.8 / §6 P5). */
export const TODO_GROUP_KEY = "relay.todo.groupBy";

export type TodoGroupBy = "due" | "none";

/** Default is date grouping; only `"none"` opts out (§6 P5). */
export function readTodoGroupBy(
  storage: Pick<Storage, "getItem"> = localStorage,
): TodoGroupBy {
  const v = storage.getItem(TODO_GROUP_KEY);
  if (v === "none") return "none";
  return "due";
}
