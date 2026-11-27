# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities in awg-easy **privately**, not via
public issues:

1. Use [GitHub Private Vulnerability Reporting](https://github.com/fast-iq/awg-easy/security/advisories/new), or
2. Email the maintainers through the contact listed on the repository's
   Security tab.

Include as much detail as you can — affected version(s) (see
`/api/information` or the version banner), a description of the issue and,
when possible, a minimal reproduction. We aim to acknowledge reports within
72 hours and to ship a fix or mitigation within 30 days for confirmed
high-severity issues.

## Scope

This covers the awg-easy web application and its bundled WireGuard/AmneziaWG
management tooling. Vulnerabilities in the underlying WireGuard kernel
module, AmneziaWG, or your distribution belong to their respective projects
— but please report them to us as well if awg-easy's usage makes them
reachable, so we can mitigate on our side.

## Notes for reporters

- The app is designed to run on a private network or behind a TLS reverse
  proxy; running it on a plain HTTP port without a proxy is a documented
  deployment mode (`INSECURE=true`) — findings that only apply to that
  mode may be rated lower, but are still worth reporting.
- Session cookies carry `HttpOnly`; the session is an encrypted (sealed)
  cookie, so tampering without the server secret is not a vulnerability in
  itself.
