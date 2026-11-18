<!--
  agent-rules template. Claude Code reads CLAUDE.md, and the line "@AGENTS.md" imports
  AGENTS.md into it, so the rules live in one place. Add a "Claude Code specifics" section only
  when there is something Claude-specific to say; otherwise keep just the import.
  Delete this comment before saving.
-->

@AGENTS.md

## Claude Code specifics

- {{e.g. "Use plan mode for changes that touch the schema or billing."}}
- {{e.g. "Use the scratchpad for throwaway scripts; never commit generated reports."}}
- {{e.g. "Personal preferences go in CLAUDE.local.md (gitignored), not here."}}
