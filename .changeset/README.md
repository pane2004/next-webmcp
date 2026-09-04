# Changesets

This folder holds pending release notes. Add one per user-visible library change:

```sh
pnpm dlx @changesets/cli add
```

or create `.changeset/<short-name>.md` with frontmatter `"next-webmcp": patch | minor | major` and a short
summary. See https://github.com/changesets/changesets.
