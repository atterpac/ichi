# Keyboard interaction audit

The original failures came from competing keyboard models: actual browser focus,
list cursors, pane flags, and global shortcuts did not agree. Tested against the
rendered Vue app and mocked Git services, including keyboard-only browser walks.
Native desktop/WebKit and real Git mutations still need a manual smoke test.

| Surface | Finding | Implemented behavior |
| --- | --- | --- |
| Shell | Global navigation rejected every button target, including file/commit rows | Unconsumed navigation keys work from buttons; native Space/Enter activation remains intact |
| View navigation | Drilling into Changes/history lost the way back | Escape from the primary list returns to the previous view; graph selection is restored |
| Pane navigation | No universal way to enter or leave adjacent panes | F6 / Shift+F6 cycle visible panes, including from form fields; Tab remains native |
| Graph | Selecting a commit did not provide a clear inspector entry | l / Right / Enter enters the inspector; h / Left / Escape returns to graph |
| Working-tree inspector | File navigation had no enclosing return behavior | j/k selects files; l / Right / Enter reviews; h / Escape returns to graph |
| Commit inspector | Files lacked list motions | j/k selects/reveals files, including beyond the initial ten; l opens history; native Enter activates the file |
| Changes | Navigation keys collided with staging and control input | l / Right / Enter opens diff; modifiers and editable controls are guarded; c opens composer |
| Diff | Historical diff emitted an unhandled exit event | h / Left / Escape returns to its owning file list/history |
| Diff modes | Exit behavior differed by mode | Escape leaves line selection or editing first, then leaves the diff; F6 can move out and return to an active editor |
| Historical diff | Staging shortcuts were present without meaningful handlers | Explicit read-only mode disables staging/editing and removes their hints |
| Commit form | Adjacent panes were hard to reach | Escape returns to file list; F6 moves between panes; Ctrl/Cmd+Enter commits |
| Branches | Tab hid the inspector; l only expanded groups | Tab moves focus; i toggles inspector; l expands a group or enters details; h / Escape returns |
| Stashes | A separate pane flag disagreed with real DOM focus | l focuses details; actual focus updates routing; h / Escape returns; heatmap Enter does not restore files |
| Heatmaps | Every segment/file became another Tab stop | Selected map segment/file is the Tab stop; arrow keys move through the map |
| Resize controls | Changes divider only supported pointer drag | Left/Right resize, Home/End reach bounds; separator exposes accessible values |
| Context menus | Closing dropped the invoking keyboard focus | Closing restores the invoking control before an action opens another surface |
| Finder | Closing could leave focus blurred | Return focus to the invoking control; Ctrl/Cmd+P is available from pane controls |
| Settings/confirmations | Already use dialog focus management | Retain trapped Tab, Escape dismissal, and restoration to the invoking control; global pane navigation is blocked |

## Interaction rules

- Text inputs own text and editing keys. Modified chords must not execute bare-letter Git actions.
- Local widgets consume keys first. For example, Left changes an inspector tab or heatmap segment before it can leave the pane.
- Escape backs out one level: editor/selection → diff → file list → originating view. Search clears/exits before pane navigation.
- F6 is the reliable pane shortcut; Shift+F6 reverses it. It never opens or hides a pane.
- Tab/Shift+Tab traverse controls outside the finder. The finder retains its existing command-mode cycling with Tab and layered Escape behavior.
- Bare view letters remain context-sensitive: s stages inside Changes, while g returns to Graph. Ctrl+Space opens the view chooser from non-editable controls when Space belongs to a button.
- Current pane shortcuts and F6/Escape hints appear in the modeline. Pane focus rings remain removed per the design preference.

## Remaining design decisions

- Some navigation entries still lead to placeholder views (for example dedicated tags/remote surfaces); this audit does not implement those features.
- Branch checkout and stash apply/restore still retain their existing Enter actions. Consider a separate review/confirmation redesign if Enter should universally mean “inspect.”
- The finder is a custom keyboard-first palette rather than a conventional editable combobox; IME, screen-reader announcements, and native clipboard editing deserve a separate accessibility pass.
- Cache/view navigation currently remounts views. Returning restores the graph commit, but not every scroll offset, collapsed directory, or draft across view changes. Preserving those requires explicit per-repository view state.
