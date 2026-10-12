<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep map geometry and stroke sampling in browser-safe pure helpers with unit tests, so continuous painting and territory contours can be verified independently of the UI.
- Preserve the existing local map format and merge defaults for added settings on load/import, so previous maps remain editable without a data migration.
- Fullscreen is progressive enhancement: request native fullscreen and orientation locking when supported, otherwise use a viewport-filling map with a visible exit control.
- UI text lives in per-language dictionaries in src/lib/i18n.ts, so every language stays complete and switchable at runtime.
- Maps store their tile size; tiles from coarser older grids are subdivided on load, so old maps keep working after grid changes.
