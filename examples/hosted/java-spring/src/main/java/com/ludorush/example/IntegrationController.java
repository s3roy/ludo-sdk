package com.ludorush.example;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Example product API. Spring owns session/wallet; Node owns the match.
 * Browser still opens {@code wsUrl} for roll/move intents.
 */
@RestController
@RequestMapping("/api/ludo")
public class IntegrationController {
  private final LudoSidecarClient sidecar;

  public IntegrationController(LudoSidecarClient sidecar) {
    this.sidecar = sidecar;
  }

  @GetMapping("/bootstrap")
  public Map<String, Object> bootstrap() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("wsUrl", sidecar.wsUrlForBrowser());
    out.put("sidecar", sidecar.health());
    return out;
  }

  @GetMapping("/rooms")
  public Object rooms() {
    return sidecar.listRooms();
  }

  @PostMapping("/tables")
  public ResponseEntity<?> openTable(@RequestBody Map<String, Object> body) {
    return ResponseEntity.ok(sidecar.openTable(body));
  }
}
