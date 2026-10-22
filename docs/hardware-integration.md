# Future ESP32 gateway contract — NOT IMPLEMENTED / PHYSICAL OUTPUT DISABLED

The only runnable gateway is SimulatorGateway. No GPIO, relay, broker or physical OPEN code is included. Do not replace the simulator with an unreviewed network publisher.

Before physical commissioning, obtain the valve datasheet (voltage, current, stroke time, duty cycle, pressure limits, fail state), select a compatible isolated driver with flyback protection where appropriate, and have qualified personnel review local electrical and mechanical safety. A software CLOSE or loss of driver power does not necessarily close a valve. Validate the actual fail state locally.

Require a supervised, low-pressure water-only fixture, pressure regulation/relief, containment, independent position limit sensors, physical local enable and a latched hardwired emergency-stop circuit independent of the network, ESP32 firmware, web application and gateway. The physical circuit must put the fixture into its reviewed safe state. Reset only locally after inspection. UI emergency stop is simulation only and is never a substitute.

Future dedicated gateway must use mqtts (MQTT over TLS 1.2+), verified server CA/hostname, unique per-device certificates (mTLS), topic ACLs and certificate rotation/revocation. ESP32 authenticates gateway-signed commands using provisioned per-device credentials. Do not reuse the simulator's ephemeral HMAC key as a fleet key. Physical feedback must be authenticated independently of command acknowledgements.

Suggested topics: axiom/lab/<controller>/command and axiom/lab/<controller>/position. Bind controller, valve, cargo, action, random command ID, issuedAt and expiresAt in every authenticated command. Maximum lifetime five seconds. No retained commands; MQTT 5 message expiry; reject delivery after expiry, clock uncertainty or reboot until secure time synchronization. QoS 1 duplicates must not actuate twice: persist consumed IDs atomically before actuation across controller/gateway restarts. Never retry an ambiguous OPEN automatically. Require fresh independent approval after any failure.

ACK means accepted, never OPEN CONFIRMED. Position telemetry must include command correlation, valve/controller identity, observation timestamp, monotonic sequence and sensor health. Require fresh independent OPEN limit feedback within the command deadline. Reject stale, duplicate, contradictory, mismatched or unsigned telemetry. On network/sensor loss show UNKNOWN, inhibit OPEN, record failure, and use local safety controls. Revalidate interlocks continuously in the local controller, independent of ARRS.

Commissioning tests must cover hardwired stop with network unplugged and firmware hung, startup/reboot, stuck relay, sensor disagreement, power loss, expired and replayed messages, certificate failure, and lost feedback. Physical integration is a separate implementation and safety-review task, not enabled by an environment variable here.
