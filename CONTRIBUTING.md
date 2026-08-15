# Contributing

This repository is intentionally small and dependency-free.

1. Edit the preset files in the repository root.
2. Run `npm run verify`.
3. Test locally by installing the working copy:

   ```bash
   ./scripts/install.sh --force
   ```

4. Open a new DSH session with **Biomni (Anchored)** and exercise the
   Biomni tools.

Keep the Anchored bootstrap contract intact: request #1 must remain exactly
`bash` + `str_replace_editor`, and automatic context injection must stay
suppressed until promotion.
