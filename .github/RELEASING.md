# Desktop release pipeline

Every push to `master` runs `.github/workflows/release.yml`. The workflow validates the
repository, builds Windows (NSIS), macOS (DMG and ZIP), and Linux (AppImage and DEB) packages,
then publishes them with the generated updater metadata to a public GitHub Release.

The release version is derived from `packages/app/package.json`: its major and minor values are
kept, and the GitHub Actions run number becomes the patch version. For example, base version
`1.0.0` in workflow run 42 is released as `1.0.42`.

## macOS signing

macOS automatic updates require a signed application. Configure these GitHub Actions secrets to
enable signing and notarization:

- `MACOS_CERTIFICATE`: base64-encoded Developer ID Application certificate (`.p12`)
- `MACOS_CERTIFICATE_PASSWORD`: certificate password
- `APPLE_ID`: Apple ID used for notarization
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID
- `APPLE_TEAM_ID`: Apple Developer team ID

Without those secrets the workflow still creates unsigned macOS artifacts, but macOS will not
install them through the automatic updater. Windows NSIS and Linux AppImage updates do not use
these Apple credentials.
