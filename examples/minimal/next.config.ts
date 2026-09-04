import type { NextConfig } from "next";
import { withWebMCP } from "next-webmcp/config";

const nextConfig: NextConfig = {};

// The manifest is plain data; next.config.ts cannot import app/tools.ts because that module
// pulls in a "use server" action. Keep the two in sync by hand.
export default withWebMCP(nextConfig, {
  manifest: {
    routes: [
      {
        route: "/",
        tools: [
          {
            name: "get_time",
            description: "Return the current time in the user's browser as an ISO-8601 string.",
          },
          {
            name: "add_todo",
            description:
              "Add a todo item to the list on this page. Asks the user to approve first.",
            inputSchema: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  minLength: 1,
                  maxLength: 200,
                  description: "The todo text",
                },
              },
              required: ["text"],
              additionalProperties: false,
            },
          },
        ],
      },
    ],
  },
});
