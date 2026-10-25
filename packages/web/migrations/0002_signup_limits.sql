-- Sign-ups per network per day, to slow down bulk account creation.
-- `bucket` is a hash of the IP, a secret and the day, so no address is stored and a bucket
-- cannot be linked across days.
CREATE TABLE signups (
  bucket TEXT PRIMARY KEY,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL
);
CREATE INDEX signups_day ON signups (day);
