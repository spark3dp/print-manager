Spark Print Data
================

These files represent the contents of the print definition database.
Until such a time that the schema is finalized and the web service is
reliably hosting the database, the data will be kept here.

If you modify the data in a compatible way, increment the parameter
"print_definition_revision" in version.json.  If you modify the
database schema (you add or remove fields) in an incompatible way
with the rest of the system, increment the parameter
"print_definition_schema", and reset "print_definition_revision" to 1.
