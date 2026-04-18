-- Allow per-repo branch override for GitHub-hosted repos. NULL means the
-- repo's default branch (for GitHub) or ignored (for local paths).
ALTER TABLE repo ADD COLUMN branch TEXT;
