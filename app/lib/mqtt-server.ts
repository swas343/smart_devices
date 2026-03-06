/**
 * Server-side MQTT helper used by Next.js API routes to publish messages
 * to the HiveMQ broker over MQTTS (TLS, port 8883).
 *
 * NOTE: This module must only be imported in server-side code (API routes,
 * Server Actions, etc.).  It is intentionally excluded from the client bundle.
 */

import mqtt, { MqttClient } from "mqtt";

let serverClient: MqttClient | null = null;

function getServerMQTTClient(): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    if (serverClient?.connected) {
      resolve(serverClient);
      return;
    }

    const url = `mqtts://${process.env.MQTT_HOST ?? "366796d2a3ee4bdc99cffee3d6420fa6.s1.eu.hivemq.cloud"}:8883`;

    const client = mqtt.connect(url, {
      clientId:             `nextjs-server-${Date.now()}`,
      username:             process.env.MQTT_USERNAME ?? "hivemq.webclient.1763386015250",
      password:             process.env.MQTT_PASSWORD ?? "la7Dz6vZ3Rq%F:YU.;4n",
      rejectUnauthorized:   false,
      connectTimeout:       8000,
      reconnectPeriod:      0,    // don't auto-reconnect in server context
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("Server MQTT connection timed out"));
    }, 9000);

    client.on("connect", () => {
      clearTimeout(timeout);
      serverClient = client;
      resolve(client);
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Publish a message from a server-side context (API routes, etc.).
 * Opens a connection if none exists, publishes, then closes.
 */
export async function serverPublish(
  topic: string,
  payload: string,
  retain = false
): Promise<void> {
  const client = await getServerMQTTClient();
  await new Promise<void>((resolve, reject) => {
    client.publish(topic, payload, { retain, qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
