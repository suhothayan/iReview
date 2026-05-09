# Security Policy

## Reporting a vulnerability

If you find a security issue in iReview, please **do not** open a public GitHub issue.

You can either:

- Use GitHub's [private vulnerability reporting](https://github.com/suhothayan/iReview/security/advisories/new) (preferred — it's encrypted and tracked alongside the repo), **or**
- Email **suhothayan.ireview@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- The version of iReview affected (`ireview --version`)
- Your assessment of severity / blast radius

You can expect an acknowledgement within a few days. I'll work with you on a fix and credit you in the release notes if you'd like.

## Scope

iReview runs locally and binds to `127.0.0.1` only. The threat model is mostly about:

- A malicious / hostile repo that the user has cloned and is reviewing — input from disk should be considered untrusted.
- Other processes or web pages on the same machine attempting to exfiltrate diff content via the local HTTP API.

Any input-validation gap, authentication bypass, code-execution path through `git` invocations, or way for a non-iReview origin to read iReview's API are in scope.

Out of scope: any attack that requires the attacker to already have arbitrary code-execution on the user's machine.

## Supported versions

Only the latest released version of iReview receives security fixes. The repository is currently at v0.1, and the next release will incorporate any pending fixes.
