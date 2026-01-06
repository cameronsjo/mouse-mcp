# Authelia Secrets

Generate secrets before first run. These files should NOT be committed to git.

## Required Files

### hmac

OIDC HMAC secret for signing:

```bash
openssl rand -hex 32 > hmac
```

### issuer.pem

RSA private key for JWT signing:

```bash
openssl genrsa -out issuer.pem 4096
```

### client-secret-hash

MCP gateway client secret hash. First generate a random password:

```bash
openssl rand -base64 32
# Save this output - you'll need it for Claude.ai config
```

Then hash it for Authelia:

```bash
docker run --rm authelia/authelia:latest crypto hash generate pbkdf2 --password 'YOUR_PASSWORD_HERE'
```

Copy the hash output to `authelia/configuration.yml` in the `client_secret` field.

## File Permissions

Secrets should be readable only by the container user:

```bash
chmod 600 hmac issuer.pem
```

## Gitignore

Add to `.gitignore`:

```
authelia/secrets/hmac
authelia/secrets/issuer.pem
```
