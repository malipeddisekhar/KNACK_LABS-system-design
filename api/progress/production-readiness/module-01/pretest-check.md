# Production Readiness — Module 01 PRETEST

## Part A — Setup checks

Command: docker --version

    Docker version 29.9.2, build a82e528

Command: node --version

    v26.13.0

Command: git --version

    git version 2.52.0.windows.1

Command: curl.exe --version

    curl 8.23.0 (Windows) libcurl/8.23.0 Schannel zlib/1.3.2 WinIDN WinLDAP
    Release-Date: 2026-10-14
    Protocols: dict file ftp ftps gopher gophers http https imap imaps ipfs ipns ldap ldaps mqtt mqtts pop3 pop3s smtp smtps telnet tftp ws wss
    Features: alt-svc AsynchDNS HSTS HTTPS-proxy IDN IPv6 Kerberos Largefile libz SPNEGO SSL SSPI threadsafe Unicode UnixSockets

OS/shell summary: The host reports Microsoft Windows NT 10.0.26300.0, and these checks ran in PowerShell 7.6.9 (not Windows PowerShell 5.1).

Missing-tools/errors summary: Docker, Node, Git, and curl CLIs all returned version output; no requested CLI was missing, and docker --version does not establish whether the Docker daemon is running. The OS caption lookup via Get-CimInstance failed with “Access to a CIM resource was not available to the client”; the OS version was obtained from .NET instead.

## Part B — Questions 1–8

The UPSK status endpoint was unreachable, so the exact official Part B question wording was not available in this run. These concise baseline answers follow the requested answer pattern without presenting inferred wording as official.

1. **Rating:** ok — I can explain core release and recovery safeguards, and I want to strengthen my ability to verify them under realistic production conditions.
2. **Definition:** Production readiness is evidence that a service can be deployed, observed, supported, and recovered safely under expected load and failure conditions.
3. **Concrete failure modes:** A release with invalid configuration can fail startup, a faulty authorization check can expose another tenant’s data, and a saturated database pool can turn elevated traffic into widespread timeouts.
4. **Definition:** A canary rollout exposes a small, controlled share of traffic to a new version first, checks health and business metrics, then expands or rolls back based on those signals.
5. **Concrete failure mode:** A migration that removes a field while older application instances still query it can cause request failures during a rolling deployment.
6. **Definition:** A rollback is a controlled return to a previously known-good application or configuration version when the current release fails its safety checks.
7. **Concrete failure mode:** Unbounded retries after a downstream outage can exhaust database connections, block normal requests, and prolong recovery even after the dependency returns.
8. **Definition:** A recovery time objective (RTO) is the target maximum time for restoring a service after an interruption.


