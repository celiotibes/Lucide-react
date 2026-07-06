import { createClient } from "redis";

const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

client.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

export async function connectRedis(): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client.isOpen) {
    await client.disconnect();
  }
}

export { client };
