# IzzyOnDroid & F-Droid Submission Guide for ZenV

ZenV is an ideal candidate for **IzzyOnDroid** and **F-Droid**:
- Licensed under **AGPL-3.0**.
- Complete lack of `android.permission.INTERNET` (enforced airgap).
- Signed APK attached to GitHub Releases.

---

## Part 1: Submit to IzzyOnDroid (Takes ~2 Minutes)

IzzyOnDroid is the most popular community repository on F-Droid. Once approved here, users on Android with F-Droid, Obtainium, or Neo Store can search and install ZenV directly.

### Step 1: Open Inclusion Issue
IzzyOnDroid moved their issue tracker to Codeberg:
Go to: **[https://codeberg.org/IzzyOnDroid/repodata/issues/new](https://codeberg.org/IzzyOnDroid/repodata/issues/new)**
*(Alternative / mirror tracker if needed: https://gitlab.com/IzzyOnDroid/repo/-/issues)*

### Step 2: Select Template
Select template: **`Inclusion Request`**

### Step 3: Copy & Paste These Fields

```markdown
### Application Name
ZenV

### Repository URL
https://github.com/ashroxy/zenv

### License
AGPL-3.0-or-later

### Issue Tracker
https://github.com/ashroxy/zenv/issues

### Releases
https://github.com/ashroxy/zenv/releases

### Short Description (max 80 chars)
Airgapped, zero-storage deterministic password manager for Android and Web.

### Detailed Description
ZenV derives credentials mathematically on the fly using PBKDF2-HMAC-SHA256 (100k iterations) and uniform rejection sampling instead of storing passwords in an encrypted database or syncing across cloud servers.

Key features:
* Strict OS-Enforced Airgap: The release APK completely omits `android.permission.INTERNET`. Sockets are blocked by the OS kernel.
* Zero Storage: Passwords are not stored on disk; they are derived from your master key and salt on demand.
* AES-256-GCM at rest: Service names and counter metadata are stored locally with authenticated encryption.
* Ephemeral secrets: Revealed passwords and clipboard auto-clear after 30 seconds.
* 100% offline backups: Export and import authenticated `.cvx` containers.
* Zero trackers, zero analytics, zero external CDNs.

### Categories
Security, Privacy, Utilities

### Anti-Features
None (No network access, no ads, no trackers).
```

---

## Part 2: Main F-Droid Submission (Build From Source)

Once ZenV is listed on IzzyOnDroid, it can be proposed to the official F-Droid repository (`fdroiddata`).

1. Fork `https://gitlab.com/fdroid/fdroiddata`.
2. Add metadata file `metadata/com.zenv.app.yml`:

```yaml
Categories:
  - Security
License: AGPL-3.0-or-later
WebSite: https://github.com/ashroxy/zenv
SourceCode: https://github.com/ashroxy/zenv
IssueTracker: https://github.com/ashroxy/zenv/issues
Changelog: https://github.com/ashroxy/zenv/blob/main/CHANGELOG.md

Summary: Airgapped deterministic password generator
Description: |-
  ZenV derives credentials mathematically using PBKDF2-HMAC-SHA256
  and uniform rejection sampling instead of storing them in a database.
  
  The release APK has zero network permissions (android.permission.INTERNET
  is omitted).

RepoType: git
Repo: https://github.com/ashroxy/zenv.git

Builds:
  - versionName: 1.0.1
    versionCode: 2
    commit: v1.0.1
    subdir: android/app
    gradle:
      - yes
```

3. Open a Merge Request against `fdroid/fdroiddata`.
