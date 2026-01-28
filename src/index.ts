import { Elysia, t } from "elysia";

const app = new Elysia().get("/", () => ({name: "Hello Elysia"}), {
  response: t.Object({
    name: t.String()
  })
}).listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
