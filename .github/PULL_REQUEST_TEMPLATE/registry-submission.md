## Plugin registry submission

<!--
For adding or updating an entry in registry/plugins.json.
For code/docs changes use the default template instead.
See registry/CONTRIBUTING.md for the full requirements.
-->

**Plugin:** <!-- name --> (`<!-- id, e.g. io.example.tasks -->`)
**Repository:** <!-- public git URL -->
**Submission type:** <!-- new listing / update existing entry / removal -->

## Requirements checklist

- [ ] My entry is a valid manifest — `pnpm test` passes (the `registry` suite validates every entry)
- [ ] `repository` is a **public** git URL
- [ ] The repository includes a `LICENSE` file
- [ ] `compatibility.minPlatformVersion` is a released version my plugin actually supports
- [ ] `id` is globally unique (reverse-DNS) and does not collide with an existing entry
- [ ] `name`, `description`, and `version` accurately describe the plugin
- [ ] I ran `pnpm format` (Prettier governs `plugins.json`) and did not reformat unrelated entries

## Notes

<!-- Anything a reviewer should know. Delete if not applicable. -->

---

<details>
<summary>External contributors</summary>

- [ ] I have read [CONTRIBUTING.md](../../CONTRIBUTING.md) in full. By ticking this box I agree to the Sovereign CLA — no separate form is required.

</details>
