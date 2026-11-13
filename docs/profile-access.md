# CTX profiles and access

CTX requires a profile before opening the application. The administrator has full access. The guest profile can view Mission Control; selecting Agents or Knowledge Bank displays an administrator-access message. Guest page and API access are enforced in the server proxy, not only hidden in navigation.

## First sign-in

On a fresh local instance, CTX redirects to the Astryx login card. Enter the administrator email, choose a passkey of at least 12 characters, and confirm it. The passkey is stored only as a scrypt hash. The administrator is signed in after setup.

On a hosted instance with bootstrap password-hash and session-secret files, enter the email to associate with the existing setup passkey. The setup passkey is verified before the profile is created. This first claim works through the configured bootstrap secret and does not require loopback access.

Admin profile data is stored in `data/config/admin-profile.json` by default. The session signing key is provisioned on first access in the same persistent config directory, so guests can sign in before admin setup. Docker sets `CTX_CONFIG_DIR=/config`, backed by the named `ctx-config` volume, so the profile and signing key survive container and image updates. Back up this volume with the deployment's other configuration data.

The terminal fallback is `npm run auth:configure-admin`. It writes hashed credentials and required API tokens to `.env.local`; do not commit `.env.local` or any files under `deploy/secrets/`.

Guest access is available before and after administrator setup. It creates a read-only session that expires after eight hours. Guest sessions can view Mission Control only; direct agent, knowledge, document, and AI workspace access is denied.
