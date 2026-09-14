import mqtt, { type MqttClient } from "mqtt";
import { readRelayEnvelope, relayTopics } from "./relay-room.ts";

export type RelayRole = "police" | "thief";
export type RelayStatus = "online" | "reconnecting" | "offline";
export type RelayConnection = {
  send: (message: unknown, retain?: boolean) => void;
  close: () => void;
};

type ConnectRelayOptions = {
  code: string;
  role: RelayRole;
  onMessage: (message: unknown) => void;
  onStatus?: (status: RelayStatus) => void;
  timeoutMs?: number;
};

const BROKER_URL = "wss://demo.tbmq.io:443/mqtt";

export function connectRelay(options: ConnectRelayOptions): Promise<RelayConnection> {
  const sender = crypto.randomUUID();
  const topics = relayTopics(options.code);
  const inbound = options.role === "police" ? topics.toPolice : topics.toThief;
  const outbound = options.role === "police" ? topics.toThief : topics.toPolice;
  const lastSequence = new Map<string, number>();
  let sequence = 0;
  let closed = false;
  let settled = false;
  const client: MqttClient = mqtt.connect(BROKER_URL, {
    clientId: `zisu_${sender.replaceAll("-", "").slice(0, 16)}`,
    clean: true,
    protocolVersion: 4,
    username: "demo",
    reconnectPeriod: 1_500,
    connectTimeout: 10_000,
    keepalive: 20,
    resubscribe: true,
  });

  const promise = new Promise<RelayConnection>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end(true);
      reject(new Error("relay-timeout"));
    }, options.timeoutMs ?? 15_000);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
    };

    client.on("connect", () => {
      if (closed) return;
      client.subscribe(inbound, { qos: 1 }, error => {
        if (error) { finish(error); return; }
        options.onStatus?.("online");
        if (settled) return;
        clearTimeout(timeout);
        settled = true;
        resolve({
          send(message, retain = false) {
            if (closed) return;
            const envelope = JSON.stringify({ sender, seq: ++sequence, sentAt: Date.now(), message });
            client.publish(outbound, envelope, { qos: 1, retain });
          },
          close() {
            if (closed) return;
            closed = true;
            if (options.role === "police" && client.connected) {
              client.publish(outbound, "", { qos: 1, retain: true }, () => client.end(true));
              setTimeout(() => client.end(true), 500);
            } else client.end(true);
          },
        });
      });
    });
    client.on("message", (topic, payload) => {
      if (closed || topic !== inbound) return;
      const message = readRelayEnvelope(payload.toString(), sender, lastSequence, Date.now());
      if (message) options.onMessage(message);
    });
    client.on("reconnect", () => !closed && options.onStatus?.("reconnecting"));
    client.on("offline", () => !closed && options.onStatus?.("offline"));
    client.on("error", error => {
      if (!settled && !client.reconnecting) finish(error);
    });
  });
  return promise;
}
