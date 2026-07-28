# Stage configuration matrix

This is the committed, secret-free contract for cloud configuration. Coordinates come only from
SSM at `/dndtools/<stage>/...`; credentials, tokens, sender credentials, and rotation material stay
in Secrets Manager or protected GitHub environment variables. Do not put a production coordinate in
source until the protected promotion workflow has deployed it.

| Setting                          | Owner         | Default             | Dev                | Prod                      | Source             |
| -------------------------------- | ------------- | ------------------- | ------------------ | ------------------------- | ------------------ |
| AWS region                       | platform      | `ca-central-1`      | yes                | yes                       | SSM/meta           |
| Cognito pool/client              | platform      | absent              | synthetic accounts | customer accounts         | SSM/identity       |
| API, signaling, TURN coordinates | platform      | absent              | dev relay/API      | prod relay/API            | SSM                |
| Allowed web origin               | platform      | invalid placeholder | dev CloudFront     | promotion only            | stage config + SSM |
| Log retention                    | operations    | bounded             | 14 days            | 90 days                   | SAM parameter      |
| Diagnostic endpoint              | operations    | `/health`           | enabled            | enabled                   | stage config       |
| Client telemetry                 | privacy       | off                 | consented          | consented, off by default | capability flag    |
| Experimental flags               | feature owner | off                 | explicit opt-in    | explicit approval         | SSM feature-flags  |

Feature flags are server-controlled JSON at `/dndtools/<stage>/config/feature-flags`. Every flag has
an owner and expiry; production defaults to disabled. A flag is audited through CloudTrail/SSM and the
promotion summary. The web bundle may display only the already-approved capability snapshot; it must
not treat a build-time value as authority for protected server behaviour.
