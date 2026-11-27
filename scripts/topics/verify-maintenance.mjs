import { maintenanceRequest } from "./maintenance-client.mjs";

const result = await maintenanceRequest("health");
if (!result.ok) throw new Error("Ompath topic maintenance API health check failed.");
console.log("Ompath topic maintenance API ready; published topics:", result.publishedTopics);
