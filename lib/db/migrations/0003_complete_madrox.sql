DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_email_unique'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_email_unique" UNIQUE("email");
  END IF;
END $$;