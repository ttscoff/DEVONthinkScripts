# Shortcut: "Add Reminder"

Used by `TPK.actions.shortcutsReminder("Add Reminder")`. Build it in the Shortcuts app (Mac or iOS). It consists of two or three actions:

1. Receive *Text* input from *Run Shortcut* (Shortcut Input).
2. *(optional)* Split Text by *New Lines* → gives one reminder per task line.
3. Add New Reminder → Title = *Shortcut Input* (or *Split Text* item if you
   added step 2), List = `Actions` (or your list).

Name the shortcut exactly **Add Reminder** so the URL matches:

    shortcuts://run-shortcut?name=Add%20Reminder&input=text&text=<tasks>

The kit sends the task lines newline-joined, with the backlink appended as the last line, so it lands in the reminder title/notes and you can click straight back to the source document.

## Why a Shortcut instead of a Reminders URL scheme?

Apple Reminders has no documented public URL scheme for creating a reminder with arbitrary fields. Shortcuts is the supported, stable bridge. 

## Want write-back too?

Add a **Run Shell Script** action that calls your own CLI (e.g. the `reminder` tool) instead of *Add New Reminder*. Now the same button can both create the reminder *and* rewrite `@remind` → `@reminded(id)` in the file. See the "round-trip" section of the README. That's the full bidirectional setup without a custom URL-scheme handler.
