export type ConnectionWatchdog = {
  finish: () => boolean;
  readonly pending: boolean;
};

const RELAY_CREDENTIALS = {
  username: "openrelayproject",
  credential: "openrelayproject",
};

export function restrictedNetworkPeerOptions(): { debug: number; config: RTCConfiguration } {
  return {
    debug: 1,
    config: {
      iceCandidatePoolSize: 10,
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
        {
          urls: [
            "turn:eu-0.turn.peerjs.com:3478",
            "turn:us-0.turn.peerjs.com:3478",
          ],
          username: "peerjs",
          credential: "peerjsp",
        },
        {
          urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:443?transport=tcp",
            "turns:openrelay.metered.ca:443?transport=tcp",
          ],
          ...RELAY_CREDENTIALS,
        },
      ],
    },
  };
}

export function createConnectionWatchdog(timeoutMs: number, onTimeout: () => void): ConnectionWatchdog {
  let pending = true;
  const timer = setTimeout(() => {
    if (!pending) return;
    pending = false;
    onTimeout();
  }, timeoutMs);

  return {
    finish() {
      if (!pending) return false;
      pending = false;
      clearTimeout(timer);
      return true;
    },
    get pending() {
      return pending;
    },
  };
}

export function connectionErrorMessage(type: string, action: "create" | "join" = "join"): string {
  if (type === "peer-unavailable") return "没有找到这个房间，请确认房间号正确，并让房主页面保持打开";
  if (type === "unavailable-id") return "房间号碰巧被占用，请重新创建";
  if (type === "timeout") return action === "create"
    ? "校园网未能连接房间服务器。请点“重新创建”；仍失败时可切换手机热点"
    : "校园网未能建立实时通道。请让房主保持页面打开，然后点“重新加入”；仍失败时可切换手机热点";
  if (type === "network" || type === "server-error" || type === "socket-error") {
    return "校园网无法连接联机服务器。请重新尝试；仍失败时可切换手机热点";
  }
  return "联机通道出现异常，请重新尝试";
}
