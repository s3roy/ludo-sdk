# Java Spring + Node Ludo sidecar

Spring Boot **does not** run `@ludorush/sdk`. It calls the Node game service over HTTP and tells the browser which WebSocket URL to use.

## Run

1. Start Node: `cd ../backend && npm run start` (port **8787**)  
2. Start Spring: `mvn spring-boot:run` (port **8080**)  
3. Frontend can still be `../frontend` on **5200**, or your own SPA that:

```js
const { wsUrl } = await fetch('http://localhost:8080/api/ludo/bootstrap').then(r => r.json())
// then WebSocket(wsUrl) + mountHostedLudo({ transport: … })
```

## Config

`src/main/resources/application.yml`:

```yaml
ludo:
  sidecar:
    base-url: http://127.0.0.1:8787
    ws-url: ws://127.0.0.1:8787
```

## Next steps for production Java shops

1. Put Spring behind auth; never trust client `playerId` — mint it server-side.  
2. Keep gameplay WS on the Node sidecar (or gateway that terminates TLS and forwards).  
3. Use Spring for wallet/settlement; call sidecar only for match lifecycle.  
4. Long-term: optional Java engine port if you must be JVM-only.
