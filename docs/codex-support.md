# Codex support

The toolbar displays Codex account quota separately from Claude Code quota and
session context remaining. While a Codex pane exists, Helm reads recent local
rollout `event_msg` / `token_count` rate-limit events every 30 seconds. It uses
`CODEX_HOME/sessions`, or `~/.codex/sessions` by default (USERPROFILE on Windows).
Only the five-hour and seven-day windows with known durations are displayed;
percentages represent remaining quota, and tooltips include reset times.

This does not call the account API or read authentication credentials. If no
usable event is present, quota stays hidden. Values reflect the latest available
record, so a CLI API response must have recorded quota before it can appear.
Reads inspect at most the last 512 KiB of each of the eight most recently
modified rollout files. Other model-specific limit IDs are excluded.

Codex approval and question menus are detected from the terminal. Plain-text
questions ending in `?` or `？` immediately above an idle composer also enter
waiting state, including when shortcut/context hints appear below the composer.
Questions remain distinct from approvals and do not expose one-click approval.
Busy terminal titles or the working indicator prevent incomplete prose questions
from being classified as waiting. OSC 9 notifications and terminal title signals
remain additional detection sources configured through Helm's integrations UI.
