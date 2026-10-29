package com.ludorush.example;

import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Thin HTTP client for the Node sidecar.
 * Auth / wallet / your product APIs stay in Spring; dice & legality stay in Node.
 */
@Component
public class LudoSidecarClient {
  private final RestClient http;
  private final LudoSidecarProperties props;

  public LudoSidecarClient(LudoSidecarProperties props) {
    this.props = props;
    this.http = RestClient.builder().baseUrl(props.getBaseUrl()).build();
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> health() {
    return http.get().uri("/health").retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> listRooms() {
    return http.get().uri("/rooms").retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> openTable(Map<String, Object> body) {
    return http.post().uri("/tables").body(body).retrieve().body(Map.class);
  }

  public String wsUrlForBrowser() {
    return props.getWsUrl();
  }
}
