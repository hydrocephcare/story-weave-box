import { createTopicDataClient } from "./neon-client.mjs";

const client = createTopicDataClient();
const { data, error } = await client.from("topic_pages")
  .select("slug")
  .eq("status", "published")
  .limit(1);
if (error) throw new Error("Neon Data API verification failed: " + error.message);
console.log("Neon Data API ready; sample published topic rows:", data?.length || 0);
