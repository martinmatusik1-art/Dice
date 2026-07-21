# Custom Agent Rules for Dice

## Version Incrementing Rule
- **Mandatory Action:** Whenever you make any code modifications, bug fixes, or new feature implementations in this project, you must increment the application version by `+0.01` (e.g. from `1.25` to `1.26`, then `1.26` to `1.27`).
- **Files to Update:** You must apply the version change in the following files simultaneously:
  - `package.json` (the `"version"` field)
  - `package-lock.json` (the `"version"` field at the root and under packages)
  - `index.html` (the version text strings, e.g. `v1.XX` and `Version 1.XX`)
