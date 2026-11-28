import { maintenanceRequest } from "./maintenance-client.mjs";

const result = await maintenanceRequest("health");
if (!result.ok) throw new Error("Ompath topic maintenance or AI provider health check failed: " + JSON.stringify(result.providers || {}));
console.log("Ompath topic maintenance API ready; published topics:", result.publishedTopics);
