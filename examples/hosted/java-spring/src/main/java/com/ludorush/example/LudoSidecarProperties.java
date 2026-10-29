package com.ludorush.example;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ludo.sidecar")
public class LudoSidecarProperties {
  /** HTTP base for Node game service, e.g. http://127.0.0.1:8787 */
  private String baseUrl = "http://127.0.0.1:8787";
  /** WebSocket URL the browser should use for play intents */
  private String wsUrl = "ws://127.0.0.1:8787";

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = baseUrl;
  }

  public String getWsUrl() {
    return wsUrl;
  }

  public void setWsUrl(String wsUrl) {
    this.wsUrl = wsUrl;
  }
}
