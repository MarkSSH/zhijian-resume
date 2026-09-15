# Built-in résumé presets

- `blank.json`: public default structure and style, with no personal information, photo or logo.
- `demo.json`: a fictional editable example. Every person, institution, project, publication and award is illustrative.

Presets are source files, tracked by Git. User documents are independent copies written to the ignored `data/` directory (or `ZHIJIAN_DATA_DIR`). Editing, deleting or restoring a user résumé never changes these files. A new install starts with an empty collection; choose a preset in the new résumé dialog.

Both files follow résumé schema version 6 and are checked by the same validation and migration module as imported documents. Keep examples fictional and keep assets either public with appropriate licenses or embedded in the example itself. Do not copy private résumé data into presets.
